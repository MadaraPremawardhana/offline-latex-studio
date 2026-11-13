# Offline LaTeX Studio

Write and compile LaTeX reports, theses and slides without an internet connection. An Electron
desktop app for Windows (macOS/Linux buildable from the same source).

This is the first working build from the agreed wireframe scope — most of the **Keep** list is
wired up and functional; a few items are intentionally stubbed because they need something only
you can set up (your own OAuth app, your own bundled TeX Live). Each is called out below.

## Run it

```
npm install
npm start
```

## Build an installer

```
npm run dist:win     # Setup.exe (NSIS) + a portable .exe, on Windows
npm run dist:mac     # .dmg + .zip, on macOS
npm run dist:linux   # .AppImage + .deb, on Linux
```

Each only runs on its own OS — electron-builder can't cross-compile a real installer for a
different platform. **Push a tag like `v0.1.0`** and `.github/workflows/build.yml` builds all
three on GitHub's own Windows/macOS/Linux runners and attaches them to a GitHub Release; that's
the easiest way to get installers for every OS without owning a Mac or a Linux box.

The Windows `Setup.exe` is a normal NSIS wizard (pick a folder, Start Menu + desktop shortcuts,
clean uninstall from "Apps & features"). The portable `.exe` still works for anyone who'd rather
not install anything. Nothing is written outside the app's own folder either way (settings live
in the usual per-OS app-data folder).

If you build the Windows installer locally yourself: NSIS's packager (`makensis.exe`) can't open
paths longer than Windows' ~260-character limit, so build from a short path (e.g. `C:\build\`),
not deep inside something like a OneDrive-synced folder several levels down.

## What's functional in this build

- **Sign in / sign up** (S1, S4) — local account, hashed password, stays signed in offline.
- **Storage choice** (L1-L4) — GitHub repo or offline drive, switchable later in Settings.
- **GitHub mode** (H6, H7) — every save creates a branch named `save/<date>-<time>-<slug>`,
  commits, pushes, and merges to `main` when there's no conflict. If it *would* conflict, the
  branch is pushed and a pull request is opened instead of overwriting anyone's work.
- **Offline mode** (H1) — saves land in the same file; a local, restorable version list sits
  next to it in `.history/`.
- **TeX detection** (A1) — finds an existing MiKTeX/TeX Live install on PATH or a folder you point
  it at; **A3/E4** copy `.sty`/`.cls`/`.bst` files in from a local folder or USB.
- **Projects & templates** (B1-B4, C1-C3) — recent-projects list, open/import a folder, six
  built-in templates (report, thesis, article, Beamer slides, letter, CV) with a title-page form,
  and "save as my own template".
- **Editor** (D1-D7, D9/D10 partial) — file tree, CodeMirror with LaTeX syntax highlighting,
  side-by-side PDF preview (Electron's built-in PDF viewer), clean-aux-files, offline-friendly
  (no cloud spellcheck wired in yet — see Known gaps).
- **Compile & errors** (E1, E3, E5, G1, G3) — runs `latexmk`/`pdflatex`/`xelatex`/`lualatex`,
  parses the log into a clickable problem list, shell-escape off by default, compile time limit.
- **Bibliography** (F1, F2, F5) — list/search/add `.bib` entries, import an existing `.bib` file.
- **Word count** (H4) — texcount-style count split into main text / headings / captions.
- **Export** (H3) — save the compiled PDF, or zip the project source.
- **Settings** (G1-G4) — engine, latexmk, shell-escape, timeout, theme, font size, TeX path,
  switch storage mode, sign out.

## Known gaps / stubbed on purpose

- **Google/GitHub SSO buttons (S2, S3)** show a message instead of signing you in. A real "Sign
  in with Google/GitHub" button needs an **OAuth app registered on your own account**, with a
  client ID and secret I can't create for you — that's a step only you can take (Google Cloud
  Console / GitHub Developer Settings → OAuth Apps). This build connects GitHub a different way
  that needs no app review: paste in a **personal access token** (repo scope) on the storage
  screen. Swap `lib/github.js`'s `connect()` for a real OAuth flow once you've registered an app.
- **Bundled TeX distribution (A2)** — a full offline TeX Live is 400 MB–7 GB; that can't ship
  inside a chat-generated zip. This build detects and uses whatever MiKTeX/TeX Live you already
  have, or packages you point it at (A3). Bundling TeX Live itself is a separate, larger build
  step (fetch the distribution once, embed it in the installer) — worth doing once you're ready
  to ship this beyond a prototype.
- **Export to PDF/A, Word, bibliography DOI lookup (F4), symbol picker (D9), table/figure
  wizards (D10), institution templates (C4), built-in Git diff view (H2)** — UI hooks exist but
  the backend is thin or missing; flagged as **Later** in your decisions, so left light on
  purpose.
- **Offline spell check (D7)** — not wired to a dictionary yet; CodeMirror is in place to add one.

## Project layout

```
main.js        Electron main process — all file/compile/git work happens here
preload.js     the only bridge the renderer gets into main (contextIsolation on)
src/           the UI: index.html, styles.css (iOS-style light/dark), app.js
lib/           texDetect, compile, storage (accounts/settings/history/zip), github, bib, wordcount, templates
```

## Privacy

Everything — accounts, projects, compiled PDFs, local history — stays on this computer, in
Electron's standard per-user app-data folder. The only outbound calls this app makes are to
`api.github.com`, and only once you connect a GitHub repo.
