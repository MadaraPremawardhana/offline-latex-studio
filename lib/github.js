// L2, H6, H7: every project gets its own private GitHub repository, created automatically.
// Each save uploads the project as a commit on a uniquely named branch and merges it into
// main — unless that would conflict, in which case a pull request is opened instead.
//
// Talks to GitHub's REST API directly, so nothing needs Git installed on this computer.
// Authenticates with a Personal Access Token the user pastes in once (see README); the token
// lives only in this app's local settings file and is sent only to api.github.com.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const storage = require('./storage');

const API = process.env.OLS_GITHUB_API || 'https://api.github.com'; // overridable so tests can use a stand-in server
const MARKER = 'Created by Offline LaTeX Studio';
const SKIP_DIRS = ['.git', '.history', 'node_modules'];
const SKIP_EXT = ['.aux', '.log', '.toc', '.out', '.bbl', '.bcf', '.blg', '.fls', '.fdb_latexmk', '.synctex.gz', '.run.xml', '.pdf'];

async function gh(method, url, body) {
  const token = storage.getSettings().githubToken;
  let r;
  try {
    r = await fetch(API + url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'offline-latex-studio', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    const err = new Error('Could not reach GitHub — you seem to be offline. Your work is saved on this computer and will upload on the next save.');
    err.offline = true;
    throw err;
  }
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
function explain(res, doing) {
  if (res.status === 401) return 'GitHub rejected the access token (expired or revoked). Reconnect GitHub in Settings → Switch storage mode.';
  if (res.status === 403 || res.status === 404) return `GitHub would not allow ${doing}. The token needs the "repo" scope (classic token), or Administration + Contents read/write (fine-grained token).`;
  return `GitHub could not complete ${doing}: ${res.data.message || 'error ' + res.status}`;
}

async function connect(token) {
  storage.setSetting('githubToken', token);
  let r;
  try { r = await gh('GET', '/user'); } catch (e) { return { ok: false, message: e.message }; }
  if (!r.ok) { storage.setSetting('githubToken', null); return { ok: false, message: 'GitHub rejected that token. Check it was copied in full and has not expired.' }; }
  storage.setSetting('githubUser', r.data.login);
  storage.setSetting('storageMode', 'github');
  return { ok: true, login: r.data.login };
}

function slugify(s, max) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, max || 40);
}
function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Finds the repo already linked to this project folder, or creates a new private one named
// after the project. A same-named repo this app did not create is never reused.
async function ensureRepo(projectRoot) {
  const settings = storage.getSettings();
  if (!settings.githubToken) return { ok: false, message: 'Connect a GitHub account first (Settings → Switch storage mode).' };
  const links = settings.githubProjects || {};
  if (links[projectRoot]) return { ok: true, repo: links[projectRoot].repo, branch: links[projectRoot].branch, created: false };

  try {
    const login = settings.githubUser;
    const baseName = slugify(path.basename(projectRoot), 80) || 'latex-project';
    for (let i = 1; i <= 20; i++) {
      const name = i === 1 ? baseName : `${baseName}-${i}`;
      const existing = await gh('GET', `/repos/${login}/${name}`);
      if (existing.ok) {
        if ((existing.data.description || '').startsWith(MARKER)) return remember(projectRoot, existing.data, false);
        continue;
      }
      const made = await gh('POST', '/user/repos', { name, private: true, auto_init: true, description: `${MARKER} — ${path.basename(projectRoot)}` });
      if (made.ok) return remember(projectRoot, made.data, true);
      if (made.status !== 422) return { ok: false, message: explain(made, 'creating a repository') };
    }
    return { ok: false, message: 'Could not find a free repository name for this project.' };
  } catch (e) { return { ok: false, message: e.message }; }
}
function remember(projectRoot, repoData, created) {
  const links = storage.getSettings().githubProjects || {};
  links[projectRoot] = { repo: repoData.full_name, branch: repoData.default_branch || 'main', url: repoData.html_url };
  storage.setSetting('githubProjects', links);
  return { ok: true, repo: repoData.full_name, branch: links[projectRoot].branch, url: repoData.html_url, created };
}

function projectFiles(root) {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.includes(e.name)) walk(full); }
      else if (!SKIP_EXT.some(ext => e.name.endsWith(ext))) {
        const content = fs.readFileSync(full);
        const sha = crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
        files.push({ path: path.relative(root, full).replace(/\\/g, '/'), content, sha });
      }
    }
  })(root);
  return files;
}

// H6 + H7: the "save" action in GitHub mode.
async function saveAsBranch(projectRoot, message) {
  try {
    const link = await ensureRepo(projectRoot);
    if (!link.ok) return link;
    const { repo, branch: base } = link;

    // A just-created repository can take a moment before its first commit is readable.
    let ref;
    for (let i = 0; i < 5; i++) {
      ref = await gh('GET', `/repos/${repo}/git/ref/heads/${base}`);
      if (ref.ok) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!ref.ok) return { ok: false, message: explain(ref, 'reading the repository') };
    const parentSha = ref.data.object.sha;
    const parent = await gh('GET', `/repos/${repo}/git/commits/${parentSha}`);
    const remoteTree = await gh('GET', `/repos/${repo}/git/trees/${parent.data.tree.sha}?recursive=1`);
    const remote = new Map((remoteTree.data.tree || []).filter(t => t.type === 'blob').map(t => [t.path, t.sha]));

    const files = projectFiles(projectRoot);
    const changed = files.filter(f => remote.get(f.path) !== f.sha);
    const local = new Set(files.map(f => f.path));
    const removed = [...remote.keys()].filter(p => !local.has(p));
    if (!changed.length && !removed.length) return { ok: true, repo, branch: null, merged: false, message: 'Already up to date on GitHub — nothing changed since the last save.' };

    for (const f of changed) {
      const blob = await gh('POST', `/repos/${repo}/git/blobs`, { content: f.content.toString('base64'), encoding: 'base64' });
      if (!blob.ok) return { ok: false, message: explain(blob, `uploading ${f.path}`) };
    }
    const tree = await gh('POST', `/repos/${repo}/git/trees`, { tree: files.map(f => ({ path: f.path, mode: '100644', type: 'blob', sha: f.sha })) });
    if (!tree.ok) return { ok: false, message: explain(tree, 'saving the file list') };

    const names = changed.map(f => path.basename(f.path)).concat(removed.map(p => path.basename(p)));
    const summary = message || `Update ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
    const commit = await gh('POST', `/repos/${repo}/git/commits`, { message: summary, tree: tree.data.sha, parents: [parentSha] });
    if (!commit.ok) return { ok: false, message: explain(commit, 'creating the commit') };

    const branch = `save/${timestamp()}-${slugify(names[0] || 'save') || 'save'}`;
    const made = await gh('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.data.sha });
    if (!made.ok) return { ok: false, message: explain(made, 'creating the save branch') };

    const merge = await gh('POST', `/repos/${repo}/merges`, { base, head: branch, commit_message: `Merge ${branch}` });
    if (merge.ok) return { ok: true, repo, branch, merged: true, message: `Saved to GitHub: ${summary} (${branch} → ${base}).` };

    const pr = await gh('POST', `/repos/${repo}/pulls`, { title: summary, head: branch, base, body: 'Opened automatically by Offline LaTeX Studio because this save conflicted with the latest version.' });
    return { ok: true, repo, branch, merged: false, pr: pr.data.html_url || null, message: `Saved ${branch}, but it conflicts with ${base} — opened a pull request for review instead of overwriting.` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = { connect, ensureRepo, saveAsBranch };
