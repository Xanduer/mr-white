// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/** Fills the owner details into public/index.html. Everything inserted is escaped. */
const esc = s => String(s).replace(/[&<>"\']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderIndex(template, owner) {
  const info = { owner: owner.name, year: owner.year, contact: owner.contact || '' };
  const json = JSON.stringify(info)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  // Function replacers so "$" characters in a name are never treated as special patterns.
  return template
    .replace(/\{\{GAME_INFO\}\}/g, () => json)
    .replace(/\{\{OWNER\}\}/g, () => esc(owner.name))
    .replace(/\{\{YEAR\}\}/g, () => String(owner.year))
    .replace(/\{\{CONTACT\}\}/g, () => (owner.contact ? ' &middot; ' + esc(owner.contact) : ''));
}

module.exports = { renderIndex, esc };
