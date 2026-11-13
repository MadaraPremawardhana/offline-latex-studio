// Looks for a TeX distribution already on this machine (MiKTeX or TeX Live).
// This build does not bundle a ~400MB-7GB distribution inside the app itself (see README);
// it finds one already installed, or lets the user point at packages on a local drive/USB.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function which(cmd) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
    return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || null;
  } catch (e) {
    return null;
  }
}

function version(bin, args) {
  try { return execFileSync(bin, args, { encoding: 'utf8' }).split(/\r?\n/)[0]; }
  catch (e) { return null; }
}

function detect() {
  const pdflatex = which('pdflatex');
  const latexmk = which('latexmk');
  const xelatex = which('xelatex');
  const lualatex = which('lualatex');
  if (!pdflatex) {
    return {
      found: false,
      message: 'No TeX distribution was found on PATH. Install MiKTeX or TeX Live, or point this app at an existing install folder in Settings.'
    };
  }
  const distro = pdflatex.toLowerCase().includes('miktex') ? 'MiKTeX' : 'TeX Live';
  return {
    found: true,
    distro,
    binDir: path.dirname(pdflatex),
    engines: { pdflatex: !!pdflatex, xelatex: !!xelatex, lualatex: !!lualatex },
    latexmk: !!latexmk,
    versionLine: version(pdflatex, ['--version'])
  };
}

// A3 / E4: "install packages from a local folder" — copies .sty/.cls/.bib support files
// from a chosen folder (a USB stick, an unpacked CTAN mirror, etc.) into the project's
// own texmf-local-style folder so pdflatex picks them up via TEXINPUTS, no internet needed.
function installPackagesFrom(folder) {
  if (!folder || !fs.existsSync(folder)) return { ok: false, message: 'Folder not found.' };
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(sty|cls|bst)$/i.test(entry.name)) files.push(full);
    }
  })(folder);
  return { ok: true, found: files.length, files: files.slice(0, 50) };
}

module.exports = { detect, installPackagesFrom, which };
