/**
 * @file projectpanel.ts
 * @description the project tool: the project that is open, and what it holds
 *
 * It shows, and asks: what a button or a row does is the business of the
 * host, which gives it what to show.
 *
 *   New, Open, Save, Export   the project
 *   Try                       the page that is shown: alive, as in the application
 *
 * Then three tabs:
 *
 *   Pages     a click on a page shows it on the surface: the page that is
 *             selected in the list is the one that is shown; a double
 *             click renames it
 *   Classes   the styles of the project. A click on a class shows its
 *             style in the inspector, where it is edited; a double click
 *             gives the class to what is selected on the page
 *   Icons     the svg files of the project. Files are added by dropping
 *             them on the list, or with the button that chooses some
 *
 * (the theme of the project is a tool of its own: see themepanel.ts)
 */

import { BoxProps, Button, EvSelectionChange, FileDialog, HBox, Label, Listbox, ListItem, Tabs, VBox, dragManager } from "x4js";

import type { IconInfo, PageInfo } from "../core/project.ts";
import type { StyleDef } from "../core/styles.ts";

import "./projectpanel.scss";

/** a page, as the tool shows it */
export interface PageRow {
	info: PageInfo;
	active: boolean;		// it is the one that is shown
	changed: boolean;		// it was changed since it was saved
}

interface ProjectPanelProps extends BoxProps {
	newProject: ( ) => void;
	openProject: ( ) => void;
	saveProject: ( ) => void;
	exportProject: ( ) => void;

	/** try the page that is shown, or go back to editing it */
	tryPage: ( ) => void;

	addPage: ( ) => void;
	openPage: ( page: PageInfo ) => void;
	renamePage: ( ) => void;
	removePage: ( ) => void;

	addClass: ( ) => void;
	editClass: ( style: StyleDef ) => void;			// show its style in the inspector; null: none
	applyClass: ( style: StyleDef ) => void;		// give it to what is selected on the page
	renameClass: ( style: StyleDef ) => void;
	removeClass: ( style: StyleDef ) => void;

	addIcons: ( files: FileList ) => void;
	renameIcon: ( icon: IconInfo ) => void;
	removeIcon: ( icon: IconInfo ) => void;
}

/**
 *
 */

export class ProjectPanel extends VBox<ProjectPanelProps> {
	declare protected refs: {
		name: Label,
		tryPage: Button,

		pages: Listbox,
		renamePage: Button,
		removePage: Button,

		classes: Listbox,
		renameClass: Button,
		removeClass: Button,

		icons: Listbox,
		renameIcon: Button,
		removeIcon: Button,
	};

	private pages: PageRow[] = [];
	private styles: StyleDef[] = [];
	private icons: IconInfo[] = [];

	private editing: number = null;		// the id of the class whose style is in the inspector
	private icon: string = null;		// the name of the icon that is selected

	// what each list was filled from, and whether it is being filled: what
	// it then says of its selection is not the user's
	private shown = { pages: null as string, classes: null as string, icons: null as string };
	private updating = false;

	constructor( props: ProjectPanelProps ) {
		super( props );

		this.setContent( [
			new HBox( {
				cls: "bar",
				content: [
					new Button( { cls: "outline", label: "New", tooltip: "A new project", click: ( ) => props.newProject( ) } ),
					new Button( { cls: "outline", label: "Open", tooltip: "Open a project: a zip", click: ( ) => props.openProject( ) } ),
					new Button( { cls: "outline", label: "Save", tooltip: "Save the project: this browser keeps it", click: ( ) => props.saveProject( ) } ),
					new Button( { cls: "outline", label: "Export", tooltip: "Save the project, and download its zip", click: ( ) => props.exportProject( ) } ),
					this.refs.tryPage = new Button( { cls: "outline", label: "Try", tooltip: "Try the page that is shown: it is alive, as in the application. Again, or Esc, to go back to editing it.", click: ( ) => props.tryPage( ) } ),
				],
			} ),

			this.refs.name = new Label( { cls: "name", text: "" } ),

			new Tabs( {
				cls: "inline",
				flex: true,
				default: "pages",
				items: [
					{ name: "pages", title: "Pages", content: this.makePages( ) },
					{ name: "classes", title: "Classes", content: this.makeClasses( ) },
					{ name: "icons", title: "Icons", content: this.makeIcons( ) },
				],
			} ),
		] );
	}

	/**
	 * the page is tried, or edited: the button says which
	 */

	setTrying( on: boolean ): void {
		this.refs.tryPage.setClass( "down", on );
	}

	/**
	 * a bar of small buttons above a list
	 */

	private makeBar( buttons: Button[] ): HBox {
		return new HBox( { cls: "bar", content: buttons } );
	}

	/**
	 * Fill a list, when what it shows changed, and select a row in it,
	 * without the list taking it for what the user did.
	 */

	private fill( list: Listbox, name: "pages" | "classes" | "icons", items: ListItem[], selected: string | number ): void {
		this.updating = true;

		const shown = JSON.stringify( items.map( item => [item.id, item.text] ) );
		if( shown !== this.shown[name] ) {
			this.shown[name] = shown;
			list.setItems( items );
		}

		list.select( selected === null || selected === undefined ? [] : selected, false );
		this.updating = false;
	}

	// :: PAGES :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	private makePages( ): VBox {
		const props = this.props;

		return new VBox( {
			cls: "tab",
			content: [
				this.makeBar( [
					new Button( { cls: "outline", label: "+", tooltip: "A new page", click: ( ) => props.addPage( ) } ),
					this.refs.renamePage = new Button( { cls: "outline", label: "Rename", tooltip: "Rename the page that is shown", click: ( ) => props.renamePage( ) } ),
					this.refs.removePage = new Button( { cls: "outline", label: "Delete", tooltip: "Delete the page that is shown", click: ( ) => props.removePage( ) } ),
				] ),

				this.refs.pages = new Listbox( {
					cls: "list",
					flex: true,
					emptyMsg: "No page",
					selectionChange: ev => this.onPage( ev ),
					dblClick: ( ) => props.renamePage( ),
				} ),
			],
		} );
	}

	/**
	 * The user selected a page in the list: it is the one to show. A click
	 * beside the pages selects none: the list goes back to the page that
	 * is shown.
	 */

	private onPage( ev: EvSelectionChange ): void {
		if( this.updating ) {
			return;
		}

		const active = this.pages.find( page => page.active );
		const page = this.pages.find( p => p.info.path === ev.selection[0] );

		if( !page ) {
			this.refs.pages.select( active ? active.info.path : [], false );
		}
		else if( page !== active ) {
			this.props.openPage( page.info );
		}
	}

	/**
	 * What the tool shows of the project: its name, with a mark when
	 * something of it is not saved, and its pages.
	 */

	setProject( name: string, changed: boolean, pages: PageRow[] ): void {
		this.pages = pages;
		this.refs.name.setText( changed ? `${name} •` : name );

		const active = pages.find( page => page.active );

		this.fill(
			this.refs.pages,
			"pages",
			pages.map( page => ( { id: page.info.path, text: page.changed ? `${page.info.name} •` : page.info.name } ) ),
			active ? active.info.path : null,
		);

		// they act on the page that is shown
		this.refs.renamePage.enable( !!active );
		this.refs.removePage.enable( !!active );
	}

	// :: CLASSES :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	private makeClasses( ): VBox {
		const props = this.props;
		const current = ( ) => this.styles.find( style => style.id === this.editing );

		// the buttons act on the class that is selected
		const act = ( action: ( style: StyleDef ) => void ) => {
			const style = current( );
			if( style ) {
				action( style );
			}
		};

		return new VBox( {
			cls: "tab",
			content: [
				this.makeBar( [
					new Button( { cls: "outline", label: "+", tooltip: "A new class", click: ( ) => props.addClass( ) } ),
					this.refs.renameClass = new Button( { cls: "outline", label: "Rename", tooltip: "Rename the class", click: ( ) => act( props.renameClass ) } ),
					this.refs.removeClass = new Button( { cls: "outline", label: "Delete", tooltip: "Delete the class", click: ( ) => act( props.removeClass ) } ),
				] ),

				this.refs.classes = new Listbox( {
					cls: "list",
					flex: true,
					emptyMsg: "No class",
					selectionChange: ev => this.onClass( ev ),
					dblClick: ( ) => act( props.applyClass ),
				} ),
			],
		} );
	}

	/**
	 * The user selected a class: its style is shown in the inspector, to
	 * be edited. A click beside the classes selects none: the inspector
	 * goes back to what is selected on the page.
	 */

	private onClass( ev: EvSelectionChange ): void {
		if( this.updating ) {
			return;
		}

		const style = this.styles.find( s => s.id === ev.selection[0] );
		this.props.editClass( style ?? null );
	}

	/**
	 * The classes of the project, and the one whose style the inspector
	 * shows (its id; null for none).
	 */

	setClasses( styles: StyleDef[], editing: number ): void {
		this.styles = styles;
		this.editing = styles.some( style => style.id === editing ) ? editing : null;

		this.fill( this.refs.classes, "classes", styles.map( style => ( { id: style.id, text: style.name } ) ), this.editing );

		this.refs.renameClass.enable( this.editing !== null );
		this.refs.removeClass.enable( this.editing !== null );
	}

	// :: ICONS :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	private makeIcons( ): VBox {
		const props = this.props;

		// the buttons act on the icon that is selected
		const act = ( action: ( icon: IconInfo ) => void ) => {
			const icon = this.icons.find( i => i.name === this.icon );
			if( icon ) {
				action( icon );
			}
		};

		const add = ( files: FileList ) => {
			if( files && files.length ) {
				props.addIcons( files );
			}
		};

		// to choose files: not seen, opened by the button
		const picker = new FileDialog( { accept: ".svg,image/svg+xml", multiple: true, callback: add } );

		const list = this.refs.icons = new Listbox( {
			cls: "list",
			flex: true,
			emptyMsg: "No icon",
			selectionChange: ev => this.onIcon( ev ),
		} );

		// svg files are dropped on the list itself
		dragManager.registerDropTarget( list, ( command, _, infos ) => {
			if( command === "enter" ) {
				list.addClass( "hit" );
			}
			else if( command === "leave" ) {
				list.removeClass( "hit" );
			}
			else if( command === "drop" ) {
				list.removeClass( "hit" );
				add( infos.data.files );
			}
		} );

		return new VBox( {
			cls: "tab",
			content: [
				this.makeBar( [
					new Button( { cls: "outline", label: "+", tooltip: "Add icons: svg files", click: ( ) => picker.showDialog( ) } ),
					this.refs.renameIcon = new Button( { cls: "outline", label: "Rename", tooltip: "Rename the icon: its file", click: ( ) => act( props.renameIcon ) } ),
					this.refs.removeIcon = new Button( { cls: "outline", label: "Delete", tooltip: "Delete the icon, and its file", click: ( ) => act( props.removeIcon ) } ),
				] ),

				list,
				new Label( { cls: "hint", text: "Drop svg files on the list" } ),
				picker,
			],
		} );
	}

	private onIcon( ev: EvSelectionChange ): void {
		if( this.updating ) {
			return;
		}

		const name = ev.selection[0];
		this.icon = typeof name === "string" ? name : null;

		this.refs.renameIcon.enable( this.icon !== null );
		this.refs.removeIcon.enable( this.icon !== null );
	}

	/**
	 * the icons of the project: each one is drawn before its name
	 */

	setIcons( icons: IconInfo[] ): void {
		this.icons = icons;

		if( !icons.some( icon => icon.name === this.icon ) ) {
			this.icon = null;
		}

		this.fill( this.refs.icons, "icons", icons.map( icon => ( { id: icon.name, text: icon.name, iconId: icon.svg } ) ), this.icon );

		this.refs.renameIcon.enable( this.icon !== null );
		this.refs.removeIcon.enable( this.icon !== null );
	}
}
