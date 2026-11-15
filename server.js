// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const apiRoutes = require('./src/routes/api');
const registerSockets = require('./src/sockets');
const db = require('./src/config/db');
const owner = require('./src/config/owner');
const { renderIndex } = require('./src/services/pageService');

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);
// The home page is rendered with the owner's name / copyright notice filled in.
const indexHtml = renderIndex(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'), owner);
app.get(['/', '/index.html'], (req, res) => res.type('html').send(indexHtml));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);
registerSockets(io);

const PORT = process.env.PORT || 3000;
const ready = db.init().then(() => new Promise(resolve => server.listen(PORT, () => {
  console.log(`MR. WHITE is running on http://localhost:${PORT}`);
  console.log(`(c) ${owner.year} ${owner.name}. All rights reserved.`);
  if (owner.isPlaceholder) console.warn('[owner] Your name is not set yet. Run:  node scripts/set-owner.js "Your Name"');
  resolve();
})));

module.exports = { server, ready };
