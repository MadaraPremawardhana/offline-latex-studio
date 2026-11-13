// L2, H6, H7: links a GitHub repo and, on every save, creates a uniquely named branch
// and merges it to main — unless that would conflict, in which case it opens a pull
// request for review instead of overwriting anyone.
//
// This build authenticates with a GitHub Personal Access Token (fine-grained, repo-scoped)
// that the user pastes in once, rather than a full Google/GitHub OAuth app — registering an
// OAuth app's client id/secret is something only the user's own GitHub/Google account can do
// (see README "Connecting Google/GitHub sign-in"). The token lives only in this app's local
// settings file and is sent only to api.github.com.
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

const API = 'https://api.github.com';

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'offline-latex-studio' };
}

async function connect(token) {
  const r = await fetch(`${API}/user`, { headers: headers(token) });
  if (!r.ok) return { ok: false, message: 'GitHub rejected that token. Check it has the "repo" scope and has not expired.' };
  const user = await r.json();
  storage.setSetting('githubToken', token);
  storage.setSetting('githubUser', user.login);
  return { ok: true, login: user.login };
}

async function listRepos() {
  const token = storage.getSettings().githubToken;
  if (!token) return { ok: false, message: 'Connect a GitHub account first.' };
  const r = await fetch(`${API}/user/repos?per_page=100&sort=updated`, { headers: headers(token) });
  if (!r.ok) return { ok: false, message: 'Could not list repositories.' };
  const repos = await r.json();
  return { ok: true, repos: repos.map(r => ({ fullName: r.full_name, defaultBranch: r.default_branch, private: r.private })) };
}

async function linkRepo(repoFullName, localFolder) {
  const token = storage.getSettings().githubToken;
  if (!token) return { ok: false, message: 'Connect a GitHub account first.' };
  fs.mkdirSync(localFolder, { recursive: true });
  const git = simpleGit(localFolder);
  const remoteUrl = `https://${token}@github.com/${repoFullName}.git`;
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) await git.init();
  const remotes = await git.getRemotes();
  if (remotes.find(r => r.name === 'origin')) await git.removeRemote('origin');
  await git.addRemote('origin', remoteUrl);
  let defaultBranch = 'main';
  try { await git.fetch('origin'); await git.checkout(['-B', defaultBranch, 'origin/' + defaultBranch]); }
  catch (e) { await git.checkout(['-B', defaultBranch]); }
  storage.setSetting('storageMode', 'github');
  storage.setSetting('githubRepo', repoFullName);
  storage.setSetting('githubDefaultBranch', defaultBranch);
  return { ok: true, repo: repoFullName, root: localFolder, defaultBranch };
}

function slugify(s) {
  return (s || 'save').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'save';
}
function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// H6 + H7: the core "save" action in GitHub mode.
async function saveAsBranch(projectRoot, message) {
  const settings = storage.getSettings();
  const token = settings.githubToken, repo = settings.githubRepo, base = settings.githubDefaultBranch || 'main';
  if (!token || !repo) return { ok: false, message: 'Link a GitHub repository in Settings first.' };

  const git = simpleGit(projectRoot);
  const branch = `save/${timestamp()}-${slugify(message)}`;
  await git.checkout(['-B', branch]);
  await git.add(['-A', '--', ':!.history', ':!*.pdf', ':!*.aux', ':!*.log', ':!*.toc', ':!*.out']);
  const status = await git.status();
  if (status.staged.length === 0 && status.created.length === 0 && status.deleted.length === 0 && status.modified.length === 0) {
    await git.checkout(base);
    return { ok: true, branch: null, merged: false, message: 'Nothing changed since the last save.' };
  }
  await git.commit(message || 'Save from Offline LaTeX Studio');
  await git.push(['origin', branch, '-u']);

  // Try a clean merge to base first (H7: "straight to main when there's no conflict").
  try {
    await git.fetch('origin');
    await git.checkout(base);
    await git.pull('origin', base);
    await git.mergeFromTo(branch, base, ['--no-ff', '-m', `Merge ${branch}`]);
    await git.push('origin', base);
    return { ok: true, branch, merged: true, message: `Saved and merged ${branch} into ${base}.` };
  } catch (mergeErr) {
    // Conflict: back out of the local merge attempt, leave the branch pushed, open a PR for review instead.
    await git.merge(['--abort']).catch(() => {});
    await git.checkout(branch).catch(() => {});
    const pr = await openPullRequest(token, repo, branch, base, message);
    return { ok: true, branch, merged: false, pr: pr.url || null, message: `Saved ${branch}, but it conflicts with ${base} — opened a pull request for review instead of merging over someone else's work.` };
  }
}

async function openPullRequest(token, repo, head, base, title) {
  const r = await fetch(`${API}/repos/${repo}/pulls`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title || `Save: ${head}`, head, base, body: 'Opened automatically by Offline LaTeX Studio because this save conflicted with the latest version.' })
  });
  if (!r.ok) return { ok: false };
  const pr = await r.json();
  return { ok: true, url: pr.html_url };
}

module.exports = { connect, listRepos, linkRepo, saveAsBranch };
