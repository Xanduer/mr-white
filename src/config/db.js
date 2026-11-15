// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

let pool = null;
const getPool = () => pool;

async function init() {
  if (!process.env.DB_HOST) {
    console.log('[db] DB_HOST not set - running without MySQL persistence.');
    return;
  }
  const name = process.env.DB_NAME || 'mr_white';
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    console.warn('[db] Invalid DB_NAME - persistence disabled.');
    return;
  }
  try {
    const base = {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    };
    const boot = await mysql.createConnection(base);
    await boot.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
    await boot.end();
    pool = mysql.createPool({ ...base, database: name, waitForConnections: true, connectionLimit: 10 });
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
    console.log(`[db] Connected to MySQL database "${name}".`);
  } catch (err) {
    pool = null;
    console.warn('[db] MySQL unavailable - persistence disabled:', err.message);
  }
}

module.exports = { init, getPool };
