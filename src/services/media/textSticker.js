'use strict';

const fs = require('fs');
const path = require('path');
const { runFfmpeg } = require('./ffmpegRunner');
const { MediaError } = require('./errors');
const { makeTempPath, cleanupTempFile } = require('../downloaders/tempFile');

/**
 * Renders text into a 512x512 WhatsApp sticker using the ffmpeg that is
 * already required elsewhere in this project — no image library, no new
 * dependency.
 *
 * Emoji render only as well as the installed fonts allow: if a colour emoji
 * font (Noto Color Emoji / Symbola) is present, ffmpeg's drawtext picks it
 * up through fontconfig. When it isn't, the glyph falls back to a box
 * rather than failing the whole command.
 */

const SIZE = 512;
const MAX_LINES = 8;
const MAX_TEXT = 200;

// Preferred fonts in order, across Linux/macOS/Windows default installs.
const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/calibrib.ttf',
  'C:/Windows/Fonts/tahomabd.ttf',
];

let cachedFont;

function findFont() {
  if (cachedFont !== undefined) return cachedFont;
  cachedFont = FONT_CANDIDATES.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) || null;
  return cachedFont;
}

/**
 * ffmpeg's filter-graph syntax splits option strings on unescaped ':', and
 * a Windows path like C:/Windows/Fonts/arialbd.ttf has one right after the
 * drive letter. Backslash-escaping that colon (fontfile=C\:/...) is the
 * commonly cited fix, but it is genuinely unreliable across ffmpeg builds —
 * it parses fine on some versions and fails with "Error parsing a filter
 * description" on others (this is a long-standing, still-open quirk in
 * ffmpeg's drawtext/filtergraph parser, not a mistake in how it's escaped).
 *
 * The robust fix is to never put the colon in the argument at all: ffmpeg
 * is run with its working directory set to the font's own folder, and only
 * the bare filename is given to fontfile=. No drive letter, no colon,
 * nothing left for any ffmpeg version's parser to disagree about.
 */

/**
 * Greedy word wrap by character budget. Width is estimated, not measured —
 * a real text-metrics pass would mean pulling in a font library for a
 * sticker command, which is not a trade worth making.
 */
function wrap(text, maxCharsPerLine) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if ([...candidate].length > maxCharsPerLine && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines.filter((l) => l !== '' || lines.length === 1).slice(0, MAX_LINES);
}

/**
 * drawtext has its own mini-language; a raw apostrophe or colon in user
 * text would otherwise break the filter string (or worse, be read as
 * filter syntax).
 */
function escapeDrawText(value) {
  return value
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\\\\\'")
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Chooses a font size that fits the longest line and the line count inside
 * the 512px square, then centres the block vertically.
 */
function layout(lines) {
  const longest = Math.max(...lines.map((l) => [...l].length), 1);
  // 0.55 is roughly the average advance width of a bold sans glyph.
  const byWidth = Math.floor((SIZE - 48) / (longest * 0.55));
  const byHeight = Math.floor((SIZE - 48) / (lines.length * 1.35));
  const fontSize = Math.max(22, Math.min(110, byWidth, byHeight));
  const lineHeight = Math.round(fontSize * 1.3);
  const blockHeight = lineHeight * lines.length;
  const startY = Math.round((SIZE - blockHeight) / 2);
  return { fontSize, lineHeight, startY };
}

/**
 * @param {string} text
 * @returns {Promise<Buffer>} webp sticker bytes
 */
async function renderTextSticker(text) {
  const input = String(text || '').trim();
  if (!input) throw new MediaError('Give me some text to turn into a sticker.', 'FAILED');
  if ([...input].length > MAX_TEXT) {
    throw new MediaError(`That's too long for a sticker (limit ${MAX_TEXT} characters).`, 'FAILED');
  }

  const lines = wrap(input, 18);
  const { fontSize, lineHeight, startY } = layout(lines);

  const fontFile = findFont();
  if (!fontFile) {
    // Most ffmpeg builds — including the common Windows static builds —
    // are not compiled with fontconfig, so drawtext's "font=" name lookup
    // silently isn't available on them. Failing clearly here beats a
    // filter that errors out deep inside ffmpeg with an unhelpful message.
    throw new MediaError(
      'No usable font was found on this machine for making stickers. Install a TrueType font (e.g. DejaVu Sans) and try again.',
      'TOOL_MISSING'
    );
  }
  const fontDir = path.dirname(fontFile);
  const fontOption = `fontfile=${escapeDrawText(path.basename(fontFile))}`;

  const drawFilters = lines.map((line, i) => {
    const y = startY + i * lineHeight;
    return [
      'drawtext=',
      `${fontOption}:`,
      `text='${escapeDrawText(line)}':`,
      `fontsize=${fontSize}:`,
      'fontcolor=white:',
      'borderw=4:bordercolor=black@0.85:',
      'x=(w-text_w)/2:',
      `y=${y}`,
    ].join('');
  });

  const outputPath = makeTempPath('.webp');

  try {
    await runFfmpeg(
      [
        '-f', 'lavfi',
        '-i', `color=c=black@0.0:s=${SIZE}x${SIZE}:d=1,format=rgba`,
        '-vf', drawFilters.join(','),
        '-frames:v', '1',
        '-c:v', 'libwebp',
        '-lossless', '1',
        '-preset', 'default',
        '-an',
        outputPath,
      ],
      // cwd = the font's own folder, so fontfile= above can be a bare
      // filename with no drive letter or colon in it anywhere — see the
      // comment above escapeDrawText/FONT_CANDIDATES for why that matters.
      { cwd: fontDir }
    );

    return fs.readFileSync(outputPath);
  } finally {
    cleanupTempFile(outputPath);
  }
}

module.exports = { renderTextSticker };
