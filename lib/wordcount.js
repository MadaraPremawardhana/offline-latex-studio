// H4: a texcount-style word count that ignores commands, comments and math, with
// a breakdown by role so "excluding the abstract/appendices" is a real option later.
const fs = require('fs');
const path = require('path');

function stripLatex(src) {
  return src
    .replace(/%.*$/gm, '')
    .replace(/\\(begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/[{}]/g, ' ');
}
function countWords(text) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.length;
}
function headingWords(src) {
  const m = src.match(/\\(?:section|subsection|subsubsection|chapter|title)\*?\{([^}]*)\}/g) || [];
  return countWords(m.map(s => s.replace(/\\[a-zA-Z]+\*?\{|\}$/g, '')).join(' '));
}
function captionWords(src) {
  const m = src.match(/\\caption\{([^}]*)\}/g) || [];
  return countWords(m.map(s => s.replace(/\\caption\{|\}$/g, '')).join(' '));
}

function count(root, mainFile) {
  const seen = new Set();
  let body = '', headings = 0, captions = 0;
  (function expand(file) {
    const full = path.join(root, file);
    if (!fs.existsSync(full) || seen.has(full)) return;
    seen.add(full);
    const src = fs.readFileSync(full, 'utf8');
    headings += headingWords(src);
    captions += captionWords(src);
    body += stripLatex(src) + ' ';
    const inputs = [...src.matchAll(/\\(?:input|include)\{([^}]*)\}/g)];
    for (const [, rel] of inputs) expand(rel.endsWith('.tex') ? rel : rel + '.tex');
  })(mainFile);
  return { mainText: countWords(body), headings, captions, total: countWords(body) };
}

module.exports = { count };
