#!/usr/bin/env node
'use strict';
// smoke test of the /api/v2/trades/pre-check route contract
const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(path, 'http://127.0.0.1:3001');
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function main() {
  const calls = [
    { label: 'valid trade', body: { trade: { symbol: 'TCS', side: 'BUY', quantity: 10 } }, expectStatus: 200 },
    { label: 'missing trade', body: {}, expectStatus: 400 },
    { label: 'no body', body: null, expectStatus: 400 }
  ];
  for (const c of calls) {
    try {
      const res = await post('/api/v2/trades/pre-check', c.body || {});
      const ok = res.status === c.expectStatus;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.label}  status=${res.status} expect=${c.expectStatus}`);
      if (!ok) console.log('   body:', JSON.stringify(res.body).slice(0, 220));
    } catch (e) {
      console.log(`FAIL  ${c.label}  error=${e.message.slice(0, 200)}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
