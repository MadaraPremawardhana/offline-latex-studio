// Renderer: wires the screens in index.html to the main-process api exposed by preload.js.
// Plain JS, no framework — kept easy to read screen by screen.
const $ = (id) => document.getElementById(id);
const state = { authTab: 'signin', project: null, cm: null, selectedTemplate: 'report', newFolder: null };

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = true);
  $(id).hidden = false;
}

// ---------------- boot ----------------
async function boot() {
  const user = await window.api.auth.currentUser();
  if (!user) return show('screen-signin');
  const settings = await window.api.settings.get();
  if (!settings.storageMode) return show('screen-storage');
  await goPastSetup();
}
async function goPastSetup() {
  const detected = await window.api.tex.detect();
  if (!detected.found) { renderSetupScreen(detected); show('screen-setup'); return; }
  await openLauncher();
}

// ---------------- S: sign in / sign up ----------------
$('authTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  state.authTab = btn.dataset.tab;
  document.querySelectorAll('#authTabs .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
  $('authSubmit').textContent = state.authTab === 'signin' ? 'Sign in' : 'Sign up';
});
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('authError').hidden = true;
  const creds = { email: $('authEmail').value.trim(), password: $('authPassword').value };
  const res = state.authTab === 'signin' ? await window.api.auth.signIn(creds) : await window.api.auth.signUp(creds);
  if (!res.ok) { $('authError').textContent = res.message; $('authError').hidden = false; return; }
  const settings = await window.api.settings.get();
  settings.storageMode ? await goPastSetup() : show('screen-storage');
});
async function ssoStub(provider) {
  const r = await window.api.auth.ssoStub(provider);
  $('ssoHint').textContent = r.message;
  $('ssoHint').hidden = false;
}
$('ssoGoogle').addEventListener('click', () => ssoStub('Google'));
$('ssoGithub').addEventListener('click', () => ssoStub('GitHub'));

// ---------------- L: storage choice ----------------
$('btnConnectGithub').addEventListener('click', () => { $('githubTokenRow').hidden = false; });
$('tokenHelpLink').addEventListener('click', (e) => {
  e.preventDefault();
  alert('On github.com: Settings → Developer settings → Personal access tokens → Fine-grained tokens → ' +
        'New token, grant it access to the repo(s) you want, and paste it here. It is stored only on this computer.');
});
$('btnConfirmGithubToken').addEventListener('click', async () => {
  $('githubError').hidden = true;
  const token = $('githubTokenInput').value.trim();
  const r = await window.api.github.connect(token);
  if (!r.ok) { $('githubError').textContent = r.message; $('githubError').hidden = false; return; }
  $('githubTokenRow').hidden = true;
  $('githubConnected').hidden = false;
  $('githubUserLine').textContent = `Signed in to GitHub as ${r.login}.`;
  const repos = await window.api.github.listRepos();
  if (repos.ok) {
    $('repoSelect').innerHTML = repos.repos.map(r => `<option value="${r.fullName}">${r.fullName}${r.private ? ' (private)' : ''}</option>`).join('');
  }
});
$('btnChooseRepoFolder').addEventListener('click', async () => {
  const folder = await window.api.storageMode.chooseFolder();
  if (!folder) return;
  state.repoFolder = folder;
  $('repoFolderLine').textContent = `Local folder: ${folder}`;
});
$('btnUseGithub').addEventListener('click', async () => {
  const repo = $('repoSelect').value;
  if (!repo || !state.repoFolder) { alert('Pick a repository and a local folder first.'); return; }
  const r = await window.api.github.linkRepo(repo, state.repoFolder);
  if (!r.ok) { $('githubError').textContent = r.message; $('githubError').hidden = false; return; }
  await goPastSetup();
});
$('btnChooseOfflineFolder').addEventListener('click', async () => {
  const folder = await window.api.storageMode.chooseFolder();
  if (!folder) return;
  state.offlineFolder = folder;
  $('offlineFolderLine').textContent = `Folder: ${folder}`;
});
$('btnUseOffline').addEventListener('click', async () => {
  await window.api.storageMode.setMode('offline');
  await goPastSetup();
});

// ---------------- A: TeX setup ----------------
function renderSetupScreen(detected) {
  $('texDetectCard').innerHTML = detected.found
    ? `<p>✓ Found ${detected.distro} · ${detected.binDir}</p>`
    : `<p>${detected.message}</p>`;
}
$('btnBrowseTexBin').addEventListener('click', async () => {
  const folder = await window.api.tex.browseFolder();
  if (!folder) return;
  await window.api.tex.setPath(folder);
  renderSetupScreen(await window.api.tex.detect());
});
$('btnInstallFromFolder').addEventListener('click', async () => {
  const folder = await window.api.tex.browseFolder();
  if (!folder) return;
  const r = await window.api.tex.installFromFolder(folder);
  $('packagesFoundLine').textContent = r.ok ? `Found ${r.found} package file(s) in that folder.` : r.message;
});
$('btnSetupContinue').addEventListener('click', async () => {
  await window.api.settings.set('engine', $('defaultEngine').value);
  await openLauncher();
});

// ---------------- B: project launcher ----------------
async function openLauncher() {
  const projects = await window.api.projects.recent();
  renderProjectList(projects);
  show('screen-launcher');
}
function renderProjectList(projects, query) {
  const q = (query || '').toLowerCase();
  const filtered = projects.filter(p => p.name.toLowerCase().includes(q));
  $('projectList').innerHTML = filtered.length ? filtered.map(p => `
    <div class="list-item" data-root="${p.root}" data-main="${p.mainFile}">
      <span>${p.pinned ? '★ ' : ''}${p.name}</span>
      <span class="muted small">${new Date(p.lastOpened).toLocaleString()}</span>
    </div>`).join('') : '<p class="muted">No projects yet. Create one to get started.</p>';
  document.querySelectorAll('#projectList .list-item').forEach(el => {
    el.addEventListener('click', () => openProject(el.dataset.root, el.dataset.main));
  });
}
$('projectSearch').addEventListener('input', async (e) => renderProjectList(await window.api.projects.recent(), e.target.value));
$('btnOpenFolder').addEventListener('click', async () => {
  const entry = await window.api.projects.openFolder();
  if (entry) openProject(entry.root, entry.mainFile);
});
$('btnOpenSettings').addEventListener('click', openSettings);
$('btnNewProject').addEventListener('click', async () => {
  const templates = await window.api.projects.listTemplates();
  $('templateGrid').innerHTML = templates.map(t => `<div class="tmpl-card" data-id="${t.id}"><b>${t.label}</b><div class="muted small">${t.hint || ''}</div></div>`).join('');
  document.querySelectorAll('.tmpl-card').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('.tmpl-card').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected'); state.selectedTemplate = c.dataset.id;
  }));
  document.querySelector('.tmpl-card')?.classList.add('selected');
  $('newFolder').value = state.offlineFolder || state.repoFolder || '';
  show('screen-templates');
});
$('backFromTemplates').addEventListener('click', openLauncher);
$('btnPickNewFolder').addEventListener('click', async () => {
  const folder = await window.api.storageMode.chooseFolder();
  if (folder) { state.newFolder = folder; $('newFolder').value = folder; }
});
$('btnCreateProject').addEventListener('click', async () => {
  const entry = await window.api.projects.create({
    templateId: state.selectedTemplate,
    title: $('newTitle').value, author: $('newAuthor').value,
    institution: $('newInstitution').value, date: $('newDate').value,
    folder: $('newFolder').value || state.offlineFolder || state.repoFolder
  });
  openProject(entry.root, entry.mainFile);
});

// ---------------- D/E/F: editor ----------------
async function openProject(root, mainFile) {
  state.project = { root, mainFile: mainFile || 'main.tex' };
  $('editorProjectName').textContent = root.split(/[\\/]/).pop();
  const settings = await window.api.settings.get();
  $('saveModeBadge').textContent = settings.storageMode === 'github' ? '⌁ GitHub' : '⌂ Offline';
  await renderFileTree();
  await loadFile(state.project.root + sep() + state.project.mainFile);
  await renderBibQuick();
  show('screen-editor');
}
function sep() { return navigator.userAgent.includes('Windows') ? '\\' : '/'; }
$('backFromEditor').addEventListener('click', openLauncher);

async function renderFileTree() {
  const tree = await window.api.fs.tree(state.project.root);
  function render(nodes, depth) {
    return nodes.map(n => n.type === 'dir'
      ? `<div class="tree-dir" style="padding-left:${depth * 10}px">▾ ${n.name}</div>` + render(n.children, depth + 1)
      : `<div class="tree-item" style="padding-left:${depth * 10 + 10}px" data-path="${n.path}">${n.name}</div>`
    ).join('');
  }
  $('fileTree').innerHTML = render(tree, 0);
  document.querySelectorAll('#fileTree .tree-item').forEach(el => el.addEventListener('click', () => loadFile(el.dataset.path)));
}
$('btnNewTexFile').addEventListener('click', async () => {
  const name = prompt('New file path (e.g. chapters/results.tex):', 'chapters/new.tex');
  if (!name) return;
  const full = await window.api.fs.newFile(state.project.root, name);
  await renderFileTree();
  loadFile(full);
});

function ensureEditor() {
  if (state.cm) return state.cm;
  state.cm = CodeMirror($('codemirrorHost'), { mode: 'stex', lineNumbers: true, lineWrapping: true, theme: 'default' });
  state.cm.on('changes', debounce(async () => {
    if (!state.currentFile) return;
    await window.api.fs.write(state.currentFile, state.cm.getValue());
    if ($('autoCompile').checked) compileProject();
  }, 800));
  return state.cm;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
async function loadFile(full) {
  state.currentFile = full;
  $('currentFileName').textContent = full.split(/[\\/]/).pop();
  const content = await window.api.fs.read(full);
  ensureEditor().setValue(content);
  document.querySelectorAll('#fileTree .tree-item').forEach(el => el.classList.toggle('active', el.dataset.path === full));
}

$('btnCompile').addEventListener('click', compileProject);
async function compileProject() {
  $('compileStatus').textContent = 'Compiling…';
  await window.api.fs.write(state.currentFile, state.cm.getValue());
  const engine = $('engineSelect').value;
  const result = await window.api.compile.run(state.project.root, state.project.mainFile, { engine });
  renderProblems(result.problems || []);
  $('rawLog').textContent = result.rawLog || result.message || '';
  if (result.pdfPath) {
    $('pdfFrame').src = 'file://' + result.pdfPath.replace(/\\/g, '/') + '?t=' + Date.now();
    state.lastPdf = result.pdfPath;
  }
  const errCount = (result.problems || []).filter(p => p.severity === 'error').length;
  const warnCount = (result.problems || []).filter(p => p.severity === 'warning').length;
  $('compileStatus').textContent = result.message && !result.pdfPath
    ? result.message
    : `${result.ok ? '✓' : '✕'} Compiled in ${result.seconds}s · ${errCount} error${errCount === 1 ? '' : 's'} · ${warnCount} warning${warnCount === 1 ? '' : 's'}`;
}
function renderProblems(problems) {
  $('problemsTitle').textContent = `Problems (${problems.length})`;
  $('problemsList').innerHTML = problems.length ? problems.map(p => `
    <div class="problem ${p.severity}">
      ${p.severity === 'error' ? '✕' : '⚠'} ${p.file ? `<u>${p.file.split(/[\\/]/).pop()}:${p.line || ''}</u>` : ''} ${escapeHtml(p.text)}
      ${p.help ? `<div class="help">${escapeHtml(p.help)}</div>` : ''}
    </div>`).join('') : '<p class="muted">No problems. ✓</p>';
  document.querySelectorAll('.problem u').forEach((el, i) => el.style.cursor = 'pointer');
}
function escapeHtml(s) { return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
$('btnShowRawLog').addEventListener('click', () => { $('rawLog').hidden = !$('rawLog').hidden; });
$('btnCleanAux').addEventListener('click', async () => {
  const r = await window.api.compile.clean(state.project.root);
  $('compileStatus').textContent = `Cleaned ${r.removed} auxiliary file(s).`;
});
$('btnOpenPdfExternal').addEventListener('click', () => { if (state.lastPdf) window.api.compile.openPdfExternal(state.lastPdf); });

$('btnSaveAction').addEventListener('click', async () => {
  const settings = await window.api.settings.get();
  if (settings.storageMode === 'github') {
    const message = prompt('Describe this save (used in the branch name and commit message):', 'edits') || 'edits';
    $('compileStatus').textContent = 'Saving to GitHub…';
    const r = await window.api.github.save(state.project.root, message);
    $('compileStatus').textContent = r.message;
  } else {
    const label = prompt('Name this version (optional):', '');
    await window.api.history.snapshot(state.project.root, label);
    $('compileStatus').textContent = 'Saved a local version. See History in Settings → Storage for the full list.';
  }
});

// ---------------- F: bibliography ----------------
async function renderBibQuick() {
  const entries = await window.api.bib.list(state.project.root);
  $('bibQuick').innerHTML = entries.slice(0, 5).map(e => `<div class="tree-item">${e.key}</div>`).join('') || '<p class="muted small">No references yet.</p>';
}
$('btnOpenBib').addEventListener('click', async () => { await renderBibList(); show('screen-bib'); });
$('backFromBib').addEventListener('click', () => show('screen-editor'));
async function renderBibList(query) {
  const entries = await window.api.bib.list(state.project.root);
  const q = (query || '').toLowerCase();
  const filtered = entries.filter(e => JSON.stringify(e).toLowerCase().includes(q));
  $('bibList').innerHTML = filtered.map(e => `<div class="tree-item" data-key="${e.key}">${e.key} · ${e.author || ''} — ${e.title || ''} (${e.year || ''})</div>`).join('');
  document.querySelectorAll('#bibList .tree-item').forEach(el => el.addEventListener('click', () => {
    const entry = entries.find(e => e.key === el.dataset.key);
    $('bibType').value = entry.type; $('bibKey').value = entry.key; $('bibAuthor').value = entry.author || '';
    $('bibTitle').value = entry.title || ''; $('bibYear').value = entry.year || '';
  }));
}
$('bibSearch').addEventListener('input', (e) => renderBibList(e.target.value));
$('btnBibNew').addEventListener('click', () => { ['bibKey', 'bibAuthor', 'bibTitle', 'bibYear'].forEach(id => $(id).value = ''); });
$('btnBibSave').addEventListener('click', async () => {
  await window.api.bib.save(state.project.root, { type: $('bibType').value, key: $('bibKey').value, author: $('bibAuthor').value, title: $('bibTitle').value, year: $('bibYear').value });
  await renderBibList(); await renderBibQuick();
});
$('btnBibImport').addEventListener('click', async () => { const r = await window.api.bib.importFile(state.project.root); if (r) await renderBibList(); });

// ---------------- Settings ----------------
async function openSettings() {
  const s = await window.api.settings.get();
  $('setEngine').value = s.engine; $('setUseLatexmk').checked = s.useLatexmk; $('setShellEscape').checked = s.shellEscape;
  $('setTimeout').value = s.timeoutSec; $('setTheme').value = s.theme; $('setFontSize').value = s.editorFontSize;
  $('setStorageLine').textContent = s.storageMode === 'github' ? `GitHub repo: ${s.githubRepo || '(none)'}` : `Offline drive${s.storageMode ? '' : ' (not set)'}`;
  const user = await window.api.auth.currentUser();
  $('setAccountLine').textContent = user ? `Signed in as ${user.email}` : 'Not signed in';
  show('screen-settings');
}
$('backFromSettings').addEventListener('click', openLauncher);
['setEngine', 'setBibTool', 'setUseLatexmk', 'setShellEscape', 'setTimeout', 'setTheme', 'setFontSize'].forEach(id => {
  $(id).addEventListener('change', async () => {
    const map = { setEngine: 'engine', setUseLatexmk: 'useLatexmk', setShellEscape: 'shellEscape', setTimeout: 'timeoutSec', setTheme: 'theme', setFontSize: 'editorFontSize' };
    const key = map[id]; if (!key) return;
    const el = $(id);
    const value = el.type === 'checkbox' ? el.checked : el.value;
    await window.api.settings.set(key, value);
  });
});
$('btnSwitchStorage').addEventListener('click', () => show('screen-storage'));
$('btnSignOut').addEventListener('click', async () => { await window.api.auth.signOut(); show('screen-signin'); });

boot();
