# x4studio: to do

> Moved on 2026-10-12 (Etienne: "I created C:\dev\rlibre\x4-studio; move the project there... since shared is a local dependency, move it there too", then "merge shared into the sources; clean shared of what is of no use"). The project is this folder now. What is written below before that date names the old places: `projets/x4studio` is this folder, and `projets/shared` is no more: what the studio used of it is in `src/core` (`document.ts`, `box.ts`, `registry.ts`, `history.ts`, `clipboard.ts`) and `src/view` (`tree.ts`, `tools.ts`, `editor.ts`, `keys.ts`), its icons with those of the studio. Taken out: the matrices, the angles and the rotation centers of a box, the groups, the tools of the selection and of the page, the properties panel, the colors a document used last. The rule of the changelog of `shared` does not hold here: there is no `shared`. The original stays in the x4 repository, for the designer. See `CLAUDE.md`.

Things noted for later. Nothing here is decided, unless it says so.

## Decided (Etienne, 2026-10-09)

- x4studio sticks to how x4 is used. `Box` is very rarely used directly: the containers are `VBox` and `HBox`, two types, not one box with a direction.
- A container is a node with children. It has a gap, a padding and an alignment. The page behaves as a `VBox`.
- Sizes: on each axis, auto, fixed (pixels) or flex (a weight). They are kept in `props` (`width`, `height`, `flex`), not in `node.box`, and edited in the properties panel only: no handles on the surface for now.
- Insertion: a click in the palette inserts into the box that is selected, or after the component that is selected; at the end of the page when nothing is. To be refined with use. Dragging from the palette, and dragging a component on the surface, come after.
- Output: TypeScript, the Qt way. Generated code that the user derives from: explicit x4 code (`new VBox( { content: [...] } )`), with the document as JSON in a comment at the end, which the studio reads to open the page again. Its header says not to edit it.
- The name given to a component in the tree is its key in `refs`. Only the named components are there.
- The surface shows real x4 components.
- Events, actions and data binding: later.
- Several pages: several surfaces in the `DockingView`.
- A project file, and a project tool (a panel of the dock).
- The studio works on a project folder: it is opened as a whole, as an IDE opens one.
- Two modes: a desktop application (Wails) and a web page, as draw.io does: the same editor in both, and only where the files are kept differs. A hosted mode too (the studio served, the files on the server), which changes little.
- What the studio keeps about a project is JSON, in a folder `.x4studio` at the root of the project, as `.vscode` is: `project.json` (the name, the import of x4, the folders of the pages and of the icons), later `styles.json` and `theme.json`. In `.x4studio`, what only the studio reads; in `src`, what the application compiles (the generated pages, the generated stylesheet, the icons). Etienne first thought of a file `.project` (the name of the project file of Eclipse, and it does not say whose it is), then of `x4studio.json`.
- The components the studio knows are described in JSON, not in its sources: adding a component to handle must not mean changing the code of the studio (Etienne, 2026-10-09, on the skeleton, where each component was a `case` of `core/components.ts` and of the surface). Those the studio comes with are in `src/components.json`; a project adds its own, or says again one of the studio, in `.x4studio/components.json`. A description gives the type, the title, the x4 class, a `description` (shown as a tooltip in the palette), an `icon` (the source of an svg, in the JSON itself), `container`, `fixed` props, and properties with `default`, `initial`, `prop`, `style` and `list` (see `core/components.ts`).
- Later, to decide in x4: each component could give its description itself, as a static. The JSON has the shape it would then have.
- The web mode first, with the project as a zip. Wails comes later, but the design has to have it in mind from the start: everything that touches a file is asynchronous, behind one interface. The folder of the project opened by the browser itself (File System Access): we will see.
- A style editor and a theme editor (see below).
- Something for the icons (see below).
- Previews in several formats, for the adaptive mode: to be looked at (see below).
- No zoom: it does not matter. The page is shown at 100%, and scrolls.

## The skeleton (2026-10-09)

What is there: one page, `VBox`, `HBox`, `Label`, `Button` and `Input`, the palette, the tree, the properties, and the generated code shown in a panel. Nothing is saved.

Tried on screen by Etienne on 2026-10-09: ok.

Added the same day, tested under node: the zip archive (`core/zip.ts`, also checked both ways against the zip tools of Windows), where the files of a project are kept (`core/store.ts`: `ProjectStore`, `ZipStore`) and the project (`core/project.ts`: `.x4studio/project.json`, the pages found in their folder). The name of the class of a page is in its document.

Then, not seen on screen by Etienne yet:

- The components come from `src/components.json`, and the surface finds a class by its name in the x4 module. `BtnGroup` was added.
- The project tool (`view/projectpanel.ts`): new project, open a zip, save (the zip is downloaded, also Mod+S), and the pages: add, show, rename, delete.
- One surface per page that is open; they are all in the content panel, and only the one that is shown is seen. The shared panels talk to `CurrentSurface` (`view/current.ts`), which stands for it.
- The studio starts on a new project, "Untitled", with one page that holds a sample.

To settle, from what Etienne said while it was written:

- Settled (Etienne, 2026-10-09), and done: the page has no gap (a box inside it gives one), keeps its padding and its align, and either fits or has a fixed size. `fit` is a class: the description of the page has a boolean `fit` whose `cls` is `x4fit`, the class of x4 (width and height: stretch). A page that fits is generated with `this.addClass( "x4fit" )` and takes all the room of the surface; one that does not has the size of its box, generated in its style (`width`, `height`). A new page does not fit: it is 800 x 600. `cls` works for any boolean of any description (the `outline` of a button).
- Items (agreed by Etienne, 2026-10-09, and done; not seen on screen yet). The children of a `BtnGroup` can be texts ("ok", "-") as well as components, in one list; the same idea had to suit a list (the items of a `Listbox`). A description says which prop takes its children (`content`: "items" and not "content"), which components it takes beside its items (`accepts`), and describes its own items (`items`). An item is not a component: it has no class, and is generated as a value (`"item": "value"`, the text "ok.outline") or as an object (`"item": "object"`, `{ id, text }`). On the surface, the child number n is the element number n the owner built (`parts`, a CSS selector), so an item is caught and framed as a component is. "A list item cannot be used by itself" (Etienne): an item is described inside its owner, is not in the palette, and is offered under it when its owner, or one of its children, is selected (`view/itemtools.ts`). `Listbox` was added for that. Left: two list items get the same first id ("item"), which the user has to change. After he tried it: the buttons of the items are under the row of undo, delete and move, where nothing moves when they come and go; a right click on the owner, or on one of its children, offers "Add: <item>", with the choices of the item when its first property is one (the usual buttons); the usual button of a row of buttons is a choice (ok, cancel, yes...) and booleans (outline, default, disabled), joined with a dot in what is generated (`"join": "."`).
- The studio names no component (Etienne, 2026-10-09, on a help text that named two): nothing in its code, nor in what it shows, may know a component. They are what the descriptions say. The comments of the sources still take components as examples.
- The studio starts on a demo project (asked by Etienne, 2026-10-09: "otherwise I have to make a page each time the code changes"). It is data, `src/demo.json`: the styles as `styles.json` keeps them, and two pages as their documents ("Demo": a form in a class, a row of buttons with usual ones and one of its own, a list, a component that sets its own values over a class, a class and a component that set variables, an empty box; "DemoFit": a page that fits). A test checks that it only uses what is described. To keep up to date with what the studio learns to do.

The pages of the project tool are a `Listbox` of x4 (Etienne, 2026-10-09: they were rows made by hand, for no good reason).

Chosen without a decision; he did not go through them one by one, they can still be changed:

- The first components: `VBox`, `HBox`, `Label`, `Button`, `Input` (text).
- The size of the page while it is edited is the box of the root node (`w`, `h`), shown as the width and the height of the page in the properties. Etienne did not know (2026-10-09).
- A node hidden in the tree is built hidden (`hidden: true`), on the surface and in the generated code. The other reading: hidden in the editor only.
- A name that cannot be written after a dot ("the big one"), or that another component of the page already has, is not a key of `refs`: it stays a label. The editor does not say so yet.
- A click selects the innermost component under the pointer; Escape goes to the box around it. The arrows move the selection among its siblings.
- Every box shows a thin dashed line, and an empty one keeps 32 pixels: aids of the editor, always on.

Not done:

- Several pages seen at once: it needs `DockingView` to take a new content panel (see "Needed in x4").
- The components of a project that are classes of its own, not of x4: the studio cannot run them without compiling them.
- Properties that are not simple values: the items of a `Listbox`, the pages of a `Tabs`, the columns of a `Gridview`.
- Opening the same zip twice in a row: the browser does not say the file was chosen again.
- Nothing warns when the page of the browser is closed with changes that are not saved.
- Copy and paste only work with the keyboard (the events of the browser); there is no item for them in the menu.
- Tab does not go from a component to the next.

## Added on 2026-10-12

Not seen on screen by Etienne yet, unless it says so.

- The inspector says what kind of component is selected: its icon and the title of its type, then the name the user gave it; "3 x Button" or "3 components: Button, Label" for several.
- The project tool has three tabs (`Tabs` of x4): "Pages", "Classes" and "Icons".
  - Classes: the styles of the project. A click on one shows its style in the inspector, a double click gives it to what is selected on the page; "+", Rename, Delete. The class that is selected is the one the inspector edits, both ways.
  - Icons: the svg files of the folder of icons of the project (`src/icons`), each drawn before its name. Files are dropped on the list itself (Etienne: "a label, and accept the drop on the listbox", not a zone apart), or chosen with "+"; Rename, Delete. An svg that has a script, or something that runs on an event, is refused. An icon gets its name from its file ("My Icon (2).svg": "my-icon-2"), with a number after it when the name is taken.
- An icon is given to a component (Etienne: "choose an icon in a button and in every element that accepts one"): a kind of property, `"icon"`, whose value is the name of an icon of the project. On the surface, the component is built with the svg itself; in the code, with `icons.<key>` ("trash-bin": `icons.trashBin`), from `import icons from "../icons";`.
  - The project has a module for that, `src/icons.ts` (the folder of the icons, with `.ts`), which imports each svg and exports them as one object. The studio writes it each time an icon is added, renamed or removed (Etienne: "when an icon is added, an icons.ts file has to be made if it is missing, or it cannot be used in the project"). A file of that name the studio did not write (no "GENERATED BY x4studio" at its top) is left as it is: the pages then import what it does not have.
  - The picker (Etienne: "something else than a combo, there may be a lot of them; add a preview"): a popup under the field, `view/iconpicker.ts`. The icons as they are drawn, four in a row, with their name under them; a field keeps those whose name holds what is typed; Enter takes the first, Escape closes; "(none)" is the first tile. The grid scrolls over 300px.
  - Left: renaming an icon does not rename it in the pages that use it (they keep the old name, shown as "missing").
- The page fits by default (Etienne: "fit should be the default for the pages"): `fit` is true unless the page says otherwise.
- What is around the page is a neutral dark grey, not the blue of the studio (`--studio-back`, in `theme.scss`).
- The components that were missing (Etienne: "add the missing components"), all as descriptions in `src/components.json`, nothing in the code:
  - fields: TextEdit, TextArea, Checkbox, Radio, Switch, Select, Combobox, Slider, ColorInput, Rating; `Input` has a field name too;
  - boxes: Form, Panel, HSplitBox, VSplitBox;
  - what is shown: SimpleText, Icon, Tag, Link, Image, Progress, Gauge, Calendar (no property: its dates are `Date` objects, which a description cannot give).
  - The choices of a Select and of a Combobox are items, as those of a Listbox (`selectitem`, `comboitem`). They have no `parts`: they are not on the page (the list is closed, or in a popup), so they are selected in the tree only.
  - A prop x4 cannot do without (the `min` and `max` of a Progress, of a Slider, of a Gauge; the `src` of an Image) is in `fixed`, and is the `default` of its property: it is always given, with what the user chose when he did.
  - The prop that receives the children, when the description names it (`"content": "items"`), is written even when it holds nothing (`items: []`): `new Select( {} )` does not compile, and fails when it runs. The split boxes name theirs (`"content": "content"`) for the same reason. A plain box still says nothing.
  - Checked: one of each, as the palette makes them, and the three pages of the demo, generated and compiled against the sources of x4 (a trial in `c:/temp/x4studio-gen`: `node gen.ts`, then `tsc -p .`). No error.
  - The demo has a page for them, "Components".
  - Left out, and why:
    - Tabs, StackBox: done since (see "An item may hold a component").
    - GridBox: its children have a row and a column.
    - Flex, Space: not built from props (`new Flex( )`, `new Space( 8 )`); a description would have to say how the arguments of a constructor are made.
    - Gridview, Treeview, Spreadsheet, Chart, PropertyGrid: built from a store or from data the code gives.
    - Header: only used as the `header` of a Listbox, a prop that is a component.
    - AutoComplete, Breadcrumbs, FileDrop, Video, Canvas, ScrollView, MasonryBox, ColorPicker, Keyboard: not looked at closely.
  - Not offered, though the components have them: the `lazy` of an Image (it is given to the `loading` attribute as a boolean; not checked what the browser makes of it), the `colors` of a Gauge (a list of colors), the `value` of a Checkbox and of a Switch.
- A chat with Claude, to design (Etienne: "a tool (bottom) with a chat plugged on you, for the design"). Decided with him: the API of Anthropic, called from the page with `fetch` (no dependency); the model acts on the page with tools; the page that is shown, and it may make pages; the conversation is kept in `.x4studio/chat.json`.
  - `core/claude.ts`: one request, the answer read as it is streamed (server-sent events). The format is the one of the documentation of the API, read on 2026-10-12; that the API answers a browser was checked without a key (the header `anthropic-dangerous-direct-browser-access`).
  - `core/assistant.ts`: what the model is told (made from the descriptions of the components and of the CSS properties: no component is named there either), the state of the studio sent with each message (the tree of the page with its ids, the selection, the classes, the icons, the pages), the tools (`get_page`, `add`, `set`, `move`, `remove`, `set_class`, `open_page`, `add_page`), and the conversation. What a tool is given is checked against the descriptions; what is refused says why, and the model tries again.
  - `view/chatpanel.ts`: the tool "Chat", under the page (it may go on a side). Enter sends, Shift+Enter is a new line; "Stop" while an answer is written; each thing done to the page is a line.
  - One answer is one step for undo, whatever it did to the page. Not the classes: their edits have no undo, as by hand.
  - The key is typed once and kept in the `localStorage` of the browser (`x4studio.claude.key`), with the model that was chosen. It is not in the project, nor in its zip. The conversation is: a zip that is given to someone holds what was said.
  - Models offered: `claude-opus-5-5` (first), `claude-sonnet-5-5`.
  - Not tried against the real API: there was no key here. The tests replace `fetch` by streams made as the documentation shows them.
  - What the model thought (its "thinking" blocks) is given back while it makes one answer, with its tools, and taken out of the conversation once the answer is over. Seen by Etienne on his first try: the second message was refused, "Invalid signature in thinking block. The block is bound to a different conversation". A block is signed for everything that was sent before it, and the studio changes that: the state goes with the last message only, and old messages are dropped. The documentation allows leaving them out after the answer.
  - The lines of the chat can be selected (Etienne: "I must be able to select the text in the chat"): x4 turns the selection off on every element, it is turned on again on each line.
  - Left: the model cannot add icons, remove a class, rename or remove a page; nothing is pasted to it (a screenshot, a mockup); what the answer costs is not shown.
- The project is kept in the browser (Etienne: "when I save, the zip is downloaded; it should be saved locally, at each reload it loses my changes"; then "a kind of cache", "cache = 1, cleaned at each upload, maybe a message at startup").
  - `core/cache.ts`: one project, in IndexedDB (the zip is bytes; `localStorage` keeps 5 MiB of text for a site, MDN). No id in the project: with one place in the cache, there is nothing to tell apart.
  - Save (the button, Ctrl+S) writes the project and gives its zip to the browser to keep: nothing is downloaded, a notification says it is saved (Etienne: "save must show a notification"). "Export" saves, then downloads the zip.
  - Leaving the page (closed, loaded again) with changes that are not saved: the browser asks first (`beforeunload`; Etienne: "prevent the closing, with a question, if modified"). MDN, read on 2026-10-12: the browser only asks when the user did something in the page, and with its own words.
  - The notifications of x4 are white whatever the theme: in the studio they have its colors (`theme.scss`), or their text could not be read (Etienne).
  - The studio starts on the project that was kept, and says so in a notification, with the date; on the demo when there is none.
  - A zip that is opened takes the place of what was kept, at once. A new project does not, until it is saved: loaded again before that, the studio is back on the one before.
  - It is a cache: the browser may empty it (when the disk is short; Safari after seven days without a visit, MDN). The exported zip is what is to be kept. Not asked of the browser: `navigator.storage.persist( )`, which makes it keep the data until the user removes it.
  - Not seen in a browser: nothing of it runs under node, so no test.
- The theme of the project (Etienne: "add a theme tool to the project; each line offers a color and the name of the element"; "a 'from image' button to take the colors of logos and screenshots"). Decided with him: a tab of the project tool ("we do not go there often"), the variables of meaning and the primary scale, a base color for the scale, the stylesheet imported once by the application.
  - The colors a theme may set are described, as the components are: the `theme` of `src/components.json` (42 lines: the 13 shades of the primary scale, backgrounds, texts, accent, borders, disabled, alert/warning/success). The variables x4 gives to each component are not there.
  - `core/theme.ts`: the theme (`.x4studio/theme.json`: `base`, and `values` by the name of the variable), the stylesheet that is generated (`src/theme.ui.css`, `:root { ... }`), the scale made from a base color, the colors of a picture. Only colors written as `#rgb`, `#rrggbb`, `#rrggbbaa` are kept: what is read goes in a stylesheet.
  - The pages do not import `theme.ui.css`: the application does, once (`import "./theme.ui.css";` in its `main.ts`, written by its author). The file is written at the first save after the theme changed.
  - `view/themepanel.ts`: the "Theme" tab. A line: the name, the color (the field of the inspector, with its picker); right click: Reset. A line that sets nothing shows, dimmed, the color that applies in the pages: the one of x4, or the one that follows from the other lines. The tooltip of a line is its variable.
  - The scale: a "Base color" line above the shades. Chosen, it computes the 13 shades as x4 does (the lightness of the base moved by the `shade` of each line; checked against what the stylesheet of x4 gives for its own base, within the rounding). Right click on a shade or on the base: "Make the scale from the base color", "Reset the scale".
  - "From image...": the picture is drawn small on a canvas and its colors are counted (`dominantColors`, by hand): the 8 that cover most of it and are not alike. A click on one, then on the name of a line, gives it to that line, once: for another line the color is clicked again (Etienne: "a good idea, but how do we stop?"; he is not sure of the function). "Close" puts the colors away.
  - The picker of a line offers the colors of the picture, then the shades of the primary scale as the pages have them (Etienne: "add the primary colors in the swatches of the picker of the theme").
  - Asked then given up by Etienne the same day ("cancel, it is of no use, it was a mistake"): an option that inverts the scale, from the darkest to the lightest. Taken out.
  - In the studio the theme is declared on the pages only, over the theme of x4 and under the classes of the project.
  - Control by control (Etienne, 2026-10-12: "you put the general theme; I would like to patch control by control"; "all the variables", and not "select a component to open its group"): every other variable x4 declares on the root, read from its stylesheets (`rootVariables`, `view/pagetheme.ts`). Nothing is described by hand, a control added to x4 is there. A group for each first word of the names ("--button-background-hover" is of "button"); a word that has more than 40 is split by its second one (the palettes: "color-gray"...).
  - Where it is: the theme is a tool of its own in the dock, "Theme", with two tabs, "Main theme" and "Controls" (his idea, 2026-10-12). At first it is a tab behind "Project". The project tool has its three tabs again.
  - How it got there, for the next time: he had written "a 'controls' tab in the project instead of stuffing it under theme (or propose better)". I built something else without asking (two buttons that switched lists inside the Theme tab), because a fifth tab did not fit the band. He said so: he had asked for proposals before any change, and had spoken of a tab. "Or propose better" means: propose, and wait.
  - A variable whose value is a color has the picker; any other one is typed (a radius, a width), with what applies as a hint. A theme keeps any CSS value that fits on a line and cannot end the rule it is written in (`isValue`), not only colors.
  - A field at the top keeps the lines whose name holds what is typed, and opens the groups that have some.
  - Every group is folded at first (Etienne: "by default show the sections closed"); the lines of a group are made when it is opened: there are hundreds. The same in the inspector, where only "Attributes" is open at first (what is kept from a session to the next is what is open).
  - The titles of the groups are a little lighter than the panel, here and in the inspector (Etienne), and in the middle of their height: the head of a group is a fieldset, and what a fieldset holds does not take the height a `min-height` gives it; the height now comes from the title.
  - Left: no undo; the swatches of the application (colors that are named, for every picker of the inspector) are not done; the assistant is not told of the theme; a picture cannot be pasted.
- The studio is looked at in a browser without a window (Etienne, 2026-10-12: "install playwright", after I could not find by reading why the pickers did not close). `playwright` is a dev dependency of the studio; its Chromium is in `node_modules` (`PLAYWRIGHT_BROWSERS_PATH=0`), nothing is installed elsewhere. In `test/browser`: `serve.mjs` serves the build, `look.mjs` takes pictures at several steps (`test/browser/shots`, not in git), `picker.mjs` opens color pickers and presses outside. Run after a build: `PLAYWRIGHT_BROWSERS_PATH=0 node test/browser/look.mjs`. They are not run by `npm test`.
  - The pickers that did not close (Etienne: "the color picker never closes anymore"): in the Theme tab, a click on the swatch of a line opened two pickers, one on the other. The first closed, the second never did, nor any picker opened after it, until the page was loaded again. Cause: the tab listened to clicks on the whole row of a line, and x4 calls the handlers of a click from what is clicked up to the top once for each element on the way that listens (`dispatchEvent`, `core_dom.ts`): the handler of the swatch ran twice. The listener is now on the name of the line only. Seen in the browser: two popups before, one after, and it closes.
  - Seen on screen the same way, and corrected: the four tabs of the project tool were wider than its band (the tool scrolled sideways); the code of a color, in the inspector, was the pale field of x4 and pushed the eye dropper out of the panel; a Form and a Calendar need a height (their content shares the one they are given: without one they are a few pixels high, the weeks of the calendar one on the other), so the demo gives one and a new Calendar has 240; a Rating showed nothing (see below), its description now gives `steps`.
  - Changed in x4 with Etienne's yes (2026-10-12, in its changelog): `Progress` (min and max default to 0 and 100, the bar starts at min), `Gauge` (same defaults), `Switch` (prop `name`). `aicontext.md` brought up to date for them and for what it said wrong of Slider, Select, Combobox, Radio, TextArea, Notification, Flex.
  - Also changed in x4 with his yes: `Combobox` has a `renderer` (given to its list, which took one already); a `Notification` follows the theme, with three new variables for its colors (he asked for variables). Tried on a page of x4 alone, in `c:/temp/x4combo`.
  - Decided by him: the double call of the handlers is left as it is ("ignore"); `default` stays mandatory for a Tabs.
  - Shown to him with a diff, not answered yet: the popups that stay open (not a regression of the week before: the groups are as they were in the first commit of the file, 2024-10-01; seen on a page of x4 alone: two popups opened by one click, the second never closes, nor any after it), and `Rating` without `steps` (seen: no star at all).
  - Found in x4, not changed, to decide with him: `dispatchEvent` calls the handlers once for each element on the way that listens to the event; a popup that closes by itself and is opened while another one of another group is open is never closed, nor those after it (`popup.ts`); `Rating` shows nothing without `steps` (the default is written in the props it is given, and a box keeps a copy of them); the text of a notification and of the tabs takes its color from `--color-gray-7`, which does not exist; the background of a notification is white whatever the theme; `Combobox` does not give `renderer` to its list, which takes one.
- An item may hold a component (Etienne, 2026-10-12: "could we not make a ghost item?"; then "ok for everything but DockingView"): the page of a Tabs is a node that is no component itself, carries the properties of the page (name, title, icon) and holds what the page shows. It is the item the studio already had (the buttons of a BtnGroup, the items of a Listbox), allowed to hold something.
  - In a description: an item given as an object may say `"container": true`, with `"content"` (the field that gets what it holds) and `"single": true` (one node at most: the field gets the component itself, not a list). `"reveal": { "method", "by" }` on its owner says how the page that is selected is shown (the page is not alive: a click on a title does nothing): `selectTab( name )` for Tabs, `select( name )` for StackBox. `"holds": [{ "type" }]` is what a new one holds at first.
  - Described this way: Tabs (with `tabitem`) and StackBox (with `stackitem`). A new Tabs has one page, and the page a box (Etienne: "for the tabs, I do not understand how something is added inside").
  - How it is used: the title of a page is clicked on the surface (or its row in the tree): the page is selected, and shown. A component clicked in the palette then goes into the box of the page. Another page: the Tabs is selected, and its item is offered under the palette, and in the menu of the surface ("Add: Tab").
  - A page holds one component: a second one is refused (by hand, by paste, by the assistant, which is told why).
  - `default` is always given to a Tabs and to a StackBox: x4 wants the prop, and it stays so (Etienne, 2026-10-12: "mandatory, that way no surprise"). A new one names its first page ("tab", "page": the name a new page has); emptied by the user, it is `""`: the first page is shown, its title not drawn as the selected one.
  - Seen in the browser (`test/browser/tabs.mjs`, `chat.mjs`), and the code that is generated compiles against x4.
  - Not done: DockingView. Its panels are such items too, but it also wants a `layout`, which is a tree that names the panels: a description cannot give it. To decide with Etienne (he asked to be explained slowly): x4 makes the layout itself when it is given none, from a `side` each panel would say.
- Pictures go with a message to the assistant (Etienne: "how do I paste a picture in the chat?"): pasted in the field (Ctrl+V), dropped on the panel, or chosen with "Image...". They wait above the field (a click takes one away) and leave with what is typed; a picture alone is a message too.
  - Each is drawn again as a PNG, 1600 pixels at most on its longer side (my choice; the API takes JPEG, PNG, GIF and WebP, 10 MB and 8000 pixels a side: its documentation, read on 2026-10-12). An svg becomes a bitmap that way.
  - The model keeps them for the conversation, while the studio is open. They are not written in `chat.json`: "[image]" stands where each was.
  - Seen in the browser with answers of the API made by the test (`test/browser/chat.mjs`): the picture is in the request, the action of the model is done on the page. Not tried against the real API.
- The page has a row in the tree of the objects, the first one (Etienne: "the root of the page is not seen, to change its background for example"). A click on it selects nothing, which is how the inspector shows the page; the row is the selected one while nothing is selected. A prop of the shared `TreePanel`, `page` (see `projets/shared/changelog.md`, 2026-10-12 11:10). The page has an icon in its description for it.
- The pages are shown with the theme of x4, not the one of the studio (Etienne: "the background of the page is blue, and what is designed is not told from the editor"; "for the editing zone, put the x4 theme back"). `view/pagetheme.ts` reads every variable x4 declares on `:root` from the stylesheets of the document and declares them again on what holds the page; the studio declares its own theme on `:root:root`, so that it is not taken with them. Limits: read from the browser, so not when it refuses to give the rules of a stylesheet (believed to be the case for a page opened from the disk, `file://`; not checked): the pages then keep the theme of the studio. Menus and dialogs are not in the page: they have the theme of the studio.
- The studio imports x4 as `@x4` (`paths` of its tsconfig), not by a relative path. `shared` and the designer still do.
- The title of a tab under the pointer was black, the color x4 gives it for a light background: the titles of tabs have their colors in the theme of the studio.
- The "Code" panel may be docked under the page (`sides`), to try the bands of `DockingView`.

## To settle

- The project file: what it holds (the pages, where they are generated, the import of x4, the styles, the theme), and whether the document of a page lives in its generated file only.
- The project tool: what it shows (the pages, to open them, to add one; the styles?) and what it does.
- A zip mode (Etienne asked what I think of it, 2026-10-09): the project opened from a zip file and given back as one. My answer: good for the web mode, where it works in every browser and without any permission; not for the daily work, where the generated files have to be on the disk beside the code the user writes, for `x4js dev` and for git. The same studio over one small interface to the files of a project (list, read, write, remove), with a folder behind it (Wails), or a zip kept in memory (web).
- Reading and writing a zip: a dependency, or by hand. Read on MDN (2026-10-09): `CompressionStream` and `DecompressionStream` take the format `"deflate-raw"`, which is what a zip entry holds, and are "Baseline, widely available" since May 2023. Nothing in x4 nor in its dependencies (esbuild, esbuild-sass-plugin) reads a zip. By hand, it is the container only (the headers, the directory, a CRC-32) around what the browser does.
- The folder opened by the browser itself (File System Access), if it is done one day. Read on MDN (2026-10-09), for the browser: `showDirectoryPicker` and `FileSystemHandle.requestPermission` are experimental, of limited availability (not in every browser; the table was not read), need a secure context and a gesture of the user. Not checked: whether a page opened from the disk (`file://`) counts as secure, and whether the folder can be remembered from a session to the next.
- The page is shown with the theme of the studio: its components are x4 components, styled by the same variables. It needs its own (see the theme editor).

## Style editor

Asked (Etienne, 2026-10-09): a style editor, a little as in Figma. Styles (classes) can be created and used, and also patched.

Next thing to prepare (Etienne, 2026-10-09: "you will prepare the CSS style editor"). Read for it: x4 has `Stylesheet.setRule( name, css )` (`src/core/core_styles.ts`), which writes a rule in a stylesheet of the page and replaces it when it is set again: a class can be kept up to date on the surface while it is edited.

What Etienne has in mind (2026-10-09, with a picture of the inspector of another tool; "I did not see the style editor like that", of the first version below):

- One inspector, for what is selected on the page: its attributes first (and a "custom attr / value" row with a "+", for what has no field), then "Classes" with a "+" to add one, "States", "Visibility", then the CSS attributes in sections that fold: "Text Style" (font family, weight, size, line height, letter spacing, transform, decoration, align, white space, word break, color, shadow), "Size" (width, height, min, max, overflow, ratio), and so on.
- A value that is not set shows what applies, dimmed ("auto", "normal", "16px"); a color may name one of the theme ("neutral-dark (theme)").
- Choices of two or three values are small buttons side by side (transform, decoration, align); "Size" has two values on a row.
- It is not a tool apart where a style is edited away from the components.

Settled by Etienne the same day:

- A class that is given to a component updates the values that are shown. Every change made in the inspector is local to the object. To change a class, its style is edited.
- A component may have several classes: tags, and a field that completes what is typed.
- A panel of the studio: the `PropertyGrid` of x4 is not strong enough for this.

Done on 2026-10-09, not seen on screen by Etienne yet (a first version, a tool "Styles" apart, was written before he showed the picture, and was removed):

- `view/inspector.ts` takes the place of the properties panel. Sections that fold: "Attributes" (the properties of the component, and its size), "Classes" (x4 `Tag`s and an x4 `AutoComplete`: a style of the project is picked, or a name that no style has makes a new one, with Enter), a section for each group of CSS properties ("Layout", "Text Style", "Size", "Background", "Border": they are data, the `look` of `components.json`), and "Custom" (rows of a name and a value, for what has no field: the variables of the components).
- `view/fields.ts`: the fields. Up to four choices are small buttons side by side, more are a list; two fields may share a row (`half`); a number or a text that holds nothing shows, dimmed, what applies (the value the browser computed for the component on the page).
- What is typed is local: it goes to the node (`props.css`, by the names of the look; `props.vars`, for "Custom"), and is generated as the `style` of the component; the declarations of "Custom" are generated as `attrs: { style: "--x: v" }`, and for the page as `this.setStyleVariable( ... )`.
- A click on a tag: edit the style of the class, or take the class away. Editing shows the class instead of the selection, with the same CSS sections, until "Back"; the class is renamed and deleted there.
- The boxes and the page have no gap, padding nor align of their own anymore in their descriptions: they are CSS properties as the others, in "Layout".

Left:

- Nothing undoes a change of a class (the changes of a component are steps of its page, as the others).
- "States" (hover, focus) and "Visibility".
- A color of the theme, picked by its name.
- What applies is not shown for a color nor for the buttons.
- A style is for any component: no style made for one type, with its variables as fields.
- A row of "Custom" counts when its field is left, not as it is typed.
- The same CSS property set in a section and in "Custom" : nothing says which one wins (the browser does: the last one of the inline style).

Said by Etienne on the proposal below (2026-10-09):

- The CSS attributes the studio knows are shown in something like a `PropertyGrid`.
- Patching variables is done in a CSS editor in text mode, or as keys and values.

Found since, without changing x4: a text of declarations can be given to one component as `attrs: { style: "--button-background: #c00" }`; `attrs` is applied before `style` (`src/core/component.ts`), which then adds to the same inline style. Not checked on screen.

A proposal was prepared on 2026-10-09 (by an agent, from the sources, nothing built nor seen on screen) and given to Etienne; apart from the two points above, nothing of it is agreed yet. What it found, to keep:

- A class that sets plain CSS colours loses to the rules of x4: `.x4button:hover { background-color: var( --button-background-hover ) }` is more specific than one class. x4 itself overrides by declaring the variables of the component again on a class (`.x4item { --label-color: ... }` in the listbox). A style for a `Button`, a `Label` or an `Input` should then set their variables (`--button-background`), not CSS properties; `VBox` and `HBox` have no variables, plain properties suit them. It is also how a style meets the theme.
- A variable cannot be patched on one component through the `style` prop: `setStyle` assigns `style[name]`, only `setStyleVariable` uses `setProperty`, and `StyleProps` only has the names of `CSSStyleDeclaration`. Either x4 changes (to ask), or a class is generated for a patched node, or the variables are not patched at first.
- `Stylesheet.setRule` is not fit for this: no way to remove a rule, the order is the one of the first insertion, a rule that the browser refuses is lost with the indexes after it, and nothing uses the class today. Proposed instead: one `<style>` component of the studio, whose text is replaced whole by the pure function that also writes the file of the project.
- Proposed model: `.x4studio/styles.json` (`{ id, name, for?, values, css? }`), a node refers to its styles in `props.styles` (an array, one style in the first UI), a patch is the node's own value in `props`; generated as plain CSS under `src`, imported by each page, `cls` on the components.
- It would need four changes in `shared`: `getProp` asks the type for an inherited value before the default; `setProps` deletes a key given as undefined; the properties panel marks a value that comes from a style and one that is patched, with a reset; `History` takes anything that has `snapshot` and `restore`, for the styles to have their own undo.
- Scoping a theme to the page is harder than it looks: x4 declares its derived variables on `:root`, where (not verified) they are resolved; declaring the theme again on the page alone would not recolour a button.
- Not verified by the agent: anything the browser does (`:where`, `inert` and hover, the order esbuild gives to the CSS).

What it seems to mean for the rest (written before the proposal):

- The value of a property would be looked for in three places: the node itself (the patch), its style, then the default of its type. Today `getProp` knows the first and the last.
- It is what x4 does with `cls` and `style`: the style would be generated as a class of a stylesheet, the patch as the `style` of the component.
- The styles belong to more than one page: they would live in the project, not in a document. A `Document` only holds its nodes, and undo works on it alone.
- The surface has to show the classes: the stylesheet of the project, kept up to date while a style is edited.

Already so in the skeleton: what is about the look of a box (gap, padding, alignment) is generated in its `style`.

To settle:

- What a style holds: any CSS, or a list of properties the studio knows (colors, font, padding, gap, border, radius).
- Whether a style is made for one type of component or for any.
- One style per component, or several.
- What "patch" means: a value of a style changed for one component only (proposed above), or also changing the style itself from a component that uses it.

## Theme editor

Asked (Etienne, 2026-10-09): a theme editor.

Done on 2026-10-12 (see "Added on 2026-10-12"). What was thought before, kept for what is left of it (the swatches of the application):

Not designed then. A theme of x4 is a set of CSS variables: the primary scale, the variables of meaning (backgrounds, texts, accent, borders), then those of a few components (see `src/theme.scss`, which follows the documentation of x4). What it seems to mean:

- The theme belongs to the project, as the styles do, and is generated as a stylesheet.
- The page that is edited has to be shown with the theme of the project, not with the one of the studio: its variables set on the page only.
- How it meets the styles: a style would take its colors from the theme.
- Swatches of the application (Etienne, 2026-10-09: "it would be great to define app swatches for the colors; it is part of the theme editor"): colors that are named once, in the theme, and offered wherever a color is picked. The pickers of x4 take `swatches` (`ColorInput`, `ColorPicker`).

## Icons

Asked (Etienne, 2026-10-09): something for the icons. It is a tool (a panel of the dock), and svg files can be dragged and dropped onto it: they become icons of the project.

Done on 2026-10-12 (see "Added on 2026-10-12"): the tab of the project, the property, the picker, the module. What was thought before, kept for the reasons:

- The icons belong to the project, as the styles and the theme do: a set the user fills (svg files), and picks from in the properties. A kind of property of its own (`"icon"`), with a picker, which `shared` does not have.
- In an x4 application an icon is an svg file that is imported (`import ok from "./icons/ok.svg"`) and given as `icon: ok`. The generated code would do the same: an import for each icon a page uses. A prop is then not only plain data: `describe` (core/components.ts) has to be able to say "this imported name" where it says a value today.
- The surface has to show them: the svg itself, read from the project.

To settle:

- Whether the studio also offers a library of icons, beside those the user drops.
- What a dropped file becomes: copied into a folder of the project, under which name, and what happens when the name is taken.
- Renaming and removing an icon, and what the components that use it then show.

## Try mode

Done on 2026-10-12 (Etienne: "todo: try mode", then "go"). The page is alive, as in the application: its tabs change, its lists drop down, its fields are typed in.

- "Try", beside "Export" in the project tool (where he asked for it); again, or Esc (from a field of the page too), goes back to editing. The button is down, a line is around the surface and the help says so while the page is tried.
- `BoxSurface.setTrying`: the page is not inert anymore, the layer above it is not shown (nor the lines of the boxes), the keys of the surface edit nothing. Back to editing, the page is built again: what was typed, ticked or opened was not the page.
- A link of the page does not take the studio elsewhere, a form does not send it: both are stopped before the page sees them.
- A page that is not shown anymore is not tried anymore.
- Seen in the browser (`test/browser/try.mjs`).
- Limits, said to him before: nothing is behind the buttons (the code of the application is not there); what opens outside of the page (the list of a Combobox, a menu, a color picker) has the theme of the studio, not the one of the project.

## Settings of the project

Asked (Etienne, 2026-10-12): "plan settings in the project". Nothing is designed. `.x4studio/project.json` already says a few things nobody can change from the studio: the name, where x4 is imported from, the folders of the pages and of the icons, the files of the stylesheet and of the theme.

One of them, asked the same day: "be able to put the local CSS of each one inline (settings)". Today what a component sets for itself (the `css` of its node) is always written inline, as its `style`, on the surface and in the generated code. What I understand, to be confirmed with him: a setting that chooses between that and a rule of its own in the stylesheet of the project.

## Desktop version

Asked (Etienne, 2026-10-12): "see how we are going to make the desktop version". Said before (2026-10-09): Wails later, and to keep in mind in the design; a hosted mode too. What is ready for it: a project is behind one small interface (`ProjectStore`: list, read, write, remove, commit), which a folder on the disk can be as the zip in memory is today. What is not: the key of the API and the cache of the project are the browser's (`localStorage`, IndexedDB).

## Reading existing x4 code

Asked (Etienne, 2026-10-12): "todo: read existing x4 code again, to make the UI from it". Nothing is designed. What I understand: a page that was written by hand (a class that builds its components with `new VBox( { content: [...] } )`) is opened in the studio as a page of the studio, which generates it again.

What it would take, as I see it now:

- Reading TypeScript: the constructor of a class, the tree of `new X( { ... } )` in its `setContent`. A parser is needed (the one of TypeScript, which the studio does not have in the browser: a dependency, to discuss), or the assistant reads the code and makes the page with its tools, which it can do today from a text that is pasted.
- Only what is plain data can be taken: a prop whose value is a text, a number, a list. A prop that is computed (`label: _tr.save`), a handler (`click: ( ) => ...`), a loop, a condition are code: they cannot become properties. What to do with them (leave them out, keep them as text) is to decide.
- The other way round is already not done: the generated class is derived, never edited, so the code of the user and the page never meet.

Asked the same day: "can we do React too?". x4 has a JSX factory (`x4_react.create_element`, `core_react.ts`): `<X a={1}>{kids}</X>` is `new X( { a: 1, content: kids } )`, and `ref={[owner, "name"]}` fills `refs`. A page could be generated as TSX; to decide with him (what "React" meant: this, or pages for React itself).

## Previews in several formats

Asked (Etienne, 2026-10-09): previews of a page in different formats, for the adaptive mode. To be looked at: nothing is decided, not even that it will be done this way.

Not designed yet. What it touches:

- Today the page has one size while it is edited: the box of the root node (`w`, `h`), which the skeleton chose without a decision. Several formats (a phone, a tablet, a desktop) would be a list of sizes, of the project or of the studio, not one size kept in the document.
- A preview is the same document built once more at another size: `describe` gives the same components, only the size of the page changes. It could be alive (not inert), which the surface is not.
- "Adaptive" may mean more than a page that stretches: properties that change with the format (an `HBox` that becomes a `VBox` on a phone, a component hidden under a width). That would be values that depend on the format, as a style or a patch is a value that depends on something: to think about with the style editor.

## Generated documentation and previews

Asked (Etienne, 2026-10-09): generate the documentation, and previews.

Not designed yet. To settle:

- What the documentation is about: the pages of a project (their components, the names in `refs`, what a derived class can reach), the styles and the theme, or all of it.
- What a preview is here: a picture of each page, for the documentation and for the project tool, and how it is made (the page built in the studio and captured, or a file the user opens).
- Its format, and where it is written in the project.

## Needed in `projets/shared`

Every change of `shared` goes into `projets/shared/changelog.md`, with the date and the time: the other projects built on it are brought up to date from there.

Done on 2026-10-09 (see the changelog): `Document.move` into any container, the order "flow" of the tree, a number that may have no value.

Left:

- `pasteNodes` always pastes into the page, and the format is called `x4designer/nodes`. The studio pastes into the page, then moves what was pasted where it goes: it works, in one step for undo, but it is a way round.

## Needed in x4

To propose to Etienne with the cause, the before and the after.

- Done on 2026-10-12, agreed by Etienne (changelog of x4, 2.3.17): `Input` of type "number", built with a `step` under 1 or over 1 and no `value`, threw (`setNumValue` formatted what it was given). It now empties the field when it is given no number. The studio does not give its number fields an empty value anymore. Two things of the same family were told to him and left as they are: a text given to `setNumValue` (by `Form.setValues`) fails the same way, and a step that is not a power of ten gives too few decimals (0.25 is shown "0.3").
- `DockingView` takes its panels when it is built: its public methods are `getState`, `setState`, `resetLayout`, `showPanel` and `isPanelVisible` (read in `dockingview.ts`). Opening and closing pages needs a way to add and to remove a content panel.
