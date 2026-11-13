// F1/F2/F5: a small .bib reader/writer — enough to list, search, add and import entries
// without hand-editing BibTeX syntax. (F4 DOI lookup needs a connection; see README.)
const fs = require('fs');
const path = require('path');

function bibPath(root) {
  const existing = fs.readdirSync(root).find(f => f.endsWith('.bib'));
  return path.join(root, existing || 'refs.bib');
}

function parse(text) {
  const entries = [];
  const re = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(text))) {
    const [, type, key, body] = m;
    const fields = {};
    const fieldRe = /(\w+)\s*=\s*[{"]([^}"]*)[}"]\s*,?/g;
    let fm;
    while ((fm = fieldRe.exec(body))) fields[fm[1].toLowerCase()] = fm[2];
    entries.push({ type: type.toLowerCase(), key: key.trim(), ...fields });
  }
  return entries;
}

function toBibTeX(entry) {
  const { type, key, ...fields } = entry;
  const body = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${type}{${key},\n${body}\n}\n`;
}

function list(root) {
  const file = bibPath(root);
  if (!fs.existsSync(file)) return [];
  return parse(fs.readFileSync(file, 'utf8'));
}

function save(root, entry) {
  const file = bibPath(root);
  const entries = fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : [];
  const idx = entries.findIndex(e => e.key === entry.key);
  if (idx >= 0) entries[idx] = entry; else entries.push(entry);
  fs.writeFileSync(file, entries.map(toBibTeX).join('\n'));
  return entries;
}

function importFile(root, srcFile) {
  const file = bibPath(root);
  const incoming = parse(fs.readFileSync(srcFile, 'utf8'));
  const existing = fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : [];
  const keys = new Set(existing.map(e => e.key));
  const merged = existing.concat(incoming.filter(e => !keys.has(e.key)));
  fs.writeFileSync(file, merged.map(toBibTeX).join('\n'));
  return { added: incoming.filter(e => !keys.has(e.key)).length, total: merged.length };
}

module.exports = { list, save, importFile, parse, toBibTeX };
