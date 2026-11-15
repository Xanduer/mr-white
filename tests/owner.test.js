// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/* Copyright / ownership: page footer, safe rendering, and the set-owner script. */
process.env.PORT = '4595';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { server, ready } = require('../server');
const { renderIndex, esc } = require('../src/services/pageService');

const root = path.join(__dirname, '..');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

(async () => {
  await ready;

  // ---- the served home page carries the notice, with no template tokens left over ----
  const owner = JSON.parse(fs.readFileSync(path.join(root, 'owner.json'), 'utf8'));
  for (const url of ['/', '/index.html']) {
    const res = await fetch('http://localhost:4595' + url);
    const html = await res.text();
    assert.ok(res.ok, url + ' served');
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), 'no template tokens left in ' + url);
    assert.ok(html.includes('&copy; ' + owner.year + ' ' + esc(owner.name) + '. All rights reserved.'), 'visible footer notice');
    assert.ok(html.includes('<meta name="author" content="' + esc(owner.name) + '">'), 'author meta');
    const info = JSON.parse(html.match(/window\.GAME_INFO = (\{.*?\});<\/script>/)[1]);
    assert.strictEqual(info.owner, owner.name); assert.strictEqual(info.year, owner.year);
  }
  assert.ok((await (await fetch('http://localhost:4595/js/app.js')).text()).startsWith('// ©'), 'source files carry the notice');

  // ---- hostile names can neither inject HTML/JS nor break the page ----
  const template = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const evil = { name: '"><script>alert(1)</script> $& $1 </script>', year: 2026, contact: '<img src=x onerror=alert(1)>' };
  const out = renderIndex(template, evil);
  assert.ok(!out.includes('<script>alert(1)'), 'script tag in name is escaped');
  assert.ok(!out.includes('<img src=x'), 'html in contact is escaped');
  assert.ok(out.includes('$&amp;') || out.includes('$&'), 'dollar patterns are not treated as replacement syntax');
  const info = JSON.parse(out.match(/window\.GAME_INFO = (\{.*?\});<\/script>/)[1]);
  assert.strictEqual(info.owner, evil.name, 'JSON round-trips the exact name');

  // ---- set-owner on a throwaway copy: replaces (never duplicates) and keeps all code valid ----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrw-owner-'));
  fs.cpSync(root, tmp, { recursive: true, filter: s => !['node_modules', '.git'].includes(path.basename(s)) });
  const run = (...a) => execFileSync(process.execPath, [path.join(tmp, 'scripts', 'set-owner.js'), ...a], { cwd: tmp, encoding: 'utf8' });
  run('Ada Lovelace', '--contact', 'ada@example.com');
  run('Grace Hopper', '--year', '2027');
  const files = walk(tmp).filter(f => path.basename(f) !== 'owner.test.js'); // the test file itself names the test owners
  const text = f => fs.readFileSync(f, 'utf8');
  const stale = files.filter(f => /Ada Lovelace|ada@example\.com/.test(text(f)));
  assert.deepStrictEqual(stale, [], 'no file still mentions the previous owner or their contact: ' + stale.join(', '));
  assert.ok(/Copyright \(c\) 2027 Grace Hopper\. All rights reserved\./.test(text(path.join(tmp, 'LICENSE'))), 'LICENSE');
  const pkg = JSON.parse(text(path.join(tmp, 'package.json')));
  assert.strictEqual(pkg.author, 'Grace Hopper'); assert.strictEqual(pkg.license, 'UNLICENSED'); assert.strictEqual(pkg.private, true);
  assert.deepStrictEqual(JSON.parse(text(path.join(tmp, 'owner.json'))), { name: 'Grace Hopper', year: 2027, contact: '' });
  assert.ok(/Grace Hopper/.test(text(path.join(tmp, 'README.md'))), 'README ownership section');
  const code = files.filter(f => /\.(js|css)$/.test(f));
  assert.ok(code.length >= 20, 'checked ' + code.length + ' source files');
  for (const f of code) {
    const lines = text(f).split('\n');
    assert.ok(/^(\/\/|\/\*) © 2027 Grace Hopper\. All rights reserved\./.test(lines[0]), 'notice on first line of ' + path.relative(tmp, f));
    assert.ok(!/© \d{4}/.test(lines[1] || ''), 'notice not duplicated in ' + path.relative(tmp, f));
    if (f.endsWith('.js')) execFileSync(process.execPath, ['--check', f]); // still valid JavaScript
  }
  // keeping the same name keeps its contact; hostile names are sanitized so they cannot break comments or code
  run('Grace Hopper', '--contact', 'grace@example.com'); run('Grace Hopper');
  assert.strictEqual(JSON.parse(text(path.join(tmp, 'owner.json'))).contact, 'grace@example.com', 'same name keeps its contact');
  run('Evil */ <b>Name</b> -- x');
  for (const f of code) {
    const first = text(f).split('\n')[0];
    assert.ok(!/[<>]/.test(first), 'no angle brackets in notice of ' + path.basename(f));
    if (f.endsWith('.css')) assert.strictEqual((first.match(/\*\//g) || []).length, 1, 'CSS comment closes exactly once');
    if (f.endsWith('.js')) execFileSync(process.execPath, ['--check', f]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('OWNER TESTS PASSED');
  server.close(); process.exit(0);
})().catch(err => { console.error('TEST FAILED:', err.message); process.exit(1); });
