// S1-S4, L1-L4, B1, D1, D4(path only)/D9/D10 support, H1/H3/H4: local accounts, settings,
// the recent-projects registry, the file tree, local version history, and zip export.
// Everything here lives under Electron's userData folder — nothing leaves the machine.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function dataDir() {
  const dir = app ? app.getPath('userData') : path.join(__dirname, '..', 'userdata');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function dbPath(name) { return path.join(dataDir(), name + '.json'); }
function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(dbPath(name), 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(name, data) { fs.writeFileSync(dbPath(name), JSON.stringify(data, null, 2)); }

// ---------- S1/S4: local accounts (email + password, hashed; no SSO secrets live here) ----------
function hash(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return { salt, derived };
}
function signUp({ email, password }) {
  const users = readJSON('users', {});
  if (users[email]) return { ok: false, message: 'An account with that email already exists.' };
  const { salt, derived } = hash(password);
  users[email] = { email, salt, derived, createdAt: Date.now() };
  writeJSON('users', users);
  writeJSON('session', { email });
  return { ok: true, email };
}
function signIn({ email, password }) {
  const users = readJSON('users', {});
  const u = users[email];
  if (!u) return { ok: false, message: 'No account with that email yet. Try Sign up instead.' };
  const { derived } = hash(password, u.salt);
  if (derived !== u.derived) return { ok: false, message: 'Wrong password.' };
  writeJSON('session', { email });
  return { ok: true, email };
}
function currentUser() { return readJSON('session', null); }
function signOut() { writeJSON('session', null); return { ok: true }; }

// ---------- G1-G4: settings ----------
const DEFAULT_SETTINGS = {
  engine: 'pdflatex', useLatexmk: true, shellEscape: false, timeoutSec: 60,
  theme: 'system', editorFont: 'Consolas', editorFontSize: 13, texBin: null, storageMode: null
};
function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, readJSON('settings', {})); }
function setSetting(key, value) { const s = getSettings(); s[key] = value; writeJSON('settings', s); return s; }
function setStorageMode(mode) { return setSetting('storageMode', mode); }

// ---------- B1: recent projects ----------
function recentProjects() {
  const list = readJSON('projects', []);
  return list.filter(p => fs.existsSync(p.root)).sort((a, b) => b.lastOpened - a.lastOpened);
}
function registerProject(root, name) {
  const list = readJSON('projects', []);
  const existing = list.find(p => p.root === root);
  const mainFile = fs.existsSync(path.join(root, 'main.tex')) ? 'main.tex' : firstTexFile(root);
  const entry = existing || { root, name: name || path.basename(root), mainFile, pinned: false };
  entry.lastOpened = Date.now();
  entry.mainFile = entry.mainFile || mainFile;
  const next = list.filter(p => p.root !== root);
  next.push(entry);
  writeJSON('projects', next);
  return entry;
}
function firstTexFile(root) {
  const found = (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== '.git' && e.name !== '.history') { const r = walk(full); if (r) return r; }
      else if (e.name.endsWith('.tex')) return path.relative(root, full);
    }
    return null;
  })(root);
  return found || 'main.tex';
}

// ---------- D1: file tree ----------
function fileTree(root) {
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !['.git', '.history', 'node_modules'].includes(e.name))
      .sort((a, b) => (a.isDirectory() === b.isDirectory()) ? a.name.localeCompare(b.name) : (a.isDirectory() ? -1 : 1))
      .map(e => {
        const full = path.join(dir, e.name);
        return e.isDirectory()
          ? { type: 'dir', name: e.name, path: full, children: walk(full) }
          : { type: 'file', name: e.name, path: full };
      });
  }
  return walk(root);
}
function newFile(root, relPath) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (!fs.existsSync(full)) fs.writeFileSync(full, relPath.endsWith('.tex') ? '% new file\n' : '');
  return full;
}
function copyIntoFigures(root, srcFile) {
  const figDir = path.join(root, 'figures');
  if (!fs.existsSync(figDir)) fs.mkdirSync(figDir, { recursive: true });
  const dest = path.join(figDir, path.basename(srcFile));
  fs.copyFileSync(srcFile, dest);
  return path.relative(root, dest).replace(/\\/g, '/');
}

// ---------- H1: local version history (offline mode — same file, browsable snapshots) ----------
function historyDir(root) {
  const dir = path.join(root, '.history');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function historyList(root) {
  const file = path.join(historyDir(root), 'index.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
}
function historySnapshot(root, label) {
  const dir = historyDir(root);
  const id = String(Date.now());
  const snapDir = path.join(dir, id);
  fs.mkdirSync(snapDir, { recursive: true });
  copyProjectInto(root, snapDir);
  const indexFile = path.join(dir, 'index.json');
  const list = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
  list.unshift({ id, label: label || 'Autosave', at: Date.now() });
  fs.writeFileSync(indexFile, JSON.stringify(list.slice(0, 200), null, 2));
  return { id, label: label || 'Autosave' };
}
function historyRestore(root, versionId) {
  const snapDir = path.join(historyDir(root), versionId);
  if (!fs.existsSync(snapDir)) return { ok: false, message: 'That version was not found.' };
  copyProjectInto(snapDir, root, true);
  return { ok: true };
}
function copyProjectInto(src, dest, overwrite) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (['.git', '.history', 'node_modules'].includes(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyProjectInto(s, d, overwrite); }
    else fs.copyFileSync(s, d);
  }
}

// ---------- H3: export project source as .zip ----------
async function exportZip(root, outPath) {
  const archiver = require('archiver');
  const output = fs.createWriteStream(outPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(outPath));
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*', { cwd: root, ignore: ['.git/**', '.history/**', '*.pdf', '*.aux', '*.log', '*.toc', '*.out'] });
    archive.finalize();
  });
}

module.exports = {
  signUp, signIn, currentUser, signOut,
  getSettings, setSetting, setStorageMode,
  recentProjects, registerProject,
  fileTree, newFile, copyIntoFigures,
  historyList, historySnapshot, historyRestore,
  exportZip
};
