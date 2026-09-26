'use strict';

/**
 * Errors the PDF layer raises. Same contract as MediaError and AiError:
 * every `.message` here is safe to show a user verbatim, so command files
 * can print it without sanitising. Anything containing a file path, a
 * stack, or upstream tool output gets logged instead and replaced with a
 * generic message.
 */
class PdfError extends Error {
  constructor(message, code = 'FAILED') {
    super(message);
    this.name = 'PdfError';
    // 'TOOL_MISSING' | 'FAILED' | 'TIMEOUT' | 'NOT_A_PDF' | 'TOO_LARGE'
    // | 'ENCRYPTED' | 'NO_TEXT' | 'BAD_RANGE'
    this.code = code;
  }
}

module.exports = { PdfError };
