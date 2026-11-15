// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/**
 * Sets (or changes) the copyright owner everywhere in one go:
 *   node scripts/set-owner.js "Your Name"
 *   node scripts/set-owner.js "Your Name" --contact "you@example.com" --year 2026
 *
 * Updates: owner.json (used for the page footer and the "Created by" line), LICENSE, package.json,
 * the Copyright section of README.md, and the notice on the first line of every .js and .css file.
 * Safe to run again with a different name: existing notices are replaced, never duplicated.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const clean = s => String(s == null ? '' : s)
  .replace(/[\r\n]+/g, ' ').replace(/\*\//g, '').replace(/--+/g, '-').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

const args = process.argv.slice(2);
let name = null, contact, year;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--contact') contact = args[++i];
  else if (args[i] === '--year') year = parseInt(args[++i], 10);
  else if (name === null) name = args[i];
}
name = clean(name);
if (!name) {
  console.error('Usage: node scripts/set-owner.js "Your Name" [--contact "you@example.com"] [--year 2026]');
  process.exit(1);
}

// ---- owner.json ----
const ownerPath = path.join(root, 'owner.json');
let prev = {};
try { prev = JSON.parse(fs.readFileSync(ownerPath, 'utf8')); } catch (err) { /* first run */ }
const owner = {
  name,
  year: Number.isInteger(year) ? year : (Number.isInteger(prev.year) ? prev.year : new Date().getFullYear()),
  // An omitted --contact is kept only while the name stays the same; a new name never inherits the old contact.
  contact: contact === undefined ? (prev.name === name ? (prev.contact || '') : '') : clean(contact)
};
fs.writeFileSync(ownerPath, JSON.stringify(owner, null, 2) + '\n');

// ---- LICENSE ----
fs.writeFileSync(path.join(root, 'LICENSE'), `Copyright (c) ${owner.year} ${owner.name}. All rights reserved.

MR. WHITE (the "Software"), including its source code, text, design and documentation,
is proprietary and is the original work of the copyright holder named above.

No licence or permission is granted to copy, modify, merge, publish, distribute,
sublicense, sell, host, or otherwise reuse the Software or any substantial part of it,
or to present it as your own work, without prior written permission from the
copyright holder.

Players may use the hosted game for its intended purpose: playing the game.

Third-party libraries used by the Software (for example Express, Socket.IO, mysql2
and dotenv) remain under their own licences.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE USE OF THE SOFTWARE.
`);

// ---- package.json ----
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.author = owner.name;
pkg.license = 'UNLICENSED';
pkg.private = true; // also prevents an accidental "npm publish"
if (pkg.scripts) pkg.scripts['set-owner'] = 'node scripts/set-owner.js';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ---- README ----
const readmePath = path.join(root, 'README.md');
if (fs.existsSync(readmePath)) {
  const block = `<!-- owner:start -->\n(c) ${owner.year} ${owner.name}${owner.contact ? ' (' + owner.contact + ')' : ''}. All rights reserved. See LICENSE.\n<!-- owner:end -->`;
  const readme = fs.readFileSync(readmePath, 'utf8');
  if (/<!-- owner:start -->[\s\S]*?<!-- owner:end -->/.test(readme)) {
    fs.writeFileSync(readmePath, readme.replace(/<!-- owner:start -->[\s\S]*?<!-- owner:end -->/, () => block));
  }
}

// ---- notice on the first line of every .js / .css file ----
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
const NOTICE = /^(?:\/\/|\/\*) © \d{4} .* All rights reserved\./;
let touched = 0;
for (const file of walk(root, [])) {
  const src = fs.readFileSync(file, 'utf8');
  const first = src.split('\n', 1)[0];
  const body = NOTICE.test(first) ? src.slice(first.length + 1) : src;
  const text = `© ${owner.year} ${owner.name}. All rights reserved. Proprietary software, see LICENSE.`;
  const header = file.endsWith('.css') ? `/* ${text} */` : `// ${text}`;
  fs.writeFileSync(file, header + '\n' + body);
  touched++;
}

console.log(`Owner set to: ${owner.name} (${owner.year})${owner.contact ? ', contact: ' + owner.contact : ''}`);
console.log(`Updated owner.json, LICENSE, package.json, README.md and ${touched} source files.`);
console.log('Restart the server for the page footer to show the new name.');
