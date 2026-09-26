'use strict';

/**
 * A 3x5 bitmap font, one hex nibble-ish string per glyph: five rows of
 * three bits, written as '111','101',... and packed into a single string
 * of 15 characters. Small enough to keep inline, which beats adding a
 * figlet dependency for one command.
 */
const GLYPHS = {
  A: '111101111101101',
  B: '110101110101110',
  C: '111100100100111',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '111100101101111',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101111',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '111101101101111',
  P: '111101111100100',
  Q: '111101101111011',
  R: '111101110101101',
  S: '111100111001111',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  0: '111101101101111',
  1: '010110010010111',
  2: '111001111100111',
  3: '111001111001111',
  4: '101101111001001',
  5: '111100111001111',
  6: '111100111101111',
  7: '111001001001001',
  8: '111101111101111',
  9: '111101111001111',
  '?': '111001011000010',
  '!': '010010010000010',
  '.': '000000000000010',
  ',': '000000000010100',
  '-': '000000111000000',
  '+': '000010111010000',
  ':': '000010000010000',
  "'": '010010000000000',
  ' ': '000000000000000',
};

const ON = '█';
const OFF = ' ';
const MAX_CHARS = 12;

/**
 * @param {string} text
 * @returns {string} five lines of block characters
 */
function toAsciiArt(text) {
  const chars = [...String(text).toUpperCase()]
    .filter((ch) => GLYPHS[ch] !== undefined)
    .slice(0, MAX_CHARS);

  if (chars.length === 0) {
    throw new Error('Nothing in there can be drawn — letters, digits and basic punctuation only.');
  }

  const rows = ['', '', '', '', ''];
  for (const ch of chars) {
    const bits = GLYPHS[ch];
    for (let r = 0; r < 5; r += 1) {
      const slice = bits.slice(r * 3, r * 3 + 3);
      rows[r] += [...slice].map((b) => (b === '1' ? ON : OFF)).join('') + OFF;
    }
  }

  return rows.join('\n');
}

module.exports = { toAsciiArt, MAX_CHARS };
