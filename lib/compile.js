// D3/E1/E3/E5/G1/G3: runs latexmk (falling back to a manual pdflatex/bibtex loop),
// parses the log into a clickable problem list, and cleans aux files.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const tex = require('./texDetect');
const storage = require('./storage');

const AUX_EXT = ['.aux', '.log', '.toc', '.out', '.bbl', '.bcf', '.blg', '.fls', '.fdb_latexmk', '.synctex.gz', '.run.xml'];

function run(bin, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(bin, args, { cwd });
    const killer = setTimeout(() => { child.kill(); out += '\n[Stopped: exceeded the compile time limit in Settings.]'; }, timeoutMs);
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => out += d.toString());
    child.on('close', (code) => { clearTimeout(killer); resolve({ code, out }); });
    child.on('error', (err) => { clearTimeout(killer); resolve({ code: -1, out: out + '\n' + err.message }); });
  });
}

// Turns raw LaTeX log noise into a short list of clickable problems (E1/E2).
const KNOWN_FIXES = [
  [/Undefined control sequence[\s\S]*?\\(\w+)/, (m) => `"\\${m[1]}" isn't defined. Check the spelling, or that the package defining it is loaded with \\usepackage.`],
  [/Citation `([^']+)' .*undefined/, (m) => `No reference "${m[1]}" in your .bib file. Add it in the Bibliography panel, or check the key spelling.`],
  [/! LaTeX Error: File `([^']+)' not found/, (m) => `The file "${m[1]}" is missing — check the path, or that the image/package exists in this project.`],
  [/! LaTeX Error: Environment (\w+) undefined/, (m) => `The environment "${m[1]}" isn't defined. Its package may not be loaded.`],
  [/! Package (\w+) Error: (.*)/, (m) => `Package "${m[1]}" reported: ${m[2]}`]
];

function parseLog(log) {
  const problems = [];
  const lines = log.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Two shapes an error can take with -file-line-error: "file.tex:LINE: message" (what we ask
    // pdflatex for), or a bare "! message" with the file/line a line or two below it.
    const fileLineError = line.match(/^(.+\.tex):(\d+):\s*(.*)$/);
    const isBangError = line.startsWith('!');
    if (fileLineError || isBangError || /^! /.test(line) || /^(?!.*Warning)[A-Za-z ]*Error[: ]/.test(line)) {
      const where = fileLineError ? { file: fileLineError[1], line: Number(fileLineError[2]) } : scanNearbyFileLine(lines, i);
      const text = (fileLineError ? fileLineError[3] : line.replace(/^!\s*/, '')) || line;
      // Give the fix-lookup a few lines of context, since the detail (e.g. the undefined
      // command name) often sits on the next line, not the one that announced the error.
      const context = lines.slice(i, i + 3).join('\n');
      let help = null;
      for (const [re, fn] of KNOWN_FIXES) { const m = context.match(re); if (m) { help = fn(m); break; } }
      problems.push({ severity: 'error', text: text.trim(), help, ...where });
    } else if (/^(LaTeX|Package|Class)(\s+\w+)?\s+Warning:|Overfull|Underfull/.test(line)) {
      const where = scanNearbyFileLine(lines, i);
      let help = null;
      for (const [re, fn] of KNOWN_FIXES) { const m = line.match(re); if (m) { help = fn(m); break; } }
      problems.push({ severity: 'warning', text: line.trim(), help, ...where });
    }
  }
  // "Latexmk: Errors, so I did not complete..." is a true but useless summary once we already
  // have the specific error(s) that caused it — drop it so the list doesn't pad itself out.
  const specific = problems.filter(p => !/^Latexmk:/.test(p.text));
  return specific.length ? specific : problems;
}
function scanNearbyFileLine(lines, i) {
  for (let j = i; j < Math.min(i + 4, lines.length); j++) {
    const m = lines[j].match(/(?:^|\s)(?:l\.(\d+)|lines (\d+)--\d+)/);
    if (m) return { line: Number(m[1] || m[2]) };
  }
  return {};
}

async function compile(projectRoot, mainFile, opts) {
  const found = tex.detect();
  if (!found.found) {
    return { ok: false, problems: [], rawLog: '', message: found.message };
  }
  const settings = storage.getSettings();
  const engine = (opts && opts.engine) || settings.engine || 'pdflatex';
  const timeoutMs = ((opts && opts.timeoutSec) || settings.timeoutSec || 60) * 1000;
  const shellEscape = !!(settings.shellEscape); // G3: off unless the user explicitly turned it on
  const started = Date.now();

  const args = ['-interaction=nonstopmode', '-file-line-error', `-${engine}`];
  if (shellEscape) args.push('-shell-escape');
  args.push(mainFile);

  let result;
  if (tex.which('latexmk') && settings.useLatexmk !== false) {
    result = await run('latexmk', ['-pdf', `-pdflatex=${engine} -interaction=nonstopmode -file-line-error${shellEscape ? ' -shell-escape' : ''} %O %S`, mainFile], projectRoot, timeoutMs);
  } else {
    result = await run(engine, args, projectRoot, timeoutMs);
    // Run again so cross-references / ToC settle, same as latexmk would.
    result = await run(engine, args, projectRoot, timeoutMs);
  }

  const problems = parseLog(result.out);
  const base = mainFile.replace(/\.tex$/, '');
  const pdfPath = path.join(projectRoot, base + '.pdf');
  const ok = fs.existsSync(pdfPath) && !problems.some(p => p.severity === 'error');
  return {
    ok,
    pdfPath: fs.existsSync(pdfPath) ? pdfPath : null,
    problems,
    rawLog: result.out,
    seconds: ((Date.now() - started) / 1000).toFixed(1)
  };
}

function cleanAux(projectRoot) {
  let removed = 0;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '.git' && entry.name !== '.history') walk(full); }
      else if (AUX_EXT.some(ext => entry.name.endsWith(ext))) { fs.unlinkSync(full); removed++; }
    }
  })(projectRoot);
  return { removed };
}

module.exports = { compile, cleanAux, parseLog };
