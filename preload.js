const { contextBridge, ipcRenderer } = require('electron');

function on(channel, ...args) { return ipcRenderer.invoke(channel, ...args); }

contextBridge.exposeInMainWorld('api', {
  tex: {
    detect: () => on('tex:detect'),
    setPath: (p) => on('tex:setPath', p),
    browseFolder: () => on('tex:browseFolder'),
    installFromFolder: (f) => on('tex:installFromFolder', f)
  },
  auth: {
    signUp: (c) => on('auth:signUp', c),
    signIn: (c) => on('auth:signIn', c),
    ssoStub: (p) => on('auth:ssoStub', p),
    currentUser: () => on('auth:currentUser'),
    signOut: () => on('auth:signOut')
  },
  storageMode: {
    chooseFolder: () => on('storage:chooseFolder'),
    setMode: (m) => on('storage:setMode', m)
  },
  github: {
    connect: (t) => on('github:connect', t),
    ensureRepo: (root) => on('github:ensureRepo', root),
    save: (root, msg) => on('github:save', root, msg)
  },
  projects: {
    recent: () => on('projects:recent'),
    create: (o) => on('projects:create', o),
    openFolder: () => on('projects:openFolder'),
    listTemplates: () => on('projects:listTemplates'),
    saveAsTemplate: (root, name) => on('projects:saveAsTemplate', root, name)
  },
  fs: {
    tree: (root) => on('fs:tree', root),
    read: (file) => on('fs:read', file),
    readBinary: (file) => on('fs:readBinary', file),
    write: (file, content) => on('fs:write', file, content),
    newFile: (root, rel) => on('fs:newFile', root, rel),
    addImage: (root) => on('fs:addImage', root)
  },
  compile: {
    run: (root, main, opts) => on('compile:run', root, main, opts),
    clean: (root) => on('compile:clean', root),
    openPdfExternal: (p) => on('compile:openPdfExternal', p)
  },
  bib: {
    list: (root) => on('bib:list', root),
    save: (root, entry) => on('bib:save', root, entry),
    importFile: (root) => on('bib:import', root)
  },
  wordcount: { count: (root, main) => on('wc:count', root, main) },
  history: {
    list: (root) => on('history:list', root),
    snapshot: (root, label) => on('history:snapshot', root, label),
    restore: (root, id) => on('history:restore', root, id)
  },
  exportFile: (root, pdf, kind) => on('export:run', root, pdf, kind),
  settings: { get: () => on('settings:get'), set: (k, v) => on('settings:set', k, v) }
});
