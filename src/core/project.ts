/**
 * @file project.ts
 * @description a project of the studio: its pages, and what is said of it
 *
 * A project is a folder, the one of an x4 application. What only the
 * studio reads is in its folder `.x4studio`, as JSON; what the application
 * compiles is with its sources:
 *
 *   .x4studio/project.json     the name, the import of x4, where the pages and the icons are
 *   src/pages/login.ui.ts      a page, generated, which holds its document
 *
 * The pages are not listed anywhere: they are the generated files that are
 * found in their folder. A file added, renamed or removed by hand, or by
 * git, is seen as it is.
 *
 * The project does not know where its files are kept (see store.ts).
 *
 * (no DOM here: this file runs as is under node, for the tests)
 */

import { Document } from "./document.ts";

import { readComponents } from "./components.ts";
import type { ComponentDef } from "./components.ts";
import { extractPage, generate } from "./generate.ts";
import { ICONS_MARK, iconsModule } from "./icons.ts";
import type { PageSource } from "./generate.ts";
import type { ProjectStore } from "./store.ts";
import { STYLESHEET_HEADER, cssOf, readStyles, relativePath, writeStyles } from "./styles.ts";
import type { StyleDef, StyleProperty } from "./styles.ts";
import { THEME_HEADER, readTheme, themeCss, writeTheme } from "./theme.ts";
import type { Theme } from "./theme.ts";

/** the file that makes a folder a project of the studio */
export const PROJECT_FILE = ".x4studio/project.json";

/** where a project describes components of its own (see components.ts) */
export const COMPONENTS_FILE = ".x4studio/components.json";

/** where a project keeps its styles (see styles.ts) */
export const STYLES_FILE = ".x4studio/styles.json";

/** where a project keeps its theme (see theme.ts) */
export const THEME_FILE = ".x4studio/theme.json";

/** where a project keeps the conversation with the assistant (see assistant.ts) */
export const CHAT_FILE = ".x4studio/chat.json";

const FORMAT = "x4studio/project";
const VERSION = 1;

/** how the file of a page ends, and the class that is generated in it */
const PAGE_FILE = ".ui.ts";
const PAGE_CLASS = "UI";

/** the size a new page is shown at, while it is edited */
const PAGE_WIDTH = 800;
const PAGE_HEIGHT = 600;

/** what project.json says */
export interface ProjectInfo {
	name: string;

	/** where the generated code imports x4 from */
	x4: string;

	/** the folders of the generated pages and of the icons, from the root of the project */
	pages: string;
	icons: string;

	/** the stylesheet that is generated from the styles of the project, which the pages import */
	stylesheet: string;

	/** the stylesheet that is generated from the theme of the project, which the application imports once */
	theme: string;
}

export interface PageInfo {
	/** the name the user gave: "LoginPage" */
	name: string;

	/** the class that is generated, which the user derives from: "LoginPageUI" */
	className: string;

	/** its file, from the root of the project: "src/pages/loginpage.ui.ts" */
	path: string;
}

/** an icon of the project: an svg file of its folder of icons */
export interface IconInfo {
	/** how it is called: the name of its file, without what ends it */
	name: string;

	/** its file, from the root of the project: "src/icons/save.svg" */
	path: string;

	/** the source of the svg */
	svg: string;
}

/** how the file of an icon ends */
const ICON_FILE = ".svg";

/**
 * An icon is named as its file is: letters in lower case, digits, - and _,
 * a letter first. It is what the code will import it as, one day.
 */

export function isIconName( name: string ): boolean {
	return /^[a-z][a-z0-9_-]*$/.test( name );
}

/**
 * The name an icon gets from the file it comes from: "My Icon (2).SVG"
 * gives "my-icon-2". "icon" when nothing of it can be kept.
 */

export function iconNameOf( fileName: string ): string {
	const name = fileName
		.replace( /\.svg$/i, "" )
		.toLowerCase( )
		.replace( /[^a-z0-9_]+/g, "-" )
		.replace( /^[^a-z]+/, "" )
		.replace( /-+$/, "" );

	return name || "icon";
}

/**
 * True for a text that is an svg, and only draws: no script, and nothing
 * that runs when something happens to it. An icon is put in the page as it
 * is, in the studio and in the application.
 */

export function isIconSource( svg: string ): boolean {
	return /<svg[\s>]/i.test( svg ) && !/<script[\s>]/i.test( svg ) && !/\son[a-z]+\s*=/i.test( svg ) && !/javascript:/i.test( svg );
}

/**
 * A page is named as a class is: its name is the start of the name of the
 * class that is generated for it.
 */

export function isPageName( name: string ): boolean {
	return /^[A-Za-z][A-Za-z0-9_]*$/.test( name );
}

/**
 *
 */

export class Project {

	readonly store: ProjectStore;
	info: ProjectInfo;

	/**
	 * true when the project has a module of icons that the studio did not
	 * write, and does not touch (see writeIconsModule): the icons that are
	 * added are then not in it.
	 */
	ownIconsModule = false;

	private constructor( store: ProjectStore, info: ProjectInfo ) {
		this.store = store;
		this.info = info;
	}

	/**
	 * The project a store holds; null when it holds none (no project.json,
	 * or one that is not of the studio). What project.json does not say
	 * has its default value.
	 */

	static async open( store: ProjectStore ): Promise<Project> {
		const text = await store.read( PROJECT_FILE );
		if( text === null ) {
			return null;
		}

		let data: any;
		try {
			data = JSON.parse( text );
		}
		catch {
			return null;
		}

		if( data?.format !== FORMAT ) {
			return null;
		}

		const textOf = ( value: unknown, otherwise: string ) => typeof value === "string" && value ? value : otherwise;

		return new Project( store, {
			name: textOf( data.name, store.name ),
			x4: textOf( data.x4, "x4js" ),
			pages: textOf( data.pages, "src/pages" ),
			icons: textOf( data.icons, "src/icons" ),
			stylesheet: textOf( data.stylesheet, "src/styles.ui.css" ),
			theme: textOf( data.theme, "src/theme.ui.css" ),
		} );
	}

	/**
	 * A new project, in a store that holds none: its project.json is written.
	 */

	static async create( store: ProjectStore, name: string ): Promise<Project> {
		const project = new Project( store, { name, x4: "x4js", pages: "src/pages", icons: "src/icons", stylesheet: "src/styles.ui.css", theme: "src/theme.ui.css" } );
		await project.writeInfo( );
		return project;
	}

	/**
	 * write project.json again, after `info` was changed
	 */

	async writeInfo( ): Promise<void> {
		await this.store.write( PROJECT_FILE, `${JSON.stringify( { format: FORMAT, version: VERSION, ...this.info }, null, "\t" )}\n` );
	}

	/**
	 * The components the project describes itself, beside those of the
	 * studio: none when it has no file for them. Throws when the file
	 * cannot be understood (see readComponents).
	 */

	async components( ): Promise<ComponentDef[]> {
		const text = await this.store.read( COMPONENTS_FILE );
		if( text === null ) {
			return [];
		}

		let data: unknown;
		try {
			data = JSON.parse( text );
		}
		catch {
			throw new Error( `${COMPONENTS_FILE}: not JSON` );
		}

		return readComponents( data );
	}

	// :: STYLES ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The styles of the project: none when it has no file for them. Throws
	 * when the file cannot be understood (see readStyles).
	 */

	async styles( ): Promise<StyleDef[]> {
		const text = await this.store.read( STYLES_FILE );
		return text === null ? [] : readStyles( text );
	}

	/**
	 * Write the styles of the project, and the stylesheet that is generated
	 * from them. `look` is the CSS properties a style may set.
	 */

	async saveStyles( styles: StyleDef[], look: StyleProperty[] ): Promise<void> {
		await this.store.write( STYLES_FILE, writeStyles( styles ) );
		await this.store.write( this.info.stylesheet, STYLESHEET_HEADER + cssOf( styles, look ) );
	}

	// :: THEME :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The theme of the project: one that sets nothing when it has no file
	 * for it. Throws when the file cannot be understood (see readTheme).
	 */

	async theme( ): Promise<Theme> {
		return readTheme( await this.store.read( THEME_FILE ) );
	}

	/**
	 * Write the theme of the project, and the stylesheet that is generated
	 * from it. The pages do not import that one: a theme is for the whole
	 * application, which imports it once (`import "./theme.ui.css";`).
	 */

	async saveTheme( theme: Theme ): Promise<void> {
		await this.store.write( THEME_FILE, writeTheme( theme ) );
		await this.store.write( this.info.theme, THEME_HEADER + themeCss( theme ) );
	}

	// :: CONVERSATION ::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The conversation with the assistant, as it was kept (see
	 * Assistant.keep); null when the project has none.
	 */

	async chat( ): Promise<string> {
		return await this.store.read( CHAT_FILE );
	}

	async saveChat( text: string ): Promise<void> {
		await this.store.write( CHAT_FILE, text );
	}

	// :: ICONS :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * the file of an icon, from its name
	 */

	iconPath( name: string ): string {
		return `${this.info.icons}/${name}${ICON_FILE}`;
	}

	/**
	 * The icons of the project, sorted by their name: the svg files of its
	 * folder of icons, which are not listed anywhere else. A file that is
	 * not an svg that only draws is left out.
	 */

	async icons( ): Promise<IconInfo[]> {
		const folder = `${this.info.icons}/`;
		const result: IconInfo[] = [];

		for( const path of await this.store.list( this.info.icons ) ) {
			// those of the folder itself: a folder inside it is not looked into
			const file = path.slice( folder.length );
			if( file.includes( "/" ) || !file.toLowerCase( ).endsWith( ICON_FILE ) ) {
				continue;
			}

			const svg = await this.store.read( path );
			if( svg !== null && isIconSource( svg ) ) {
				result.push( { name: file.slice( 0, -ICON_FILE.length ), path, svg } );
			}
		}

		return result.sort( ( a, b ) => a.name.localeCompare( b.name ) );
	}

	/**
	 * Add an icon to the project: its file is written. null when the name
	 * cannot be one, when an icon already has it, or when the text is not
	 * an svg that only draws.
	 */

	async addIcon( name: string, svg: string ): Promise<IconInfo> {
		const path = this.iconPath( name );

		if( !isIconName( name ) || !isIconSource( svg ) || await this.store.read( path ) !== null ) {
			return null;
		}

		await this.store.write( path, svg );
		await this.writeIconsModule( );

		return { name, path, svg };
	}

	async removeIcon( icon: IconInfo ): Promise<void> {
		await this.store.remove( icon.path );
		await this.writeIconsModule( );
	}

	/**
	 * Give another name to an icon: its file changes with it. null when it
	 * cannot be done (see addIcon).
	 */

	async renameIcon( icon: IconInfo, name: string ): Promise<IconInfo> {
		const path = this.iconPath( name );

		if( !isIconName( name ) || await this.store.read( path ) !== null ) {
			return null;
		}

		await this.store.write( path, icon.svg );
		await this.store.remove( icon.path );
		await this.writeIconsModule( );

		return { name, path, svg: icon.svg };
	}

	/**
	 * The module that gives the icons of the project to its code (see
	 * core/icons.ts): beside their folder, with its name. "src/icons.ts"
	 * for the icons of "src/icons".
	 */

	iconsModulePath( ): string {
		return `${this.info.icons}.ts`;
	}

	/**
	 * Write the module of the icons again, from the icons the project has
	 * now; it is made when it is not there. Done each time an icon is
	 * added, renamed or removed: an icon that is not in it cannot be used.
	 *
	 * A file that is there and that the studio did not write is the user's:
	 * it is left as it is (`ownIconsModule` then says so).
	 */

	async writeIconsModule( ): Promise<void> {
		const path = this.iconsModulePath( );
		const existing = await this.store.read( path );

		this.ownIconsModule = existing !== null && !existing.includes( ICONS_MARK );

		if( !this.ownIconsModule ) {
			const folder = this.info.icons.slice( this.info.icons.lastIndexOf( "/" ) + 1 );
			await this.store.write( path, iconsModule( await this.icons( ), `./${folder}` ) );
		}
	}

	// :: PAGES :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * What is known of a page from its name: the names of files are in
	 * lower case, as those of x4 are.
	 */

	pageInfo( name: string ): PageInfo {
		return { name, className: name + PAGE_CLASS, path: `${this.info.pages}/${name.toLowerCase( )}${PAGE_FILE}` };
	}

	/**
	 * The pages of the project, sorted by their name: the generated files
	 * of the folder of the pages, and of the folders inside it.
	 */

	async pages( ): Promise<PageInfo[]> {
		const result: PageInfo[] = [];

		for( const path of await this.store.list( this.info.pages ) ) {
			const source = path.endsWith( PAGE_FILE ) ? await this.readPage( path ) : null;

			if( source ) {
				const className = source.className;
				const name = className.endsWith( PAGE_CLASS ) && className.length > PAGE_CLASS.length ? className.slice( 0, -PAGE_CLASS.length ) : className;

				result.push( { name, className, path } );
			}
		}

		return result.sort( ( a, b ) => a.name.localeCompare( b.name ) );
	}

	/**
	 * what the file of a page holds; null when it is not a page of the studio
	 */

	async readPage( path: string ): Promise<PageSource> {
		const source = await this.store.read( path );
		return source === null ? null : extractPage( source );
	}

	/**
	 * the document of a page; null when its file is not a page of the studio
	 */

	async loadPage( page: PageInfo ): Promise<Document> {
		const source = await this.readPage( page.path );
		if( !source ) {
			return null;
		}

		const doc = new Document( PAGE_WIDTH, PAGE_HEIGHT );
		doc.restore( source.snapshot );
		return doc;
	}

	/**
	 * the source that is generated for a page
	 */

	sourceOf( page: PageInfo, doc: Document ): string {
		// the stylesheet, as it is imported from where the page is
		const folder = page.path.slice( 0, Math.max( 0, page.path.lastIndexOf( "/" ) ) );

		return generate( doc, {
			className: page.className,
			x4: this.info.x4,
			stylesheet: relativePath( folder, this.info.stylesheet ),

			// the module of the icons, as a module is imported: without what ends its file
			icons: relativePath( folder, this.info.icons ),
		} );
	}

	/**
	 * write the file of a page: its code, and its document
	 */

	async savePage( page: PageInfo, doc: Document ): Promise<void> {
		await this.store.write( page.path, this.sourceOf( page, doc ) );
	}

	/**
	 * A new page, empty, whose file is written. null when the name cannot
	 * be one, or when a page already has its file.
	 */

	async addPage( name: string ): Promise<PageInfo> {
		const page = this.pageInfo( name );

		if( !isPageName( name ) || await this.store.read( page.path ) !== null ) {
			return null;
		}

		await this.savePage( page, new Document( PAGE_WIDTH, PAGE_HEIGHT ) );
		return page;
	}

	async removePage( page: PageInfo ): Promise<void> {
		await this.store.remove( page.path );
	}

	/**
	 * Give another name to a page: its class and its file change with it.
	 * `doc` is its document as it is now, when it is being edited; without
	 * it, the one of its file. null when it cannot be done (see addPage).
	 *
	 * The class the user derived from has another name: his own code is
	 * his to change.
	 */

	async renamePage( page: PageInfo, name: string, doc?: Document ): Promise<PageInfo> {
		const renamed = this.pageInfo( name );
		const same = renamed.path === page.path;		// only the case of its letters changes

		if( !isPageName( name ) || ( !same && await this.store.read( renamed.path ) !== null ) ) {
			return null;
		}

		const content = doc ?? await this.loadPage( page );
		if( !content ) {
			return null;
		}

		if( !same ) {
			await this.store.remove( page.path );
		}

		await this.savePage( renamed, content );
		return renamed;
	}

	/**
	 * make what was written last (see ProjectStore.commit)
	 */

	async commit( ): Promise<void> {
		await this.store.commit( );
	}
}
