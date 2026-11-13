// C1/C2/C3/C4: the built-in template gallery and the title-page form that fills one in.
const fs = require('fs');
const path = require('path');
const storage = require('./storage');

function userTemplatesDir() {
  const dir = path.join(path.dirname(require('electron').app.getPath('userData')), 'OfflineLatexStudio', 'templates');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const BUILTIN = {
  report: {
    label: 'Report', hint: 'chapters, table of contents',
    main: (f) => `\\documentclass[12pt]{report}
\\usepackage[a4paper,margin=2.5cm]{geometry}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{${f.title}}
\\author{${f.author}}
\\date{${f.date}}

\\begin{document}
\\maketitle
\\tableofcontents

\\input{chapters/intro}

\\bibliographystyle{plain}
\\bibliography{refs}
\\end{document}
`,
    extra: { 'chapters/intro.tex': '\\chapter{Introduction}\nStart writing here.\n', 'refs.bib': '' }
  },
  thesis: {
    label: 'Thesis', hint: 'front matter, abstract',
    main: (f) => `\\documentclass[12pt,twoside]{report}
\\usepackage[a4paper,margin=3cm]{geometry}
\\usepackage{graphicx}
\\usepackage{setspace}
\\onehalfspacing

\\begin{document}
\\begin{titlepage}
  \\centering
  \\vspace*{3cm}
  {\\Large ${f.title}}\\\\[1cm]
  ${f.author}\\\\[0.5cm]
  ${f.institution}\\\\[2cm]
  ${f.date}
\\end{titlepage}

\\begin{abstract}
Write your abstract here.
\\end{abstract}

\\tableofcontents
\\input{chapters/intro}

\\bibliographystyle{plain}
\\bibliography{refs}
\\end{document}
`,
    extra: { 'chapters/intro.tex': '\\chapter{Introduction}\n', 'refs.bib': '' }
  },
  article: {
    label: 'Article', hint: 'two-column',
    main: (f) => `\\documentclass[twocolumn]{article}
\\usepackage[a4paper,margin=2cm]{geometry}
\\usepackage{graphicx}

\\title{${f.title}}
\\author{${f.author}}
\\date{${f.date}}

\\begin{document}
\\maketitle
\\section{Introduction}
Start writing here.

\\bibliographystyle{plain}
\\bibliography{refs}
\\end{document}
`,
    extra: { 'refs.bib': '' }
  },
  slides: {
    label: 'Slides', hint: 'Beamer',
    main: (f) => `\\documentclass{beamer}
\\usetheme{default}
\\title{${f.title}}
\\author{${f.author}}
\\institute{${f.institution}}
\\date{${f.date}}

\\begin{document}
\\frame{\\titlepage}
\\begin{frame}{Overview}
  \\begin{itemize}
    \\item First point
    \\item Second point
  \\end{itemize}
\\end{frame}
\\end{document}
`,
    extra: {}
  },
  letter: {
    label: 'Letter', hint: '',
    main: (f) => `\\documentclass{letter}
\\signature{${f.author}}
\\address{${f.institution}}
\\begin{document}
\\begin{letter}{Recipient\\\\Address}
\\opening{Dear Sir or Madam,}
Write your letter here.
\\closing{Yours sincerely,}
\\end{letter}
\\end{document}
`,
    extra: {}
  },
  cv: {
    label: 'CV', hint: '',
    main: (f) => `\\documentclass[11pt]{article}
\\usepackage[margin=2cm]{geometry}

\\begin{document}
\\begin{center}
  {\\Large \\textbf{${f.author}}}
\\end{center}

\\section*{Education}
\\section*{Experience}
\\section*{Skills}
\\end{document}
`,
    extra: {}
  }
};

function list() {
  const builtin = Object.entries(BUILTIN).map(([id, t]) => ({ id, label: t.label, hint: t.hint, source: 'builtin' }));
  const dir = userTemplatesDir();
  const mine = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())
    .map(e => ({ id: e.name, label: e.name, hint: 'your template', source: 'mine' }));
  return builtin.concat(mine);
}

function createProject({ templateId, title, author, institution, date, folder, name }) {
  const root = path.join(folder, (name || title || 'Untitled Project').replace(/[\\/:*?"<>|]/g, '').trim());
  fs.mkdirSync(root, { recursive: true });
  const form = { title: title || 'Untitled', author: author || '', institution: institution || '', date: date || '\\today' };

  if (BUILTIN[templateId]) {
    const t = BUILTIN[templateId];
    fs.writeFileSync(path.join(root, 'main.tex'), t.main(form));
    for (const [rel, content] of Object.entries(t.extra || {})) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  } else {
    const src = path.join(userTemplatesDir(), templateId);
    copyDir(src, root);
  }
  const entry = storage.registerProject(root, name || title);
  return entry;
}

function saveAsTemplate(projectPath, name) {
  const dest = path.join(userTemplatesDir(), name.replace(/[\\/:*?"<>|]/g, '').trim());
  fs.mkdirSync(dest, { recursive: true });
  copyDir(projectPath, dest);
  return { ok: true, id: path.basename(dest) };
}
function copyDir(src, dest) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (['.git', '.history', 'node_modules'].includes(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); }
    else fs.copyFileSync(s, d);
  }
}

module.exports = { list, createProject, saveAsTemplate };
