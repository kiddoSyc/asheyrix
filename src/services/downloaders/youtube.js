'use strict';

const { buildYtDlpProvider } = require('./ytdlpProviderFactory');

// Video capped at 480p to keep file sizes reasonable for WhatsApp delivery —
// requires ffmpeg on PATH to mux separate video+audio streams.
// Audio extraction to mp3 also requires ffmpeg.
module.exports = buildYtDlpProvider({
  domains: ['youtube.com', 'youtu.be', 'music.youtube.com'],
  videoFormatArgs: ['-f', 'bv*[height<=480]+ba/b[height<=480]/best'],
  audioFormatArgs: ['-f', 'bestaudio', '-x', '--audio-format', 'mp3'],
});
