#!/usr/bin/env node
// Downloads InPhO idea + thinker indexes into dev-seeds/ for simulator injection.
// Run once (or to refresh): node scripts/fetch-dev-seeds.js
// Then push into the simulator:  bash scripts/inject-dev-seeds.sh

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'dev-seeds');
const BASE = 'https://www.inphoproject.org';
const UA = 'Nous/0.3 (SEP reader dev seed; +https://github.com/112345brian/sep-reader)';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of ['idea', 'thinker']) {
    process.stdout.write(`Fetching ${name}.json ... `);
    const body = await get(`${BASE}/${name}.json`);
    const dest = path.join(OUT, `inpho-${name}.json`);
    fs.writeFileSync(dest, body);
    console.log(`done (${(body.length / 1024).toFixed(0)} KB)`);
  }
  console.log('\nSeeds written to dev-seeds/');
  console.log('Next: bash scripts/inject-dev-seeds.sh');
}

main().catch(e => { console.error(e.message); process.exit(1); });
