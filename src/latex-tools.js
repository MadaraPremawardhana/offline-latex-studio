// Overleaf-style writing help for the editor: a formatting/maths toolbar, a symbol palette,
// and autocomplete for commands, environments, citation keys and labels.
// In snippets, "|" marks where the cursor lands (and where selected text is wrapped).
const LatexTools = (() => {
  const TOOLBAR = [
    { select: 'Heading', options: [['Section', '\\section{|}'], ['Subsection', '\\subsection{|}'], ['Subsubsection', '\\subsubsection{|}'], ['Paragraph', '\\paragraph{|}'], ['Chapter', '\\chapter{|}']] },
    { label: '<b>B</b>', title: 'Bold (Ctrl+B)', snippet: '\\textbf{|}' },
    { label: '<i>I</i>', title: 'Italic (Ctrl+I)', snippet: '\\textit{|}' },
    { label: '<u>U</u>', title: 'Underline', snippet: '\\underline{|}' },
    { label: '<code>tt</code>', title: 'Monospace', snippet: '\\texttt{|}' },
    { sep: true },
    { label: '• List', title: 'Bulleted list', snippet: '\\begin{itemize}\n  \\item |\n\\end{itemize}\n', block: true },
    { label: '1. List', title: 'Numbered list', snippet: '\\begin{enumerate}\n  \\item |\n\\end{enumerate}\n', block: true },
    { sep: true },
    { label: '$x$', title: 'Inline maths', snippet: '$|$' },
    { label: '[ x ]', title: 'Display equation (numbered)', snippet: '\\begin{equation}\n  |\n\\end{equation}\n', block: true },
    { label: 'a⁄b', title: 'Fraction', snippet: '\\frac{|}{}', math: true },
    { label: '√', title: 'Square root', snippet: '\\sqrt{|}', math: true },
    { label: 'x²', title: 'Superscript', snippet: '^{|}', math: true },
    { label: 'x₂', title: 'Subscript', snippet: '_{|}', math: true },
    { label: '∑', title: 'Sum', snippet: '\\sum_{i=1}^{n} |', math: true },
    { label: '∫', title: 'Integral', snippet: '\\int_{a}^{b} | \\, dx', math: true },
    { label: 'lim', title: 'Limit', snippet: '\\lim_{x \\to \\infty} |', math: true },
    { label: '[⋮]', title: 'Matrix', snippet: '\\begin{pmatrix}\n  | & b \\\\\n  c & d\n\\end{pmatrix}', math: true },
    { label: 'Ω Symbols', title: 'Greek letters and maths symbols', action: 'symbols' },
    { sep: true },
    { label: '🖼 Figure', title: 'Insert an image', action: 'figure' },
    { label: '▦ Table', title: 'Insert a table', action: 'table' },
    { label: '🔗 Link', title: 'Hyperlink', snippet: '\\href{https://}{|}' },
    { label: '❝ Cite', title: 'Cite a reference', action: 'cite' },
    { label: '# Ref', title: 'Cross-reference a label', action: 'ref' }
  ];

  const sym = (s) => s.trim().split(/\s+/).map(p => { const i = p.indexOf(':'); return [p.slice(0, i), '\\' + p.slice(i + 1)]; });
  const SYMBOLS = {
    Greek: sym('α:alpha β:beta γ:gamma δ:delta ε:epsilon ζ:zeta η:eta θ:theta ι:iota κ:kappa λ:lambda μ:mu ν:nu ξ:xi π:pi ρ:rho σ:sigma τ:tau υ:upsilon φ:phi χ:chi ψ:psi ω:omega Γ:Gamma Δ:Delta Θ:Theta Λ:Lambda Ξ:Xi Π:Pi Σ:Sigma Φ:Phi Ψ:Psi Ω:Omega'),
    Operators: sym('±:pm ∓:mp ×:times ÷:div ·:cdot ∗:ast ∘:circ ⊕:oplus ⊗:otimes ∑:sum ∏:prod ∫:int ∬:iint ∮:oint ∂:partial ∇:nabla √:sqrt{} ∞:infty ∩:cap ∪:cup ∧:land ∨:lor ¬:neg'),
    Relations: sym('≤:leq ≥:geq ≠:neq ≈:approx ≡:equiv ∼:sim ≃:simeq ∝:propto ≪:ll ≫:gg ∈:in ∉:notin ⊂:subset ⊆:subseteq ⊃:supset ⊇:supseteq ⊥:perp ∥:parallel ≺:prec ≻:succ'),
    Arrows: sym('←:leftarrow →:rightarrow ↔:leftrightarrow ⇐:Leftarrow ⇒:Rightarrow ⇔:Leftrightarrow ↑:uparrow ↓:downarrow ↦:mapsto ⟶:longrightarrow ⟹:implies ⟺:iff ↗:nearrow ↘:searrow'),
    Other: sym('∀:forall ∃:exists ∅:emptyset ℝ:mathbb{R} ℕ:mathbb{N} ℤ:mathbb{Z} ℚ:mathbb{Q} ℂ:mathbb{C} ℏ:hbar ℓ:ell ℜ:Re ℑ:Im ∠:angle △:triangle °:degree …:dots ⋯:cdots ⋮:vdots ⋱:ddots ′:prime †:dagger')
  };

  const cmd = (text, note, snippet) => ({ text, note, snippet });
  const COMMANDS = [
    cmd('\\begin{}', 'environment', '\\begin{|}'), cmd('\\end{}', '', '\\end{|}'),
    cmd('\\section{}', 'heading', '\\section{|}'), cmd('\\subsection{}', 'heading', '\\subsection{|}'), cmd('\\subsubsection{}', 'heading', '\\subsubsection{|}'),
    cmd('\\chapter{}', 'heading', '\\chapter{|}'), cmd('\\paragraph{}', 'heading', '\\paragraph{|}'),
    cmd('\\textbf{}', 'bold', '\\textbf{|}'), cmd('\\textit{}', 'italic', '\\textit{|}'), cmd('\\emph{}', 'emphasis', '\\emph{|}'), cmd('\\underline{}', 'underline', '\\underline{|}'),
    cmd('\\texttt{}', 'monospace', '\\texttt{|}'), cmd('\\textsc{}', 'small caps', '\\textsc{|}'), cmd('\\footnote{}', 'footnote', '\\footnote{|}'),
    cmd('\\item', 'list item', '\\item |'), cmd('\\label{}', 'label', '\\label{|}'), cmd('\\ref{}', 'reference', '\\ref{|}'), cmd('\\eqref{}', 'equation ref', '\\eqref{|}'),
    cmd('\\cite{}', 'citation', '\\cite{|}'), cmd('\\citep{}', 'citation', '\\citep{|}'), cmd('\\citet{}', 'citation', '\\citet{|}'),
    cmd('\\usepackage{}', 'package', '\\usepackage{|}'), cmd('\\documentclass{}', '', '\\documentclass{|}'), cmd('\\input{}', 'include file', '\\input{|}'), cmd('\\include{}', 'include file', '\\include{|}'),
    cmd('\\includegraphics[]{}', 'image', '\\includegraphics[width=0.8\\linewidth]{|}'), cmd('\\caption{}', 'caption', '\\caption{|}'), cmd('\\centering', ''),
    cmd('\\title{}', '', '\\title{|}'), cmd('\\author{}', '', '\\author{|}'), cmd('\\date{}', '', '\\date{|}'), cmd('\\maketitle', ''), cmd('\\tableofcontents', ''),
    cmd('\\bibliography{}', '', '\\bibliography{|}'), cmd('\\bibliographystyle{}', '', '\\bibliographystyle{|}'), cmd('\\printbibliography', ''),
    cmd('\\newcommand{}{}', 'define command', '\\newcommand{\\|}{}'), cmd('\\newpage', ''), cmd('\\clearpage', ''), cmd('\\noindent', ''), cmd('\\today', ''),
    cmd('\\href{}{}', 'link', '\\href{|}{}'), cmd('\\url{}', 'link', '\\url{|}'), cmd('\\hline', ''), cmd('\\toprule', ''), cmd('\\midrule', ''), cmd('\\bottomrule', ''),
    cmd('\\vspace{}', 'space', '\\vspace{|}'), cmd('\\hspace{}', 'space', '\\hspace{|}'), cmd('\\quad', 'space'), cmd('\\qquad', 'space'),
    cmd('\\frac{}{}', 'fraction', '\\frac{|}{}'), cmd('\\sqrt{}', 'root', '\\sqrt{|}'), cmd('\\sum', 'Σ'), cmd('\\prod', 'Π'), cmd('\\int', '∫'), cmd('\\lim', 'limit'),
    cmd('\\left(', 'sized bracket', '\\left( | \\right)'), cmd('\\left[', 'sized bracket', '\\left[ | \\right]'), cmd('\\mathbf{}', 'bold maths', '\\mathbf{|}'),
    cmd('\\mathbb{}', 'blackboard', '\\mathbb{|}'), cmd('\\mathcal{}', 'calligraphic', '\\mathcal{|}'), cmd('\\mathrm{}', 'upright', '\\mathrm{|}'), cmd('\\text{}', 'text in maths', '\\text{|}'),
    cmd('\\hat{}', 'accent', '\\hat{|}'), cmd('\\bar{}', 'accent', '\\bar{|}'), cmd('\\vec{}', 'accent', '\\vec{|}'), cmd('\\dot{}', 'accent', '\\dot{|}'), cmd('\\tilde{}', 'accent', '\\tilde{|}'),
    cmd('\\overline{}', '', '\\overline{|}'), cmd('\\sin', ''), cmd('\\cos', ''), cmd('\\tan', ''), cmd('\\log', ''), cmd('\\ln', ''), cmd('\\exp', ''), cmd('\\min', ''), cmd('\\max', ''),
    cmd('\\ldots', '…'), cmd('\\cdots', '⋯')
  ].concat(Object.values(SYMBOLS).flat().map(([ch, c]) => cmd(c, ch)));

  const ENVIRONMENTS = ['document', 'abstract', 'itemize', 'enumerate', 'description', 'figure', 'table', 'tabular', 'equation', 'equation*', 'align', 'align*', 'gather', 'multline', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'center', 'quote', 'verbatim', 'frame', 'columns', 'block', 'theorem', 'lemma', 'proof', 'definition', 'minipage', 'thebibliography', 'tikzpicture', 'lstlisting', 'appendix'];
  const PACKAGES = ['amsmath', 'amssymb', 'amsthm', 'graphicx', 'hyperref', 'geometry', 'babel', 'inputenc', 'fontenc', 'booktabs', 'caption', 'subcaption', 'xcolor', 'tikz', 'listings', 'biblatex', 'natbib', 'cleveref', 'siunitx', 'float', 'enumitem', 'fancyhdr', 'setspace', 'microtype', 'multirow', 'longtable', 'array', 'mathtools', 'algorithm', 'algpseudocode', 'url', 'parskip', 'titlesec', 'tabularx'];
  const MATH_ENVS = 'equation|align|gather|multline|eqnarray|displaymath|math|cases|matrix|pmatrix|bmatrix';

  // True when the cursor sits inside $...$, \[...\], \(...\) or a maths environment.
  function inMath(cm) {
    const before = cm.getRange({ line: 0, ch: 0 }, cm.getCursor()).replace(/\\\\/g, '').replace(/(^|[^\\])%.*$/gm, '$1');
    const dollars = (before.replace(/\\\$/g, '').match(/\$/g) || []).length;
    if (dollars % 2 === 1) return true;
    const count = (re) => (before.match(re) || []).length;
    if (count(/\\\[/g) > count(/\\\]/g) || count(/\\\(/g) > count(/\\\)/g)) return true;
    return count(new RegExp(`\\\\begin\\{(${MATH_ENVS})\\*?\\}`, 'g')) > count(new RegExp(`\\\\end\\{(${MATH_ENVS})\\*?\\}`, 'g'));
  }

  // Inserts a snippet at the cursor, wrapping any selected text at the "|" marker.
  function insert(cm, snippet, opts) {
    opts = opts || {};
    if (opts.math && !inMath(cm)) snippet = '$' + snippet + '$';
    const selected = cm.getSelection();
    const cursorAt = snippet.indexOf('|');
    let text = cursorAt < 0 ? snippet : snippet.slice(0, cursorAt) + selected + snippet.slice(cursorAt + 1);
    const from = cm.getCursor('from');
    if (opts.block && from.ch > 0) { text = '\n' + text; }
    cm.replaceSelection(text);
    if (cursorAt >= 0) {
      const offset = cm.indexFromPos(from) + (opts.block && from.ch > 0 ? 1 : 0) + cursorAt + selected.length;
      cm.setCursor(cm.posFromIndex(offset));
    }
    cm.focus();
  }

  function hintItem(displayText, note, apply) {
    return {
      text: displayText,
      render(el) { el.appendChild(document.createTextNode(displayText)); const n = document.createElement('span'); n.className = 'hint-note'; n.textContent = note || ''; el.appendChild(n); },
      hint: apply
    };
  }

  // getContext() supplies { bibKeys: [...], labels: [...] } for \cite{ and \ref{ completion.
  function hint(cm, getContext) {
    const cur = cm.getCursor();
    const line = cm.getLine(cur.line).slice(0, cur.ch);
    const after = cm.getLine(cur.line).slice(cur.ch);
    const closeBrace = (endCh) => (after.startsWith('}') ? { line: cur.line, ch: endCh + 1 } : { line: cur.line, ch: endCh });
    let m;

    if ((m = line.match(/\\(begin|end)\{([A-Za-z*]*)$/))) {
      const from = { line: cur.line, ch: cur.ch - m[2].length };
      const list = ENVIRONMENTS.filter(e => e.startsWith(m[2])).map(env => hintItem(env, 'environment', (cm2) => {
        if (m[1] === 'end') { cm2.replaceRange(env + '}', from, closeBrace(cur.ch)); return; }
        const indent = cm2.getLine(cur.line).match(/^\s*/)[0];
        const body = /^(itemize|enumerate|description)$/.test(env) ? '\\item ' : '';
        cm2.replaceRange(`${env}}\n${indent}  ${body}\n${indent}\\end{${env}}`, from, closeBrace(cur.ch));
        cm2.setCursor({ line: cur.line + 1, ch: indent.length + 2 + body.length });
      }));
      return { list, from, to: cur };
    }
    if ((m = line.match(/\\(cite[a-zA-Z]*|ref|eqref|autoref|cref|Cref|pageref|usepackage(?:\[[^\]]*\])?)\{([^{}]*)$/))) {
      const typed = m[2].split(',').pop().trimStart();
      const from = { line: cur.line, ch: cur.ch - typed.length };
      const ctx = getContext();
      const kind = m[1].startsWith('cite') ? 'cite' : m[1].startsWith('usepackage') ? 'pkg' : 'ref';
      const pool = kind === 'cite' ? ctx.bibKeys.map(k => [k.key, k.note]) : kind === 'pkg' ? PACKAGES.map(p => [p, 'package']) : ctx.labels.map(l => [l, 'label']);
      const list = pool.filter(([k]) => k.toLowerCase().includes(typed.toLowerCase())).map(([k, note]) => hintItem(k, note, (cm2) => cm2.replaceRange(k, from, cur)));
      return { list, from, to: cur };
    }
    if ((m = line.match(/\\[A-Za-z]*$/))) {
      const typed = m[0];
      const from = { line: cur.line, ch: cur.ch - typed.length };
      const starts = COMMANDS.filter(c => c.text.startsWith(typed));
      const list = starts.slice(0, 60).map(c => hintItem(c.text, c.note, (cm2) => {
        cm2.replaceRange('', from, cur);
        insert(cm2, c.snippet || c.text);
        if (/\\(begin|cite[a-z]*|ref|eqref|usepackage)\{\|\}$/.test(c.snippet || '')) setTimeout(() => cm2.showHint(), 0);
      }));
      return { list, from, to: cur };
    }
    return null;
  }

  // Enter straight after \begin{env} adds the matching \end{env} when it is missing.
  function closeEnvironmentOnEnter(cm) {
    const cur = cm.getCursor();
    const lineText = cm.getLine(cur.line);
    const m = lineText.slice(0, cur.ch).match(/^(\s*).*\\begin\{([^}]+)\}(\[[^\]]*\]|\{[^}]*\})*\s*$/);
    if (!m || lineText.slice(cur.ch).trim() || cm.somethingSelected()) return CodeMirror.Pass;
    const env = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const doc = cm.getValue();
    const opens = (doc.match(new RegExp(`\\\\begin\\{${env}\\}`, 'g')) || []).length;
    const closes = (doc.match(new RegExp(`\\\\end\\{${env}\\}`, 'g')) || []).length;
    if (opens <= closes) return CodeMirror.Pass;
    const body = /^(itemize|enumerate|description)$/.test(m[2]) ? '\\item ' : '';
    cm.replaceSelection(`\n${m[1]}  ${body}\n${m[1]}\\end{${m[2]}}`);
    cm.setCursor({ line: cur.line + 1, ch: m[1].length + 2 + body.length });
  }

  function tableSnippet(rows, cols) {
    const row = (cell) => '    ' + Array.from({ length: cols }, (_, i) => cell(i)).join(' & ') + ' \\\\';
    const lines = [row(i => `Header ${i + 1}`), '    \\hline'];
    for (let r = 1; r < rows; r++) lines.push(row(() => ' '));
    return `\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{${'l'.repeat(cols)}}\n    \\hline\n${lines.join('\n')}\n    \\hline\n  \\end{tabular}\n  \\caption{|}\n  \\label{tab:}\n\\end{table}\n`;
  }
  function figureSnippet(relPath) {
    return `\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${relPath}}\n  \\caption{|}\n  \\label{fig:}\n\\end{figure}\n`;
  }

  return { TOOLBAR, SYMBOLS, insert, hint, inMath, closeEnvironmentOnEnter, tableSnippet, figureSnippet };
})();
