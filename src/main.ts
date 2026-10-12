/**
 * @file main.ts
 * @description the studio: an editor of pages made of x4 components
 *
 * The web page: a project is a zip, which is opened and given back (see
 * core/store.ts). Saved, it is kept by the browser (see core/cache.ts):
 * the studio starts on the project that was saved last, or on a new one,
 * with pages to try things.
 *
 * The library is used from the local sources.
 */

import { Application, Button, Component, DockingView, FileDialog, HBox, InputBox, Label, Menu, MenuElement, MessageBox, Notification, VBox, initTooltips, shortcutText } from "x4js";
import type { DockLayout } from "x4js";

import { Document } from "./core/document.ts";
import { CreateTools } from "./view/tools.ts";
import { TreePanel } from "./view/tree.ts";
import { isMac } from "./view/keys.ts";

import { Assistant } from "./core/assistant.ts";
import { cacheProject, cachedProject } from "./core/cache.ts";
import { readComponents, registerComponents } from "./core/components.ts";
import type { ComponentDef } from "./core/components.ts";
import { PROJECT_FILE, Project, iconNameOf, isIconName, isIconSource, isPageName } from "./core/project.ts";
import type { IconInfo, PageInfo } from "./core/project.ts";
import { ZipStore } from "./core/store.ts";
import { BoxSurface } from "./view/surface.ts";
import { ChatPanel } from "./view/chatpanel.ts";
import { CurrentSurface } from "./view/current.ts";
import { ProjectPanel } from "./view/projectpanel.ts";
import { ThemePanel } from "./view/themepanel.ts";
import { ItemTools } from "./view/itemtools.ts";
import { Inspector } from "./view/inspector.ts";
import { pageTheme, rootVariables } from "./view/pagetheme.ts";
import { setIcons } from "./core/icons.ts";
import { STYLES_PROP, cssOf, getLook, getStyles, isStyleName, nextStyleId, readLook, readStyles, setLook, setStyles, styleIds } from "./core/styles.ts";
import type { StyleDef } from "./core/styles.ts";
import { readThemeColors, setThemeColors, themeCss } from "./core/theme.ts";
import type { Theme } from "./core/theme.ts";

import icons from "./icons.ts";

// the components the studio comes with: descriptions, not code
import library from "./components.json";

// the project it starts with: pages and styles, to try everything on
import demo from "./demo.json";

// the font x4 asks for (--font-name): regular and semi-bold, latin characters
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-600.css";

import "./theme.scss";
import "./main.scss";

/** the page a new project has */
const FIRST_PAGE = "Main";

/** where the styles of the project apply, in the studio: inside the pages (a CSS selector, see view/surface.scss) */
const PAGE_SCOPE = ".boxsurface .host";

/**
 * Where the theme applies, in the studio: inside the pages, and on an
 * element that is never seen, which the colors that apply are read from
 * (for the tool of the theme: a page may not be open).
 */
const THEME_PROBE = "theme-probe";
const THEME_SCOPE = `${PAGE_SCOPE}, .${THEME_PROBE}`;

/**
 * What the studio starts with: a project that has a little of everything,
 * so that there is something to try each time the studio is loaded again.
 * It is data (src/demo.json), as a project is: its styles as styles.json
 * keeps them, its pages as their documents. The studio names no component,
 * it only knows those that are described to it.
 */

async function fillDemo( project: Project ): Promise<void> {
	const styles = readStyles( JSON.stringify( demo.styles ) );

	// the code of a page names the classes of its components
	setStyles( styles );
	await project.saveStyles( styles, getLook( ) );

	// its icons: the files, and the module that gives them to the code
	for( const icon of demo.icons ) {
		await project.addIcon( icon.name, icon.svg );
	}

	setIcons( await project.icons( ) );

	for( const page of demo.pages ) {
		const doc = new Document( 1, 1 );
		doc.restore( JSON.stringify( page.root ) );

		await project.savePage( project.pageInfo( page.name ), doc );
	}
}

/**
 * What a project does with its zip when it is saved: the browser keeps
 * it, and gives it back when the studio starts again.
 */

async function keep( name: string, bytes: Uint8Array ): Promise<void> {
	try {
		await cacheProject( name, bytes );
	}
	catch( error ) {
		throw new Error( `The browser did not keep the project (${error instanceof Error ? error.message : error}). Export it: it is the only way to keep it.` );
	}
}

/** a few words at the bottom of the window, which go away by themselves */
function notify( text: string ): void {
	new Notification( { title: "x4studio", text, closable: true } ).display( 4 );
}

/**
 * Give a zip to the user: the browser downloads it.
 * (x4 has nothing for this: the link is made directly)
 */

function download( name: string, bytes: Uint8Array ): void {
	const url = URL.createObjectURL( new Blob( [bytes as BlobPart], { type: "application/zip" } ) );

	const link = document.createElement( "a" );
	link.href = url;
	link.download = `${name}.zip`;
	link.click( );

	URL.revokeObjectURL( url );
}

/**
 * A little help in the status bar: what can be done now, with the mouse
 * and the keyboard.
 */

const HELP_NO_PAGE = `No page is open: add one to the project, or open a project.`;

const HELP_NOTHING = `Click a component to select it. A click in the palette adds a component at the end of the page.`;

const HELP_TRY = `The page is tried: it is alive, as in the application, and nothing is behind its buttons. Esc, or "Try" again: back to editing it.`;

const HELP_SELECTION = `A click in the palette adds a component into the selected box, or after the selected component; when what is selected has items of its own, they are offered under the palette.   Arrows: move in the box.   Esc: the box around.   Del: delete.`;

/**
 * The panels as they are at first: the project on the left (the theme is
 * a tab behind it), with the
 * palette and the tree of the objects under it; the properties on the
 * right, with the generated code under them; the page between them, with
 * the room that is left, and the chat with the assistant under it.
 */

const LAYOUT: DockLayout = {
	left: {
		size: 220,
		root: {
			type: "split", dir: "column", size: 0,
			children: [
				{ type: "stack", size: 0, panels: ["project", "theme"], active: "project" },
				{ type: "stack", size: 0, panels: ["tools"], active: "tools" },
				{ type: "stack", size: 0, panels: ["tree"], active: "tree" },
			],
		},
	},
	right: {
		size: 340,
		root: {
			type: "split", dir: "column", size: 0,
			children: [
				{ type: "stack", size: 0, panels: ["properties", "code"], active: "properties" },
			],
		},
	},
	bottom: {
		size: 240,
		root: { type: "stack", size: 0, panels: ["chat"], active: "chat" },
	},
	content: { type: "stack", size: 0, panels: ["pages"], active: "pages" },
	floats: [],
	hidden: [],
};

/** a page that is open: it has a surface, which keeps its steps for undo */
interface OpenPage {
	info: PageInfo;
	surface: BoxSurface;
	saved: string;			// its document when it was saved last
}

class MainView extends VBox {
	declare protected refs: {
		project: ProjectPanel,
		theme: ThemePanel,
		tools: CreateTools,
		items: ItemTools,
		pages: Component,
		inspector: Inspector,
		sheet: Component,
		probe: Component,
		code: Component,
		status: Label,
		picker: FileDialog,
	};

	// what the panels talk to: the surface of the page that is shown
	private current = new CurrentSurface( );
	private dock: DockingView;

	// Claude, which designs with the user: it acts on the page that is shown
	private assistant: Assistant;

	private base: ComponentDef[];					// the components the studio comes with
	private project: Project = null;
	private zip: ZipStore = null;					// what holds its files
	private pages: PageInfo[] = [];
	private open = new Map<string, OpenPage>( );	// by the path of their file
	private active: OpenPage = null;
	private icons: IconInfo[] = [];					// the icons of the project
	private toldOwnModule = false;					// the user was told the module of the icons is his, and left alone
	private pageTheme = "";							// the stylesheet that gives the pages the theme of x4 (see view/pagetheme.ts)
	private unsaved = false;						// pages, styles or icons were added, changed or removed since the project was saved
	private trying = false;							// the page that is shown is tried (see BoxSurface.setTrying)
	private stylesChanged = false;					// the styles were: every page is to be generated again
	private theme: Theme = { values: {} };			// the theme of the project
	private themeChanged = false;					// it was changed: it is to be written

	constructor( ) {
		super( {} );

		this.base = readComponents( library );
		registerComponents( this.base );

		// the CSS properties a style may set, and the colors a theme may: data too
		setLook( readLook( library ) );
		setThemeColors( readThemeColors( library ) );

		// what a page is shown with is not the theme of the studio
		const variables = rootVariables( );
		this.pageTheme = pageTheme( THEME_SCOPE, variables );

		const current = this.current;

		// What the assistant does, it does as the user would: on the page
		// that is shown, with the classes and the pages of the project.
		this.assistant = new Assistant( {
			document: ( ) => this.active ? this.active.surface.doc : null,
			pageName: ( ) => this.active ? this.active.info.name : "",
			pageNames: ( ) => this.pages.map( info => info.name ),
			selection: ( ) => current.getSelection( ),
			change: action => this.changeByAssistant( action ),
			select: nodes => current.select( nodes ),
			setStyles: ( styles, classes ) => this.changeStyles( styles, classes ),
			openPage: name => this.showPage( name ),
			addPage: name => this.makePage( name ),

			// its answer is over: so is the step that undoes it
			done: ( ) => current.endEdit( ),
			keep: chat => this.keepChat( chat ),
		} );

		// on the left: what can be added, and the actions
		const tools = new VBox( {
			cls: "side",
			content: [
				// create: one button per component that is described
				this.refs.tools = new CreateTools( { cls: "tools", surface: current } ),

				// edit
				new HBox( {
					cls: "tools",
					content: [
						this.tool( icons.undo, `Undo (${shortcutText( "Mod+Z" )})`, ( ) => current.getActive( )?.undo( ) ),

						// the surface takes both keys on every system: the one of the system is written
						this.tool( icons.redo, `Redo (${shortcutText( isMac ? "Shift+Mod+Z" : "Mod+Y" )})`, ( ) => current.getActive( )?.redo( ) ),
						this.tool( icons.remove, "Delete (Del)", ( ) => current.getActive( )?.deleteSelection( ) ),
						this.tool( icons.before, "Move before (Arrow up)", ( ) => current.getActive( )?.reorder( "backward" ) ),
						this.tool( icons.after, "Move after (Arrow down)", ( ) => current.getActive( )?.reorder( "forward" ) ),
					],
				} ),

				// The items of what is selected, when it has some of its own.
				// Last: the rows above do not move when it comes and goes.
				this.refs.items = new ItemTools( { cls: "tools", surface: current } ),
			],
		} );

		// On the right: the inspector of what is selected, or of the page.
		// Its attributes, its classes, and what it sets for itself.
		const properties = this.refs.inspector = new Inspector( {
			surface: current,
			stylesChange: ( styles, classes ) => this.changeStyles( styles, classes ),
			renameClass: style => this.guard( this.renameClass( style ) ),
			removeClass: style => this.guard( this.deleteClass( style ) ),

			// the class whose style it shows is the one that is selected in the tool of the project
			editingChange: ( ) => this.update( ),
		} );

		// The tools can be moved, made to float and closed; the menu of the
		// surface brings a closed one back. The layout is remembered.
		this.dock = new DockingView( {
			cls: "workspace",
			flex: true,
			floating: true,
			closable: true,
			persist: "x4studio.dock",
			layout: LAYOUT,
			panels: [
				{
					id: "project", title: "Project",
					content: this.refs.project = new ProjectPanel( {
						newProject: ( ) => this.guard( this.newProject( false ) ),
						openProject: ( ) => this.refs.picker.showDialog( ),
						saveProject: ( ) => this.save( ),
						exportProject: ( ) => this.guard( this.exportProject( ) ),
						tryPage: ( ) => this.active?.surface.setTrying( !this.trying ),
						addPage: ( ) => this.guard( this.addPage( ) ),
						openPage: page => this.guard( this.openPage( page ) ),
						renamePage: ( ) => this.guard( this.renamePage( ) ),
						removePage: ( ) => this.guard( this.removePage( ) ),

						addClass: ( ) => this.guard( this.createClass( ) ),
						editClass: style => properties.editClass( style ? style.id : null ),
						applyClass: style => this.applyClass( style ),
						renameClass: style => this.guard( this.renameClass( style ) ),
						removeClass: style => this.guard( this.deleteClass( style ) ),

						addIcons: files => this.guard( this.addIcons( files ) ),
						renameIcon: icon => this.guard( this.renameIcon( icon ) ),
						removeIcon: icon => this.guard( this.removeIcon( icon ) ),
					} ),
				},

				// the theme of the project: as a whole, and control by control
				{
					id: "theme", title: "Theme",
					content: this.refs.theme = new ThemePanel( {
						change: theme => this.changeTheme( theme ),

						// every variable of x4: those of each control are offered too
						variables: [...variables.keys( )],
						applied: name => getComputedStyle( this.refs.probe.dom ).getPropertyValue( name ).trim( ),
					} ),
				},
				{ id: "tools", title: "Tools", content: tools },
				{ id: "tree", title: "Objects", content: new TreePanel( { surface: current, order: "flow", page: true } ) },

				// the pages that are open, one above the other: only the one that is shown is seen
				{ id: "pages", kind: "content", content: this.refs.pages = new Component( { cls: "pages", flex: true } ) },

				{ id: "properties", title: "Inspector", content: properties },
				// its lines are long: it may also go under the page
				{ id: "code", title: "Code", sides: ["left", "right", "bottom"], content: this.refs.code = new Component( { tag: "pre", cls: "code" } ) },

				// a conversation is read in width: under the page, or on a side
				{ id: "chat", title: "Chat", sides: ["bottom", "left", "right"], content: new ChatPanel( { assistant: this.assistant } ) },
			],
		} );

		this.setContent( [
			this.dock,

			// The stylesheet of the styles of the project, kept up to date
			// while they are edited: its rules only apply inside the pages.
			this.refs.sheet = new Component( { tag: "style" } ),
			this.refs.probe = new Component( { cls: THEME_PROBE, hidden: true } ),

			new HBox( {
				cls: "status",
				content: this.refs.status = new Label( { cls: "help", flex: true, text: "" } ),
			} ),

			// to choose the zip of a project: not seen
			this.refs.picker = new FileDialog( {
				accept: ".zip",
				callback: files => {
					if( files.length ) {
						this.guard( this.loadZip( files[0] ) );
					}
				},
			} ),
		] );

		// Leaving the page (closed, loaded again) with changes that are not
		// saved: the browser asks first. It only does when it is told so
		// while the page is being left.
		window.addEventListener( "beforeunload", ev => {
			if( this.hasChanges( ) ) {
				ev.preventDefault( );
				ev.returnValue = true;		// for the browsers that do not look at the line above
			}
		} );

		this.update( );
		this.guard( this.start( ) );
	}

	/**
	 * What the studio starts on: the project the browser kept, as it was
	 * saved last; without one, the project of the demo.
	 */

	private async start( ): Promise<void> {
		const kept = await cachedProject( );

		if( kept ) {
			const store = new ZipStore( kept.name, keep, kept.bytes, PROJECT_FILE );
			const project = await Project.open( store );

			if( project ) {
				this.zip = store;
				await this.setProject( project );

				notify( `"${project.info.name}" is back, as it was saved in this browser on ${new Date( kept.savedAt ).toLocaleString( )}.` );
				return;
			}
		}

		await this.newProject( true );
	}

	/**
	 * a button of the palette
	 */

	private tool( icon: string, tooltip: string, action: ( ) => void ) {
		return new Button( { cls: "outline", icon, tooltip, click: action } );
	}

	/**
	 * What is done with the files of a project is asynchronous, and may
	 * fail: the user is told, whatever it is.
	 */

	private guard( work: Promise<unknown> ): void {
		work.catch( error => {
			console.error( error );
			this.error( error instanceof Error ? error.message : String( error ) );
		} );
	}

	private error( message: string ): Promise<string> {
		return MessageBox.showAsync( message, ["ok.outline.default"], "x4studio", "error" );
	}

	private async confirm( message: string ): Promise<boolean> {
		return await MessageBox.showAsync( message, ["yes.outline.default", "no.outline"], "x4studio", "question" ) === "yes";
	}

	/**
	 * In the menu of a surface: the tools that are shown, to hide them or
	 * to bring them back.
	 */

	private panelsMenu( ): MenuElement[] {
		const dock = this.dock;
		const item = ( id: string, text: string ) => ( { text, checked: dock.isPanelVisible( id ), click: ( ) => dock.showPanel( id, !dock.isPanelVisible( id ) ) } );

		return [ {
			text: "Tools",
			menu: new Menu( {
				items: [
					item( "project", "Project" ),
					item( "tools", "Tools" ),
					item( "tree", "Objects" ),
					item( "properties", "Inspector" ),
					item( "code", "Code" ),
					item( "chat", "Chat" ),
					item( "theme", "Theme" ),
					"-",
					{ text: "Reset layout", click: ( ) => dock.resetLayout( ) },
				],
			} ),
		} ];
	}

	// :: PROJECT :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/** true when something of the project was not saved */
	private hasChanges( ): boolean {
		return this.unsaved || [...this.open.values( )].some( page => this.isChanged( page ) );
	}

	private isChanged( page: OpenPage ): boolean {
		return page.surface.doc.snapshot( ) !== page.saved;
	}

	/**
	 * Before the project is left for another: what was not saved would be
	 * lost, the user says if it may be.
	 */

	private async mayLeave( ): Promise<boolean> {
		return !this.hasChanges( ) || await this.confirm( "The project has changes that are not saved. Go on, and lose them?" );
	}

	/**
	 * A new project: with one empty page, or the one of the demo when the
	 * studio starts.
	 */

	private async newProject( withDemo: boolean ): Promise<void> {
		if( !await this.mayLeave( ) ) {
			return;
		}

		// the browser keeps the one before until this one is saved
		const store = new ZipStore( withDemo ? "demo" : "untitled", keep );
		const project = await Project.create( store, withDemo ? demo.name : "Untitled" );

		if( withDemo ) {
			await fillDemo( project );
		}
		else {
			await project.addPage( FIRST_PAGE );
		}

		this.zip = store;
		await this.setProject( project );
	}

	/**
	 * Open the project a zip holds. A zip that holds none can become one:
	 * the folder of an application the studio never saw.
	 */

	private async loadZip( file: File ): Promise<void> {
		if( !await this.mayLeave( ) ) {
			return;
		}

		const name = file.name.replace( /\.zip$/i, "" );
		const store = new ZipStore( name, keep, new Uint8Array( await file.arrayBuffer( ) ), PROJECT_FILE );

		let project = await Project.open( store );

		if( !project ) {
			if( !await this.confirm( `"${file.name}" holds no project of the studio. Make one in it?` ) ) {
				return;
			}

			project = await Project.create( store, name );
		}

		this.zip = store;
		await this.setProject( project );

		// It is the one the browser keeps from now on, in place of the one
		// before: loaded again, the studio starts on it.
		await project.commit( );
	}

	/**
	 * The studio works on this project from now on: its components are
	 * those of the studio and its own, and its first page is shown.
	 */

	private async setProject( project: Project ): Promise<void> {
		for( const page of this.open.values( ) ) {
			this.refs.pages.removeChild( page.surface );
		}

		this.open.clear( );
		this.active = null;
		this.current.setActive( null );

		this.project = project;
		this.unsaved = false;

		// its own descriptions may be wrong: the project is opened without them
		let own: ComponentDef[] = [];
		try {
			own = await project.components( );
		}
		catch( error ) {
			await this.error( `The components of the project are not used: ${error instanceof Error ? error.message : error}` );
		}

		registerComponents( [...this.base, ...own] );
		this.refs.tools.update( );
		this.refs.items.update( true );

		// its styles too: without them, its components only lose their classes
		let styles: StyleDef[] = [];
		try {
			styles = await project.styles( );
		}
		catch( error ) {
			await this.error( `The styles of the project are not used: ${error instanceof Error ? error.message : error}` );
		}

		this.applyStyles( styles, true );
		this.stylesChanged = false;

		this.icons = await project.icons( );
		setIcons( this.icons );

		// its theme: without it, its pages have the colors of x4
		this.theme = { values: {} };
		try {
			this.theme = await project.theme( );
		}
		catch( error ) {
			await this.error( `The theme of the project is not used: ${error instanceof Error ? error.message : error}` );
		}

		this.themeChanged = false;
		this.showTheme( );

		this.pages = await project.pages( );

		// the conversation that was kept with it
		this.assistant.load( await project.chat( ) );

		if( this.pages.length ) {
			await this.openPage( this.pages[0] );
		}
		else {
			this.update( );
		}
	}

	/**
	 * The styles of the project are these, from now on: the stylesheet the
	 * pages are shown with follows, and the choice of a style above the
	 * properties. `classes` is true when the classes of the components may
	 * have changed (a style renamed, removed): the pages are built again.
	 * Otherwise only what the classes set changed, and what is selected may
	 * have another size.
	 */

	private applyStyles( styles: StyleDef[], classes: boolean ): void {
		setStyles( styles );

		this.writeSheet( );

		for( const page of this.open.values( ) ) {
			if( classes ) {
				page.surface.redraw( );
			}
			else {
				page.surface.refresh( );
			}
		}

		// its tags, what applies to what is selected: only the fields when no class changed
		this.refs.inspector.update( classes );
		this.update( );
	}

	/**
	 * The stylesheet the pages are shown with: the theme of x4, the one of
	 * the project over it, then its classes over both.
	 */

	private writeSheet( ): void {
		this.refs.sheet.setContent( this.pageTheme + themeCss( this.theme, THEME_SCOPE ) + cssOf( getStyles( ), getLook( ), PAGE_SCOPE ) );
	}

	/**
	 * The pages take the theme of the project, and its tool shows it: with,
	 * for the colors it does not set, those that apply now.
	 */

	private showTheme( ): void {
		this.writeSheet( );

		for( const page of this.open.values( ) ) {
			page.surface.refresh( );
		}

		this.refs.theme.setTheme( this.theme );
	}

	/**
	 * The theme of the project was changed by the user: it is to be saved.
	 */

	private changeTheme( theme: Theme ): void {
		this.theme = theme;
		this.themeChanged = true;
		this.unsaved = true;

		this.showTheme( );
		this.update( );
	}

	/**
	 * The styles of the project were changed by the user: they are to be
	 * saved, and the pages generated again.
	 */

	private changeStyles( styles: StyleDef[], classes: boolean ): void {
		this.unsaved = true;
		this.stylesChanged = true;
		this.applyStyles( styles, classes );
	}

	// :: CLASSES :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Ask the name of a class: the one of a CSS class, which no other
	 * class has (`but` is the one that is renamed). null when the user
	 * gives up, or gives a name that cannot be one.
	 */

	private async askClassName( title: string, value: string, but?: StyleDef ): Promise<string> {
		const name = ( await InputBox.showAsync( "Name of the class, as CSS names one (card, big-title):", value, title ) )?.trim( );

		if( !name ) {
			return null;
		}

		if( !isStyleName( name ) ) {
			await this.error( `"${name}" cannot be the name of a class: letters, digits, - and _, not a digit first, and not a name that starts with x4.` );
			return null;
		}

		if( getStyles( ).some( style => style !== but && style.name === name ) ) {
			await this.error( `A class is already called "${name}".` );
			return null;
		}

		return name;
	}

	/**
	 * A new class, which sets nothing yet: its style is shown in the
	 * inspector, to be filled in.
	 */

	private async createClass( ): Promise<void> {
		const name = await this.askClassName( "New class", "" );
		if( !name ) {
			return;
		}

		const style: StyleDef = { id: nextStyleId( getStyles( ) ), name, values: {} };

		this.changeStyles( [...getStyles( ), style], false );
		this.refs.inspector.editClass( style.id );
	}

	private async renameClass( style: StyleDef ): Promise<void> {
		const name = await this.askClassName( "Rename the class", style.name, style );

		if( name && name !== style.name ) {
			style.name = name;
			this.changeStyles( getStyles( ), true );
		}
	}

	/**
	 * The components that have the class keep its id: they are simply
	 * without it.
	 */

	private async deleteClass( style: StyleDef ): Promise<void> {
		if( await this.confirm( `Delete the class "${style.name}"? The components that have it lose it.` ) ) {
			this.changeStyles( getStyles( ).filter( s => s !== style ), true );
		}
	}

	/**
	 * Give a class to what is selected on the page, beside those it has:
	 * one step of the page.
	 */

	private applyClass( style: StyleDef ): void {
		const current = this.current;

		for( const node of current.getSubjects( ) ) {
			const ids = styleIds( node );

			if( !ids.includes( style.id ) ) {
				current.setProps( { [STYLES_PROP]: [...ids, style.id] }, [node] );
			}
		}
	}

	// :: ICONS :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Add svg files to the icons of the project. Each one gets its name
	 * from the one of its file, with a number after it when an icon already
	 * has that name. Those that are not svg files that only draw are left
	 * out, and the user is told which.
	 */

	private async addIcons( files: FileList ): Promise<void> {
		if( !this.project ) {
			return;
		}

		const refused: string[] = [];

		for( const file of Array.from( files ) ) {
			const svg = await file.text( );

			if( !isIconSource( svg ) ) {
				refused.push( file.name );
				continue;
			}

			const base = iconNameOf( file.name );
			let name = base;

			for( let n = 2; this.icons.some( icon => icon.name === name ); n++ ) {
				name = `${base}-${n}`;
			}

			const icon = await this.project.addIcon( name, svg );
			if( icon ) {
				this.icons.push( icon );
			}
			else {
				refused.push( file.name );
			}
		}

		await this.iconsChanged( );

		if( refused.length ) {
			await this.error( `Not added, they are not svg files that only draw: ${refused.join( ", " )}` );
		}
	}

	/**
	 * The icons of the project changed: the components that have one are
	 * built again, and so is what the inspector offers. The project wrote
	 * its module of icons again; when that file is the user's, which the
	 * studio does not touch, he is told: the code cannot use an icon that
	 * is not in it.
	 */

	private async iconsChanged( ): Promise<void> {
		this.icons = await this.project.icons( );
		setIcons( this.icons );

		for( const page of this.open.values( ) ) {
			page.surface.redraw( );
		}

		this.refs.inspector.update( true );

		this.unsaved = true;
		this.update( );

		if( this.project.ownIconsModule && !this.toldOwnModule ) {
			this.toldOwnModule = true;
			await this.error( `"${this.project.iconsModulePath( )}" was not written by the studio: it is left as it is. The icons of the project are not in it unless you add them.` );
		}
	}

	private async renameIcon( icon: IconInfo ): Promise<void> {
		const name = ( await InputBox.showAsync( "Name of the icon (save, arrow-left):", icon.name, "Rename the icon" ) )?.trim( );

		if( !name || name === icon.name ) {
			return;
		}

		if( !isIconName( name ) ) {
			await this.error( `"${name}" cannot be the name of an icon: letters in lower case, digits, - and _, a letter first.` );
			return;
		}

		if( !await this.project.renameIcon( icon, name ) ) {
			await this.error( `An icon is already called "${name}".` );
			return;
		}

		await this.iconsChanged( );
	}

	private async removeIcon( icon: IconInfo ): Promise<void> {
		if( !await this.confirm( `Delete the icon "${icon.name}" and its file (${icon.path})?` ) ) {
			return;
		}

		await this.project.removeIcon( icon );
		await this.iconsChanged( );
	}

	/**
	 * save the project: what the button and the shortcut do
	 */

	save( ): void {
		this.guard( this.saveProject( ).then( ( ) => {
			if( this.project ) {
				notify( `"${this.project.info.name}" is saved in this browser.` );
			}
		} ) );
	}

	/**
	 * Save the project, then give its zip to the user: what he keeps, or
	 * unzips where the code of his application is.
	 */

	private async exportProject( ): Promise<void> {
		if( !this.project ) {
			return;
		}

		await this.saveProject( );
		download( this.zip.name, this.zip.toBytes( ) );
	}

	/**
	 * Write the pages that changed, then make the project what was written:
	 * the browser keeps its zip.
	 */

	private async saveProject( ): Promise<void> {
		if( !this.project ) {
			return;
		}

		for( const page of this.open.values( ) ) {
			// a field that is being typed in: what it holds now is saved
			page.surface.endEdit( );

			if( this.isChanged( page ) ) {
				await this.project.savePage( page.info, page.surface.doc );
				page.saved = page.surface.doc.snapshot( );
			}
		}

		// The styles, and the stylesheet that is generated from them. The
		// code of a page names the classes: every page is written again,
		// those that are not open too.
		if( this.stylesChanged ) {
			await this.project.saveStyles( getStyles( ), getLook( ) );

			for( const info of this.pages ) {
				const doc = this.open.get( info.path )?.surface.doc ?? await this.project.loadPage( info );
				if( doc ) {
					await this.project.savePage( info, doc );
				}
			}

			this.stylesChanged = false;
		}

		// the theme, and the stylesheet the application imports
		if( this.themeChanged ) {
			await this.project.saveTheme( this.theme );
			this.themeChanged = false;
		}

		await this.project.commit( );

		this.unsaved = false;
		this.update( );
	}

	// :: PAGES :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Show a page. The first time, its document is read and it gets a
	 * surface, which it keeps as long as the project is open: its
	 * selection and its steps for undo are there when it is shown again.
	 */

	private async openPage( info: PageInfo ): Promise<void> {
		let page = this.open.get( info.path );

		if( !page ) {
			const doc = await this.project.loadPage( info );
			if( !doc ) {
				await this.error( `"${info.path}" is not a page of the studio anymore.` );
				return;
			}

			const surface: BoxSurface = new BoxSurface( {
				document: doc,
				hidden: true,
				menu: ( ) => this.panelsMenu( ),

				// tried, or edited again: the button of the project tool and the help say which
				tryChange: on => {
					if( surface === this.active?.surface || !on ) {
						this.trying = !!this.active && this.active.surface.isTrying( );
						this.refs.project.setTrying( this.trying );
						this.update( );
					}
				},

				selectionChange: ( ) => {
					this.current.fire( "selectionChange", surface );
					this.update( );
				},

				change: ( ) => {
					this.current.fire( "change", surface );
					this.update( );
				},
			} );

			this.refs.pages.appendContent( surface );

			page = { info, surface, saved: doc.snapshot( ) };
			this.open.set( info.path, page );
		}

		this.activate( page );
	}

	/**
	 * the page that is shown; null for none
	 */

	private activate( page: OpenPage ): void {
		for( const other of this.open.values( ) ) {
			// a page that is not shown anymore is not tried anymore
			if( other !== page ) {
				other.surface.setTrying( false );
			}

			other.surface.show( other === page );
		}

		this.active = page;
		this.current.setActive( page?.surface ?? null );

		this.trying = !!page && page.surface.isTrying( );
		this.refs.project.setTrying( this.trying );

		// nothing had a place while the surface was hidden
		page?.surface.refresh( );
		page?.surface.focus( );

		this.update( );
	}

	/**
	 * Ask the name of a page: the one of a class. null when the user gives
	 * up, or gives a name that cannot be one.
	 */

	private async askPageName( title: string, value: string ): Promise<string> {
		const name = ( await InputBox.showAsync( "Name of the page, as a class is named (LoginPage):", value, title ) )?.trim( );

		if( !name ) {
			return null;
		}

		if( !isPageName( name ) ) {
			await this.error( `"${name}" cannot be the name of a page: letters, digits and _, a letter first.` );
			return null;
		}

		return name;
	}

	private async addPage( ): Promise<void> {
		const name = this.project ? await this.askPageName( "New page", "" ) : null;
		if( !name ) {
			return;
		}

		if( !await this.makePage( name ) ) {
			await this.error( `A page is already called "${name}".` );
		}
	}

	/**
	 * A new page of that name, which is shown. false when the name cannot
	 * be the one of a page, or when a page already has it.
	 */

	private async makePage( name: string ): Promise<boolean> {
		const info = this.project && isPageName( name ) ? await this.project.addPage( name ) : null;
		if( !info ) {
			return false;
		}

		this.pages = await this.project.pages( );
		this.unsaved = true;

		await this.openPage( info );
		return true;
	}

	/**
	 * Show the page of that name; false when the project has none.
	 */

	private async showPage( name: string ): Promise<boolean> {
		const info = this.pages.find( page => page.name === name );
		if( !info ) {
			return false;
		}

		await this.openPage( info );
		return this.active !== null && this.active.info.path === info.path;
	}

	// :: ASSISTANT :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The assistant changes the page that is shown. Everything it does
	 * for one answer is one step for undo, which ends with the answer
	 * (see `done`, where the assistant is made); the panels follow as it
	 * goes, without waiting for that end.
	 */

	private changeByAssistant( action: ( ) => void ): void {
		const surface = this.current.getActive( );
		if( !surface ) {
			return;
		}

		surface.beginEdit( );
		surface.run( action );

		this.current.fire( "change", surface );
		this.update( );
	}

	/**
	 * The conversation is kept with the project, in its folder: it is
	 * written with it when the project is saved. Not the key of the API,
	 * which is the user's (see view/chatpanel.ts).
	 */

	private keepChat( chat: string ): void {
		if( this.project ) {
			this.unsaved = true;
			this.guard( this.project.saveChat( chat ) );
			this.update( );
		}
	}

	/**
	 * Rename the page that is shown: its class and its file follow.
	 */

	private async renamePage( ): Promise<void> {
		const page = this.active;
		const name = page ? await this.askPageName( "Rename the page", page.info.name ) : null;

		if( !name || name === page.info.name ) {
			return;
		}

		page.surface.endEdit( );

		const renamed = await this.project.renamePage( page.info, name, page.surface.doc );
		if( !renamed ) {
			await this.error( `A page is already called "${name}".` );
			return;
		}

		// its file was written again, with what it holds now
		this.open.delete( page.info.path );
		page.info = renamed;
		page.saved = page.surface.doc.snapshot( );
		this.open.set( renamed.path, page );

		this.pages = await this.project.pages( );
		this.unsaved = true;
		this.update( );
	}

	/**
	 * Delete the page that is shown, and its file.
	 */

	private async removePage( ): Promise<void> {
		const page = this.active;
		if( !page || !await this.confirm( `Delete the page "${page.info.name}" and its file (${page.info.path})?` ) ) {
			return;
		}

		await this.project.removePage( page.info );

		this.refs.pages.removeChild( page.surface );
		this.open.delete( page.info.path );

		this.pages = await this.project.pages( );
		this.unsaved = true;

		// another page takes its place: one that is open, or the first of the project
		const next = [...this.open.values( )][0];

		if( next ) {
			this.activate( next );
		}
		else if( this.pages.length ) {
			await this.openPage( this.pages[0] );
		}
		else {
			this.activate( null );
		}
	}

	// :: DISPLAY :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	private update( ): void {
		const page = this.active;

		this.refs.status.setText( !page ? HELP_NO_PAGE : this.trying ? HELP_TRY : page.surface.getSelection( ).length ? HELP_SELECTION : HELP_NOTHING );

		// what would be written in the file of the page
		this.refs.code.setContent( page ? this.project.sourceOf( page.info, page.surface.doc ) : "" );

		this.refs.project.setProject( this.project?.info.name ?? "", this.hasChanges( ), this.pages.map( info => {
			const open = this.open.get( info.path );
			return { info, active: !!open && open === page, changed: !!open && this.isChanged( open ) };
		} ) );

		// its classes, with the one whose style the inspector shows, and its icons
		this.refs.project.setClasses( getStyles( ), this.refs.inspector.getEditing( ) );
		this.refs.project.setIcons( this.icons );
	}
}

class App extends Application {
	constructor( ) {
		super( {} );

		// the buttons of the palette only have an icon: their name is a tooltip
		initTooltips( );

		const view = new MainView( );
		this.setMainView( view );

		// wherever the focus is, a field included
		this.addShortcut( "Mod+S", ( ) => view.save( ), { editable: true } );
	}
}

new App( );
