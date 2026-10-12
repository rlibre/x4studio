# x4studio

A no-code editor of the pages of applications made with x4js: pages made of x4 components laid out in boxes, described as data, generated as TypeScript classes the user derives from. Written by Etienne Cochard (author of x4js) with Claude. He writes in French; code, comments and `todo.md` are in English.

This folder is the project since 2026-10-12. It was `projets/x4studio` in the x4 repository (`C:\dev\rlibre\x4-2025`), where `projets/` is ignored by git: the studio had never been under version control before. The code it shared with the report designer (`projets/shared`) was copied here and merged into `src`, without what only the designer used.

## Read first

- `todo.md`: the record of every decision, of what was done and why, and of what is open. Long, and worth it. Paths written in it before 2026-10-12 are those of the old place (`projets/x4studio`, `projets/shared`).
- `.claude/memory/`: the memory of the sessions held in the x4 repository, copied here. At the first session in this folder, copy what applies into the memory directory of this project (see "Memory" below).

## Rules (Etienne's, they hold here)

- Never read, list or write outside this folder without asking. Two exceptions he gave: `c:/temp` for trials and throwaway files; and reading the x4 sources this project builds against (below).
- Git is read-only: `status`, `diff`, `log`. He commits himself.
- No dependency, no `npm install`, without discussing it first.
- Propose before acting, for anything that has a choice in it: a design, an API, where something goes in the UI. "Or propose better" means propose and wait, not pick and build. When he names what he wants (a tab), start from that.
- What he sees on screen is a fact. Reproduce it in the headless browser (below) before reading code, and never answer that the code cannot do that.
- x4 is a framework many vendors use: never change it (`C:\dev\rlibre\x4-2025\src`, `cli`) without showing the cause and a diff, and waiting for his yes. Then an entry in its `changelog.md`; `aicontext.md` only after showing the lines. x4's own files never mention this project.
- The studio names no component: nothing in its code, or in what it shows, knows a Button or a Listbox. Everything comes from descriptions (`src/components.json`, and the project's own). Comments may use them as examples.
- Notes for later go in `todo.md`, in his words, with what I understand labelled as mine.
- Style he asked for: a plain `if` on an object over repeated `?.` with `??`; x4 imported as `"x4js"`, as in the code the studio generates (his choice, 2026-10-12; it was `"@x4"` when the studio was a sub-project of the x4 repository); no global table and loop for a few explicit calls; no stripping of props before `super( props )`.
- "raf" in his messages means "rien à foutre": drop it.

## x4

The studio builds against the local sources of x4, not the npm package: it needs what is not published yet (2.3.17: bands of `DockingView`, `renderer` of `Combobox`, variables of `Notification`...).

- The sources import `"x4js"`, and `tsconfig.json` maps that name to `../x4-2025/src/x4.ts`. Once 2.3.17 is on npm (on 2026-10-12 the registry still had 2.3.16) and installed here, with Etienne's yes, that line of `tsconfig.json` goes away and nothing else changes.
- `aicontext.md`, in the x4 repository, is the summary of its API: read it before the sources. Go to the sources for what it does not say (defaults, what a component cannot do without, inner CSS classes), and tell Etienne what was missing.

## Commands

From this folder. TypeScript and the x4 command line are those of the x4 repository; nothing is installed here but `@fontsource/montserrat` and `playwright`.

    node ../x4-2025/node_modules/typescript/bin/tsc -p .                               # types
    node --test "test/**/*.test.ts"                                                     # unit tests (node runs the .ts files as they are)
    node ../x4-2025/demo/notes/node_modules/x4js/bin/x4js.mjs build --debug             # build, into bin/

Etienne runs a dev server that rebuilds as files change: he sees intermediate states while I edit.

## Seeing the screen

`playwright` is a dev dependency, with its Chromium inside `node_modules` (no window is opened, nothing is installed elsewhere). After a build:

    PLAYWRIGHT_BROWSERS_PATH=0 node test/browser/look.mjs      # screenshots into test/browser/shots (not in git): read the PNGs

`test/browser/` also has `picker.mjs`, `tabs.mjs`, `chat.mjs` (the API is simulated), `theme.mjs`, `try.mjs`, `notify.mjs`. They are not part of `npm test`. Run the ones a change touches before saying it is done.

## Layout

- `src/core/`: no DOM, runs under node (tests). `components.ts` (descriptions, and `describe( node )`, the one source of both the surface and the generated code), `generate.ts`, `document.ts` + `box.ts` + `registry.ts` + `history.ts` + `clipboard.ts` (the tree of a page), `styles.ts`, `theme.ts`, `icons.ts`, `project.ts` + `store.ts` + `zip.ts` (a project is a folder; on the web, a zip in memory), `assistant.ts` + `claude.ts` (the chat with Claude; `fetch` by hand), `cache.ts` (browser only: the project kept in IndexedDB).
- `src/view/`: x4 components. `surface.ts` (the page, inert, with a layer above it; `setTrying` makes it alive), `inspector.ts` + `fields.ts`, `projectpanel.ts`, `themepanel.ts`, `chatpanel.ts`, `tree.ts`, `tools.ts`, `itemtools.ts`, `iconpicker.ts`, `pagetheme.ts`, `current.ts` (the surface the panels talk to).
- `src/main.ts`: the host. `src/components.json`: the components, the CSS properties (`look`) and the colors of a theme, as data. `src/demo.json`: the project the studio starts on when nothing is kept.

## Memory

`.claude/memory/` holds the memory files of the sessions in the x4 repository, as they were on 2026-10-12, with their index (`MEMORY.md`). They are written for that repository: some speak of things that are not here (the x4 site, the templates, the old report designer). What matters for this project is said again above; the files give the dates, the words and the reasons.
