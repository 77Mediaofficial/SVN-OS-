#!/usr/bin/env node
/* Tiny static dev server with SPA fallback — zero dependencies.
   Serves the repo root; unknown paths fall back to index.html so
   deep links like /calendar work, exactly like vercel.json in prod.

   Usage: node scripts/dev-server.mjs [port]   (default 4173) */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.includes('..')) { res.writeHead(400); res.end('Bad request'); return; }

    let filePath = join(root, pathname);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(root, 'index.html'); // SPA fallback
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
}).listen(port, () => {
  console.log(`SVN OS dev server → http://localhost:${port}`);
});
