#!/usr/bin/env node
// Generates a standalone HTML test file for the reader CSS + JS
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Extract READER_CSS
const readerCssSrc = fs.readFileSync(path.join(root, 'src/utils/readerCss.ts'), 'utf8');
const cssStart = readerCssSrc.indexOf('export const READER_CSS = `') + 'export const READER_CSS = `'.length;
const cssEnd = readerCssSrc.lastIndexOf('`;\n');
const READER_CSS = readerCssSrc.slice(cssStart, cssEnd);

// Extract SEP_JS and unescape TypeScript template literal escapes
const jsSrc = fs.readFileSync(path.join(root, 'src/utils/injectedAssets.ts'), 'utf8');
const jsStart = jsSrc.indexOf('export const SEP_JS = `') + 'export const SEP_JS = `'.length;
const jsEnd = jsSrc.lastIndexOf('`;\n');
const rawJs = jsSrc.slice(jsStart, jsEnd);
// In TS template literals: \` → ` and \${ → ${
const SEP_JS = rawJs.split('\\`').join('`').split('\\${').join('${');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aristotle — SEP Reader Test</title>
<style>${READER_CSS}</style>
</head>
<body>
<div id="container">
  <div id="content">
    <div id="toc">
      <ul>
        <li><a href="#life">1. Life</a>
          <ul><li><a href="#works">1.1 Works</a></li></ul>
        </li>
        <li><a href="#logic">2. Logic</a></li>
        <li><a href="#bibliography">Bibliography</a></li>
      </ul>
    </div>
    <div id="article">
      <div id="article-content">
        <h1 class="pagetitle">Aristotle</h1>
        <div id="preamble">
          <p>First published Thu Sep 25, 2008; substantively revised Tue Aug 25, 2020</p>
          <p>Christopher Shields</p>
        </div>
        <div id="aueditable">
          <p>Aristotle (384–322 B.C.E.) numbers among the greatest philosophers of all time. Judged solely in terms of his philosophical influence, only Plato is his peer: Aristotle's works shaped centuries of philosophy from Late Antiquity through the Renaissance, and even today continue to be studied with keen, non-antiquarian interest.</p>

          <h2 id="life">1. Life</h2>
          <p>Aristotle was born in 384 B.C.E. in Stagira in northern Greece. Both of his parents were members of traditional medical families, and his father, Nicomachus, served as the court physician to the king of Macedon.</p>
          <p>When he was approximately seventeen or eighteen years old, he travelled to Athens to study in Plato's Academy, where he remained for about twenty years, until Plato's death in 347 B.C.E.</p>

          <h3 id="works">1.1 Works</h3>
          <p>The standard collection of Aristotle's works is the <em>Corpus Aristotelicum</em>. The <em>Nicomachean Ethics</em>, <em>Eudemian Ethics</em>, and <em>Politics</em> constitute his major practical works.</p>

          <blockquote>
            <p>The investigation of the truth is in one way hard, in another easy. An indication of this is found in the fact that no one is able to attain the truth adequately, while, on the other hand, no one fails entirely, but everyone says something true about the nature of things.</p>
          </blockquote>

          <h2 id="logic">2. Logic</h2>
          <p>Aristotle's logical works include the <em>Categories</em>, <em>On Interpretation</em>, <em>Prior Analytics</em>, <em>Posterior Analytics</em>, <em>Topics</em>, and <em>Sophistical Refutations</em>. These are collectively called the <em>Organon</em>, or instrument — reflecting the view that logic is a tool of inquiry rather than a part of philosophy itself.</p>

          <h2 id="bibliography">Bibliography</h2>
          <ol class="bibliography">
            <li>Ackrill, J.L., 1963, <em>Aristotle's Categories and De Interpretatione</em>, Oxford: Clarendon Press.</li>
            <li>Annas, J., 1993, <em>The Morality of Happiness</em>, Oxford: Oxford University Press.</li>
            <li>Barnes, J. (ed.), 1984, <em>The Complete Works of Aristotle</em>, 2 vols., Princeton: Princeton University Press.</li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</div>
<script>${SEP_JS}</script>
</body>
</html>`;

const out = path.join(__dirname, '..', '..', 'programming', 'stanford-encyclopedia-modern', 'sep_test.html');
fs.writeFileSync(out, html);
console.log('Written:', out);
console.log('CSS:', READER_CSS.length, 'chars, JS:', SEP_JS.length, 'chars');
console.log('Remaining \\` sequences:', (SEP_JS.match(/\\`/g) || []).length);
