const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const tex = require('./lib/texDetect');
const compiler = require('./lib/compile');
const storage = require('./lib/storage');
const github = require('./lib/github');
const bib = require('./lib/bib');
const wordcount = require('./lib/wordcount');
const templates = require('./lib/templates');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f2f2f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // keep drawing the PDF preview while the window is behind another
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---------- IPC: TeX setup ----------
ipcMain.handle('tex:detect', () => tex.detect());
ipcMain.handle('tex:setPath', (_e, p) => storage.setSetting('texBin', p));
ipcMain.handle('tex:browseFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('tex:installFromFolder', async (_e, folder) => tex.installPackagesFrom(folder));

// ---------- IPC: accounts / auth ----------
ipcMain.handle('auth:signUp', (_e, creds) => storage.signUp(creds));
ipcMain.handle('auth:signIn', (_e, creds) => storage.signIn(creds));
ipcMain.handle('auth:ssoStub', (_e, provider) => ({
  ok: false,
  message: `${provider} sign-in needs an OAuth app you register yourself (client id/secret) — ` +
           `this build signs you in locally instead. See README "Connecting Google/GitHub sign-in".`
}));
ipcMain.handle('auth:currentUser', () => storage.currentUser());
ipcMain.handle('auth:signOut', () => storage.signOut());

// ---------- IPC: storage mode (offline drive vs GitHub) ----------
ipcMain.handle('storage:chooseFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('storage:setMode', (_e, mode) => storage.setStorageMode(mode));
ipcMain.handle('github:connect', (_e, token) => github.connect(token));
ipcMain.handle('github:ensureRepo', (_e, projectRoot) => github.ensureRepo(projectRoot));

// ---------- IPC: projects ----------
ipcMain.handle('projects:recent', () => storage.recentProjects());
ipcMain.handle('projects:create', (_e, opts) => templates.createProject({
  ...opts,
  folder: opts.folder || storage.getSettings().projectsFolder || path.join(app.getPath('documents'), 'Offline LaTeX Studio')
}));
ipcMain.handle('projects:openFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (r.canceled) return null;
  return storage.registerProject(r.filePaths[0]);
});
ipcMain.handle('projects:listTemplates', () => templates.list());
ipcMain.handle('projects:saveAsTemplate', (_e, projectPath, name) => templates.saveAsTemplate(projectPath, name));

// ---------- IPC: file tree / editor ----------
ipcMain.handle('fs:tree', (_e, root) => storage.fileTree(root));
ipcMain.handle('fs:read', (_e, file) => fs.readFileSync(file, 'utf8'));
ipcMain.handle('fs:readBinary', (_e, file) => fs.readFileSync(file));
ipcMain.handle('fs:write', (_e, file, content) => { fs.writeFileSync(file, content, 'utf8'); return true; });
ipcMain.handle('fs:newFile', (_e, root, relPath) => storage.newFile(root, relPath));
ipcMain.handle('fs:addImage', async (_e, root) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'pdf', 'eps'] }] });
  if (r.canceled) return null;
  return storage.copyIntoFigures(root, r.filePaths[0]);
});

// ---------- IPC: compile ----------
ipcMain.handle('compile:run', (_e, projectRoot, mainFile, opts) => compiler.compile(projectRoot, mainFile, opts));
ipcMain.handle('compile:clean', (_e, projectRoot) => compiler.cleanAux(projectRoot));
ipcMain.handle('compile:openPdfExternal', (_e, pdfPath) => shell.openPath(pdfPath));

// ---------- IPC: bibliography ----------
ipcMain.handle('bib:list', (_e, projectRoot) => bib.list(projectRoot));
ipcMain.handle('bib:save', (_e, projectRoot, entry) => bib.save(projectRoot, entry));
ipcMain.handle('bib:import', async (_e, projectRoot) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'BibTeX', extensions: ['bib'] }] });
  if (r.canceled) return null;
  return bib.importFile(projectRoot, r.filePaths[0]);
});

// ---------- IPC: word count ----------
ipcMain.handle('wc:count', (_e, projectRoot, mainFile) => wordcount.count(projectRoot, mainFile));

// ---------- IPC: history / export ----------
ipcMain.handle('history:list', (_e, projectRoot) => storage.historyList(projectRoot));
ipcMain.handle('history:snapshot', (_e, projectRoot, label) => storage.historySnapshot(projectRoot, label));
ipcMain.handle('history:restore', (_e, projectRoot, versionId) => storage.historyRestore(projectRoot, versionId));
ipcMain.handle('github:save', (_e, projectRoot, message) => github.saveAsBranch(projectRoot, message));
ipcMain.handle('export:run', async (_e, projectRoot, pdfPath, kind) => {
  if (kind === 'zip') {
    const r = await dialog.showSaveDialog(win, { defaultPath: 'project-source.zip', filters: [{ name: 'Zip', extensions: ['zip'] }] });
    if (r.canceled) return null;
    return storage.exportZip(projectRoot, r.filePath);
  }
  const r = await dialog.showSaveDialog(win, { defaultPath: path.basename(pdfPath || 'output.pdf') });
  if (r.canceled) return null;
  fs.copyFileSync(pdfPath, r.filePath);
  return r.filePath;
});

ipcMain.handle('settings:get', () => storage.getSettings());
ipcMain.handle('settings:set', (_e, key, value) => storage.setSetting(key, value));
