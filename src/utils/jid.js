'use strict';

/**
 * Strips a WhatsApp JID down to its bare digit string.
 * e.g. "2348012345678:12@s.whatsapp.net" -> "2348012345678"
 */
function jidToNumber(jid = '') {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0];
}

function isGroupJid(jid = '') {
  return jid.endsWith('@g.us');
}

function isStatusJid(jid = '') {
  return jid === 'status@broadcast';
}

module.exports = { jidToNumber, isGroupJid, isStatusJid };
