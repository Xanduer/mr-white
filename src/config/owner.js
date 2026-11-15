// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/**
 * Single source of truth for who owns this game. Edit it with:
 *   node scripts/set-owner.js "Your Name" --contact "you@example.com"
 */
const fs = require('fs');
const path = require('path');

const PLACEHOLDER = 'YOUR NAME HERE';

function load() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../owner.json'), 'utf8')); } catch (err) { /* use defaults */ }
  const name = String(raw.name || PLACEHOLDER).replace(/[\r\n]+/g, ' ').replace(/--+/g, '-').trim().slice(0, 80) || PLACEHOLDER;
  const year = Number.isInteger(raw.year) ? raw.year : new Date().getFullYear();
  const contact = String(raw.contact || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  return { name, year, contact, isPlaceholder: name === PLACEHOLDER };
}

module.exports = Object.assign(load(), { PLACEHOLDER, load });
