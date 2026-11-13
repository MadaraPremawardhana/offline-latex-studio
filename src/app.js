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
  alert('On github.com: Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token, ' +
        'tick the "repo" scope, and paste the token here. It is stored only on this computer.');
});
$('btnConfirmGithubToken').addEventListener('click', async () => {
  $('githubError').hidden = true;
  const r = await window.api.github.connect($('githubTokenInput').value.trim());
  if (!r.ok) { $('githubError').textContent = r.message; $('githubError').hidden = false; return; }
  $('githubTokenRow').hidden = true;
  $('githubConnected').hidden = false;
  $('githubUserLine').textContent = `Signed in to GitHub as ${r.login}. A private repository is created for each project the first time you open it.`;
});
$('btnUseGithub').addEventListener('click', goPastSetup);
$('btnChooseOfflineFolder').addEventListener('click', async () => {
  const folder = await window.api.storageMode.chooseFolder();
  if (!folder) return;
  await window.api.settings.set('projectsFolder', folder);
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
  $('newFolder').value = (await window.api.settings.get()).projectsFolder || '';
  show('screen-templates');
});
$('backFromTemplates').addEventListener('click', openLauncher);
$('btnPickNewFolder').addEventListener('click', async () => {
  const folder = await window.api.storageMode.chooseFolder();
  if (folder) { $('newFolder').value = folder; await window.api.settings.set('projectsFolder', folder); }
});
$('btnCreateProject').addEventListener('click', async () => {
  const entry = await window.api.projects.create({
    templateId: state.selectedTemplate,
    title: $('newTitle').value, author: $('newAuthor').value,
    institution: $('newInstitution').value, date: $('newDate').value,
    folder: $('newFolder').value
  });
  openProject(entry.root, entry.mainFile);
});

// ---------------- in-app dialogs (Electron has no window.prompt) ----------------
function openModal(title, bodyHtml, { okText = 'OK', showOk = true } = {}) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalOk').textContent = okText;
  $('modalOk').hidden = !showOk;
  $('modal').hidden = false;
  const first = $('modalBody').querySelector('input, select');
  if (first) { first.focus(); if (first.select) first.select(); }
  return new Promise((resolve) => {
    const done = (ok) => { $('modal').hidden = true; $('modalOk').onclick = $('modalCancel').onclick = $('modal').onkeydown = null; resolve(ok); };
    $('modalOk').onclick = () => done(true);
    $('modalCancel').onclick = () => done(false);
    $('modal').onkeydown = (e) => { if (e.key === 'Enter' && showOk && e.target.tagName !== 'BUTTON') done(true); if (e.key === 'Escape') done(false); };
    state.closeModal = done;
  });
}
async function askText(title, value, placeholder) {
  const ok = await openModal(title, `<input class="input wide" id="modalInput" placeholder="${escapeHtml(placeholder || '')}">`);
  return ok ? $('modalInput').value.trim() : null;
}
function setStatus(id, text, tone) {
  $(id).textContent = text;
  $(id).classList.toggle('bad', tone === 'bad');
  $(id).classList.toggle('good', tone === 'good');
}

// ---------------- D/E/F: editor ----------------
async function openProject(root, mainFile) {
  state.project = { root, mainFile: mainFile || 'main.tex' };
  state.lastPdf = null;
  $('pdfView').innerHTML = '<p class="pdf-empty">Press ▶ Compile to see your document here.</p>';
  $('editorProjectName').textContent = root.split(/[\\/]/).pop();
  const settings = await window.api.settings.get();
  state.storageMode = settings.storageMode;
  $('engineSelect').value = settings.engine || 'pdflatex';
  $('saveModeBadge').textContent = settings.storageMode === 'github' ? '⌁ GitHub' : '⌂ Offline';
  await renderFileTree();
  await loadFile(state.project.root + sep() + state.project.mainFile);
  await renderBibQuick();
  show('screen-editor');
  state.cm.refresh();
  setStatus('saveStatus', 'Changes are saved to this computer as you type.');
  if (settings.storageMode === 'github') linkGithubRepo();
  compileProject();
}
async function linkGithubRepo() {
  setStatus('saveStatus', 'Setting up this project\'s GitHub repository…');
  const r = await window.api.github.ensureRepo(state.project.root);
  if (!r.ok) return setStatus('saveStatus', r.message, 'bad');
  $('saveModeBadge').textContent = `⌁ ${r.repo}`;
  if (!r.created) return setStatus('saveStatus', `Linked to GitHub repository ${r.repo}. Press Save (Ctrl+S) to commit.`);
  setStatus('saveStatus', `Created private GitHub repository ${r.repo} — uploading the first version…`);
  await saveProject();
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
  document.querySelectorAll('#fileTree .tree-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === state.currentFile);
    el.addEventListener('click', () => { if (/\.(tex|bib|sty|cls|txt|md|bst)$/i.test(el.dataset.path)) loadFile(el.dataset.path); });
  });
  // Labels from every .tex file feed \ref{ autocomplete.
  const texFiles = [];
  (function collect(nodes) { nodes.forEach(n => n.type === 'dir' ? collect(n.children) : /\.tex$/i.test(n.name) && texFiles.push(n.path)); })(tree);
  const labels = new Set();
  for (const f of texFiles.slice(0, 200)) {
    const text = await window.api.fs.read(f);
    for (const m of text.matchAll(/\\label\{([^}]+)\}/g)) labels.add(m[1]);
  }
  state.projectLabels = [...labels];
}
$('btnNewTexFile').addEventListener('click', async () => {
  const name = await askText('New file', '', 'e.g. chapters/results.tex');
  if (!name) return;
  const full = await window.api.fs.newFile(state.project.root, name);
  await renderFileTree();
  loadFile(full);
});

function hintContext() {
  const own = [...state.cm.getValue().matchAll(/\\label\{([^}]+)\}/g)].map(m => m[1]);
  return {
    labels: [...new Set(own.concat(state.projectLabels || []))],
    bibKeys: (state.bibEntries || []).map(e => ({ key: e.key, note: [e.author, e.year].filter(Boolean).join(' ').slice(0, 40) }))
  };
}
async function writeCurrentFile() {
  if (state.currentFile && state.cm) await window.api.fs.write(state.currentFile, state.cm.getValue());
}
function ensureEditor() {
  if (state.cm) return state.cm;
  const wrap = (snippet) => (cm) => LatexTools.insert(cm, snippet);
  state.cm = CodeMirror($('codemirrorHost'), {
    mode: 'stex', lineNumbers: true, lineWrapping: true, theme: 'default', tabSize: 2, indentUnit: 2,
    autoCloseBrackets: { pairs: '()[]{}$$', explode: '[]{}' }, matchBrackets: true, styleActiveLine: true,
    hintOptions: { hint: (cm) => LatexTools.hint(cm, hintContext), completeSingle: false },
    extraKeys: {
      'Ctrl-Space': 'autocomplete', 'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
      'Ctrl-B': wrap('\\textbf{|}'), 'Cmd-B': wrap('\\textbf{|}'), 'Ctrl-I': wrap('\\textit{|}'), 'Cmd-I': wrap('\\textit{|}'),
      'Ctrl-S': () => saveProject(), 'Cmd-S': () => saveProject(),
      'Ctrl-Enter': () => compileProject(), 'Cmd-Enter': () => compileProject(),
      Enter: (cm) => LatexTools.closeEnvironmentOnEnter(cm),
      Tab: (cm) => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection('  ')
    }
  });
  // Suggestions appear as you type a command, an environment name, a citation key or a label.
  state.cm.on('inputRead', (cm, change) => {
    if (change.origin !== '+input' || cm.state.completionActive) return;
    const cur = cm.getCursor();
    const before = cm.getLine(cur.line).slice(0, cur.ch);
    if (/\\[A-Za-z]*$/.test(before) || /\\(begin|end|cite[a-zA-Z]*|ref|eqref|autoref|cref|pageref|usepackage(\[[^\]]*\])?)\{[^{}]*$/.test(before)) cm.showHint();
  });
  state.cm.on('changes', debounce(async (_cm, changes) => {
    if (!state.currentFile || changes.every(c => c.origin === 'setValue')) return;
    await writeCurrentFile();
    if ($('autoCompile').checked) compileProject();
  }, 800));
  buildToolbar();
  return state.cm;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
async function loadFile(full, line) {
  if (full !== state.currentFile) {
    await writeCurrentFile();
    state.currentFile = full;
    $('currentFileName').textContent = full.split(/[\\/]/).pop();
    const content = await window.api.fs.read(full);
    const cm = ensureEditor();
    cm.setValue(content);
    cm.clearHistory();
    document.querySelectorAll('#fileTree .tree-item').forEach(el => el.classList.toggle('active', el.dataset.path === full));
  }
  if (line) {
    const cm = state.cm;
    cm.setCursor({ line: line - 1, ch: 0 });
    cm.scrollIntoView({ line: line - 1, ch: 0 }, 120);
    cm.addLineClass(line - 1, 'background', 'jump-flash');
    setTimeout(() => cm.removeLineClass(line - 1, 'background', 'jump-flash'), 1500);
    cm.focus();
  }
}

// ---------------- toolbar + symbol palette ----------------
function buildToolbar() {
  const bar = $('editorToolbar');
  LatexTools.TOOLBAR.forEach((item) => {
    if (item.sep) { const d = document.createElement('span'); d.className = 'tb-sep'; return bar.appendChild(d); }
    if (item.select) {
      const sel = document.createElement('select');
      sel.className = 'input';
      sel.innerHTML = `<option value="">${item.select}</option>` + item.options.map(([l], i) => `<option value="${i}">${l}</option>`).join('');
      sel.addEventListener('change', () => { if (sel.value !== '') LatexTools.insert(state.cm, item.options[Number(sel.value)][1]); sel.value = ''; });
      return bar.appendChild(sel);
    }
    const b = document.createElement('button');
    b.className = 'tb-btn'; b.innerHTML = item.label; b.title = item.title;
    if (item.action) b.dataset.action = item.action;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor's selection
    b.addEventListener('click', () => item.action ? toolbarAction(item.action, b) : LatexTools.insert(state.cm, item.snippet, item));
    bar.appendChild(b);
  });
  const groups = Object.keys(LatexTools.SYMBOLS);
  $('symbolTabs').innerHTML = groups.map((g, i) => `<button class="seg-btn${i ? '' : ' active'}" data-group="${g}">${g}</button>`).join('');
  $('symbolTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn'); if (!btn) return;
    document.querySelectorAll('#symbolTabs .seg-btn').forEach(x => x.classList.toggle('active', x === btn));
    renderSymbols(btn.dataset.group);
  });
  $('symbolGrid').addEventListener('mousedown', (e) => e.preventDefault());
  $('symbolGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.tb-btn'); if (!btn) return;
    const command = btn.dataset.cmd;
    LatexTools.insert(state.cm, command.endsWith('{}') ? command.slice(0, -1) + '|}' : command + ' ', { math: true });
  });
  renderSymbols(groups[0]);
}
function renderSymbols(group) {
  $('symbolGrid').innerHTML = LatexTools.SYMBOLS[group].map(([ch, command]) => `<button class="tb-btn" title="${command}" data-cmd="${command}">${ch}</button>`).join('');
}
async function toolbarAction(action, button) {
  const cm = state.cm;
  if (action === 'symbols') {
    $('symbolPanel').hidden = !$('symbolPanel').hidden;
    button.classList.toggle('active', !$('symbolPanel').hidden);
    return cm.refresh();
  }
  if (action === 'figure') {
    const rel = await window.api.fs.addImage(state.project.root);
    if (!rel) return;
    await renderFileTree();
    return LatexTools.insert(cm, LatexTools.figureSnippet(rel), { block: true });
  }
  if (action === 'table') {
    const ok = await openModal('Insert table', '<label>Rows<input class="input" type="number" id="tblRows" min="1" max="50" value="3"></label><label>Columns<input class="input" type="number" id="tblCols" min="1" max="12" value="3"></label>', { okText: 'Insert' });
    if (!ok) return;
    const rows = Math.min(50, Math.max(1, Number($('tblRows').value) || 3)), cols = Math.min(12, Math.max(1, Number($('tblCols').value) || 3));
    return LatexTools.insert(cm, LatexTools.tableSnippet(rows, cols), { block: true });
  }
  // Cite / Ref: insert the command and open the list of keys or labels straight away.
  LatexTools.insert(cm, action === 'cite' ? '\\cite{|}' : '\\ref{|}');
  cm.showHint();
}

// ---------------- compile + preview ----------------
$('btnCompile').addEventListener('click', compileProject);
async function compileProject() {
  if (state.compiling) { state.compileAgain = true; return; }
  state.compiling = true;
  setStatus('compileStatus', 'Compiling…');
  try {
    await writeCurrentFile();
    const result = await window.api.compile.run(state.project.root, state.project.mainFile, { engine: $('engineSelect').value });
    renderProblems(result.problems || []);
    $('rawLog').textContent = result.rawLog || result.message || '';
    const errCount = (result.problems || []).filter(p => p.severity === 'error').length;
    const warnCount = (result.problems || []).filter(p => p.severity === 'warning').length;
    if (result.pdfPath) {
      state.lastPdf = result.pdfPath;
      await showPdf(result.pdfPath);
    }
    if (result.message && !result.pdfPath && !errCount) setStatus('compileStatus', result.message, 'bad');
    else setStatus('compileStatus', `${result.ok ? '✓' : '✕'} Compiled in ${result.seconds}s · ${errCount} error${errCount === 1 ? '' : 's'} · ${warnCount} warning${warnCount === 1 ? '' : 's'}${result.pdfPath ? '' : ' · no PDF produced'}`, result.ok ? 'good' : 'bad');
  } catch (e) {
    setStatus('compileStatus', 'Compile failed: ' + e.message, 'bad');
  }
  state.compiling = false;
  if (state.compileAgain) { state.compileAgain = false; compileProject(); }
}
// Draws every page of the PDF onto canvases with the bundled pdf.js — no browser plug-in.
async function showPdf(pdfPath) {
  const host = $('pdfView');
  const data = await window.api.fs.readBinary(pdfPath);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const scrollTop = host.scrollTop;
  const fitWidth = Math.max(200, host.clientWidth - 40);
  const dpr = window.devicePixelRatio || 1;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const scale = fitWidth / page.getViewport({ scale: 1 }).width * (state.zoom || 1);
    const viewport = page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
    canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(canvas);
  }
  host.replaceChildren(...pages);
  host.scrollTop = scrollTop;
  doc.destroy();
}
function zoomPdf(factor) {
  state.zoom = Math.min(3, Math.max(0.4, (state.zoom || 1) * factor));
  if (state.lastPdf) showPdf(state.lastPdf);
}
$('btnZoomIn').addEventListener('click', () => zoomPdf(1.2));
$('btnZoomOut').addEventListener('click', () => zoomPdf(1 / 1.2));

function renderProblems(problems) {
  $('problemsTitle').textContent = `Problems (${problems.length})`;
  $('problemsList').innerHTML = problems.length ? problems.map((p, i) => `
    <div class="problem ${p.severity}">
      ${p.severity === 'error' ? '✕' : '⚠'} ${p.line ? `<u data-i="${i}">${p.file ? escapeHtml(p.file.split(/[\\/]/).pop()) + ':' : 'line '}${p.line}</u>` : ''} ${escapeHtml(p.text)}
      ${p.help ? `<div class="help">${escapeHtml(p.help)}</div>` : ''}
    </div>`).join('') : '<p class="muted">No problems. ✓</p>';
  document.querySelectorAll('.problem u').forEach((el) => el.addEventListener('click', () => {
    const p = problems[Number(el.dataset.i)];
    const rel = (p.file || state.project.mainFile).replace(/^\.[\\/]/, '').replace(/\//g, sep());
    loadFile(/^([A-Za-z]:|[\\/])/.test(rel) ? rel : state.project.root + sep() + rel, p.line);
  }));
}
function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
$('btnShowRawLog').addEventListener('click', () => { $('rawLog').hidden = !$('rawLog').hidden; });
$('btnCleanAux').addEventListener('click', async () => {
  const r = await window.api.compile.clean(state.project.root);
  setStatus('compileStatus', `Cleaned ${r.removed} auxiliary file(s).`);
});
$('btnOpenPdfExternal').addEventListener('click', () => { if (state.lastPdf) window.api.compile.openPdfExternal(state.lastPdf); });

// ---------------- save: GitHub commit, or a local restorable version ----------------
$('btnSaveAction').addEventListener('click', saveProject);
async function saveProject() {
  if (state.saving) return;
  state.saving = true;
  try {
    await writeCurrentFile();
    if (state.storageMode === 'github') {
      setStatus('saveStatus', 'Saving to GitHub…');
      const r = await window.api.github.save(state.project.root);
      setStatus('saveStatus', r.message, r.ok ? 'good' : 'bad');
    } else {
      await window.api.history.snapshot(state.project.root, 'Saved ' + $('currentFileName').textContent);
      setStatus('saveStatus', `Saved a version at ${new Date().toLocaleTimeString()} — open History to go back to an earlier one.`, 'good');
    }
  } catch (e) {
    setStatus('saveStatus', 'Save failed: ' + e.message, 'bad');
  }
  state.saving = false;
}
$('btnHistory').addEventListener('click', async () => {
  const versions = await window.api.history.list(state.project.root);
  const note = state.storageMode === 'github' ? '<p class="muted small">Every save is also a commit in this project\'s GitHub repository. Versions below are local snapshots from before a restore.</p>' : '';
  const body = note + (versions.length
    ? versions.map(v => `<div class="list-item"><span>${escapeHtml(v.label)}<br><span class="muted small">${new Date(v.at).toLocaleString()}</span></span><button class="btn-secondary" data-restore="${v.id}">Restore</button></div>`).join('')
    : '<p class="muted">No saved versions yet. Press Save (Ctrl+S) to make one.</p>');
  const shown = openModal('Version history', body, { showOk: false });
  $('modalBody').querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', async () => {
    await writeCurrentFile();
    await window.api.history.snapshot(state.project.root, 'Before restoring an earlier version');
    await window.api.history.restore(state.project.root, btn.dataset.restore);
    state.closeModal(false);
    const current = state.currentFile;
    state.currentFile = null;
    await renderFileTree();
    await loadFile(current);
    setStatus('saveStatus', 'Restored the earlier version. The version you had is kept in History too.', 'good');
    compileProject();
  }));
  await shown;
});

// ---------------- F: bibliography ----------------
async function renderBibQuick() {
  const entries = await window.api.bib.list(state.project.root);
  state.bibEntries = entries;
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
