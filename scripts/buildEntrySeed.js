#!/usr/bin/env node
// Run: node scripts/buildEntrySeed.js
// Fetches https://plato.stanford.edu/contents.html and generates entry-seed.json
// Two-pass parse: parent groups first (to prefix sub-entries), then standalone entries.

const https = require('https');
const fs = require('fs');
const path = require('path');

// Named HTML entities for accented/special characters common in philosopher names
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', aring: 'å', aelig: 'æ',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', ccedil: 'ç', szlig: 'ß', yacute: 'ý',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Ouml: 'Ö', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Ccedil: 'Ç', Yacute: 'Ý',
  // Typographic
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', middot: '·',
  laquo: '«', raquo: '»', bull: '•', prime: '′',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '');
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetch(res.headers.location));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching https://plato.stanford.edu/contents.html ...');
  const html = await fetch('https://plato.stanford.edu/contents.html');
  console.log(`Got ${(html.length / 1024).toFixed(0)} KB`);

  const entries = [];
  const seen = new Set();

  // Pass 1: parent groups — <li> HEADER \n <ul> children </ul>
  // The header may be plain text OR a linked entry (<a href="entries/slug/"><strong>...</strong></a>)
  const parentGroupRe = /<li>\s*([^\n]+)\n\s*<ul>([\s\S]*?)<\/ul>/g;
  let m;
  while ((m = parentGroupRe.exec(html)) !== null) {
    const header = m[1].trim();
    const subHtml = m[2];

    // Extract the display label from the header
    const strongM = header.match(/<strong>([^<]+)<\/strong>/);
    const rawLabel = strongM ? strongM[1].trim() : stripTags(header).trim();
    const parentLabel = decodeEntities(rawLabel);
    if (!parentLabel) continue;

    // If the header is itself a linked entry, add it as a standalone
    const parentLinkM = header.match(/href="entries\/([a-z0-9-]+)\/"/);
    if (parentLinkM && !seen.has(parentLinkM[1])) {
      seen.add(parentLinkM[1]);
      entries.push({ slug: parentLinkM[1], title: parentLabel });
    }

    // Add sub-entries with the parent prefix
    const subRe = /href="entries\/([a-z0-9-]+)\/"><strong>([^<]+)<\/strong>/g;
    let sub;
    while ((sub = subRe.exec(subHtml)) !== null) {
      const slug = sub[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      entries.push({ slug, title: `${parentLabel}: ${decodeEntities(sub[2].trim())}` });
    }
  }

  // Pass 2: standalone entries not captured by any parent group
  const standaloneRe = /href="entries\/([a-z0-9-]+)\/"><strong>([^<]+)<\/strong>/g;
  while ((m = standaloneRe.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({ slug, title: decodeEntities(m[2].trim()) });
  }

  entries.sort((a, b) => a.title.localeCompare(b.title));

  const outPath = path.join(__dirname, '../src/assets/entry-seed.json');
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf8');
  console.log(`Wrote ${entries.length} entries to src/assets/entry-seed.json`);

  // Check for suspicious truncations (entity decode failures)
  const suspicious = entries.filter(e => /&[a-z]+;|&#\d+;/i.test(e.title));
  if (suspicious.length > 0) {
    console.warn(`WARNING: ${suspicious.length} entries still have raw entities:`);
    suspicious.slice(0, 5).forEach(e => console.warn(' ', e.title));
  } else {
    console.log('Entity decoding looks clean — no raw entities found.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
