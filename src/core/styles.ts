/**
 * @file styles.ts
 * @description the styles of a project
 *
 * A style is a CSS class of the project, which the user makes, names, and
 * gives to components: what x4 does with `cls`. It is kept in the project
 * (`.x4studio/styles.json`) and generated as a stylesheet, which the
 * generated pages import.
 *
 * A style holds two things:
 *
 *   values   the CSS properties the studio knows, by their name. Which
 *            ones they are is data (the "look" of src/components.json),
 *            not code: they are edited in a grid, each with its field.
 *   css      declarations typed as a text, for everything else, and above
 *            all the variables of the x4 components ("--button-background:
 *            #c00;"): it is how x4 itself gives a look to its components.
 *
 * A node refers to its styles by their id, in its `props.styles`: a style
 * can be renamed without touching the pages that use it.
 *
 * The styles that are known now are kept here, as the components are in
 * components.ts: what a node is built with depends on them.
 *
 * (no DOM here: this file runs as is under node, for the tests)
 */

import type { DNode } from "./document.ts";
import type { PropertyOption, PropertyType } from "./registry.ts";

/** says what the JSON is, and how it is laid out */
const FORMAT = "x4studio/styles";
const VERSION = 1;

/** the prop of a node that holds the ids of its styles */
export const STYLES_PROP = "styles";

/**
 * What a node sets for itself, over what its styles say: the values of CSS
 * properties the studio knows, by their name (`css`), and declarations
 * that have no field, by the name of the CSS property or of the variable
 * (`vars`). Both are objects, kept in the props of the node under these
 * names: they are copied, saved and undone with it.
 */
export const CSS_PROP = "css";
export const VARS_PROP = "vars";

/** the names a description of component cannot give to a property: the node uses them */
export const RESERVED_PROPS = [STYLES_PROP, CSS_PROP, VARS_PROP];

/**
 * The four sides of a box, for a CSS property that has a value for each
 * (padding, margin): what a value of type "sides" is when its sides are
 * not all the same. When they are, the value is one number.
 */

export interface Sides {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** a CSS property a style may set, as the "look" describes it */
export interface StyleProperty {
	name: string;				// the key in the values of a style
	title: string;

	/** the kind of its value; "sides" is a number for each side of the box, or one for all */
	type: PropertyType | "sides";

	/** the CSS property, as a stylesheet writes it: "background-color" */
	css: string;

	/** what follows a number: "px" when missing, "" for a number that has no unit */
	unit?: string;

	/** the title of the group it is shown in */
	group?: string;

	/** its field takes half a row: two of them side by side (a width and a height) */
	half?: boolean;

	// type "number"
	min?: number;
	max?: number;
	step?: number;

	// type "options": the possible values
	options?: PropertyOption[];
}

export interface StyleDef {
	id: number;
	name: string;								// the name of the class
	values: Record<string, unknown>;			// by the name of a StyleProperty

	/** declarations, as they are typed: "--button-background: #c00; text-transform: uppercase;" */
	css?: string;
}

const PROPERTY_TYPES = ["string", "number", "boolean", "color", "options", "sides"];

let look: StyleProperty[] = [];
let styles: StyleDef[] = [];

function isObject( value: unknown ): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray( value );
}

// :: THE PROPERTIES A STYLE MAY SET ::::::::::::::::::::::::::::::::::::::::::

function isStyleProperty( value: unknown ): value is StyleProperty {
	return isObject( value )
		&& typeof value.name === "string" && value.name !== ""
		&& typeof value.title === "string"
		&& PROPERTY_TYPES.includes( value.type as string )
		&& typeof value.css === "string" && /^-?[a-z][a-z0-9-]*$/.test( value.css )
		&& ( value.unit === undefined || typeof value.unit === "string" )
		&& ( value.type !== "options" || Array.isArray( value.options ) );
}

/**
 * The CSS properties a JSON of descriptions gives (its "look"): none when
 * it gives none. Throws when one of them cannot be understood.
 */

export function readLook( data: unknown ): StyleProperty[] {
	const list = isObject( data ) ? data.look : undefined;

	if( list === undefined ) {
		return [];
	}

	if( !Array.isArray( list ) ) {
		throw new Error( "look: not a list of CSS properties" );
	}

	list.forEach( ( property, i ) => {
		if( !isStyleProperty( property ) ) {
			throw new Error( `look: the property #${i + 1} (${isObject( property ) && typeof property.name === "string" ? property.name : "no name"}) cannot be understood` );
		}
	} );

	return list;
}

/**
 * Tell which CSS properties a style may set. Of two properties of the
 * same name, the last one counts: a project says again one of the studio.
 */

export function setLook( properties: StyleProperty[] ): void {
	const byName = new Map<string, StyleProperty>( );
	properties.forEach( property => byName.set( property.name, property ) );

	look = [...byName.values( )];
}

export function getLook( ): StyleProperty[] {
	return look;
}

// :: THE STYLES ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

/**
 * A style is named as a CSS class is. Not as x4 names its own: a class
 * that starts with "x4" would meet one of the library.
 */

export function isStyleName( name: string ): boolean {
	return /^[A-Za-z_][A-Za-z0-9_-]*$/.test( name ) && !/^x4/i.test( name );
}

function isStyle( value: unknown ): value is StyleDef {
	return isObject( value )
		&& typeof value.id === "number" && Number.isInteger( value.id ) && value.id > 0
		&& typeof value.name === "string" && isStyleName( value.name )
		&& isObject( value.values )
		&& ( value.css === undefined || typeof value.css === "string" );
}

/**
 * The styles a text holds: the content of styles.json. Throws when it is
 * not one, or when a style cannot be understood.
 */

export function readStyles( text: string ): StyleDef[] {
	let data: unknown;

	try {
		data = JSON.parse( text );
	}
	catch {
		throw new Error( "styles: not JSON" );
	}

	if( !isObject( data ) || data.format !== FORMAT || !Array.isArray( data.styles ) ) {
		throw new Error( "styles: not the styles of a project" );
	}

	data.styles.forEach( ( style, i ) => {
		if( !isStyle( style ) ) {
			throw new Error( `styles: the style #${i + 1} (${isObject( style ) && typeof style.name === "string" ? style.name : "no name"}) cannot be understood` );
		}
	} );

	return data.styles;
}

/**
 * the styles, as styles.json keeps them
 */

export function writeStyles( list: StyleDef[] ): string {
	return `${JSON.stringify( { format: FORMAT, version: VERSION, styles: list }, null, "\t" )}\n`;
}

/**
 * Tell which styles the project has: what a node is built with, and the
 * code that is generated for it, follow.
 */

export function setStyles( list: StyleDef[] ): void {
	styles = list;
}

export function getStyles( ): StyleDef[] {
	return styles;
}

/**
 * an id for a new style: one that no style of the list has
 */

export function nextStyleId( list: StyleDef[] ): number {
	return list.reduce( ( max, style ) => Math.max( max, style.id ), 0 ) + 1;
}

/**
 * The ids of the styles of a node, as it holds them. A style that does not
 * exist anymore is still there: it comes back with the style, if its
 * deletion is undone one day.
 */

export function styleIds( node: DNode ): number[] {
	const ids = node.props?.[STYLES_PROP];
	return Array.isArray( ids ) ? ids.filter( id => typeof id === "number" ) : [];
}

/**
 * The classes the styles of a node give it, in the order of the styles of
 * the project: it is the order of the rules in the stylesheet, hence the
 * one that says which style wins.
 */

export function classesOf( node: DNode ): string[] {
	const ids = styleIds( node );
	return ids.length ? styles.filter( style => ids.includes( style.id ) ).map( style => style.name ) : [];
}

// :: WHAT A NODE SETS FOR ITSELF :::::::::::::::::::::::::::::::::::::::::::::

function objectOf( node: DNode, name: string ): Record<string, unknown> {
	const value = node.props?.[name];
	return isObject( value ) ? value : {};
}

/** the values of CSS properties a node sets for itself, by the name of the property of the look */
export function localCss( node: DNode ): Record<string, unknown> {
	return objectOf( node, CSS_PROP );
}

/** the declarations a node sets for itself, by the name of the CSS property or of the variable */
export function localVars( node: DNode ): Record<string, unknown> {
	return objectOf( node, VARS_PROP );
}

/**
 * The four sides a value holds: itself when it is an object, the same
 * number on each side when it is one number. null for anything else. A
 * side that is missing is 0.
 */

export function sidesOf( value: unknown ): Sides {
	if( typeof value === "number" ) {
		return { left: value, top: value, right: value, bottom: value };
	}

	if( !isObject( value ) ) {
		return null;
	}

	const side = ( name: string ) => typeof value[name] === "number" ? value[name] as number : 0;
	return { left: side( "left" ), top: side( "top" ), right: side( "right" ), bottom: side( "bottom" ) };
}

/**
 * A CSS value, as it is written: a number has its unit, and four sides are
 * given as CSS wants them (top, right, bottom, left).
 */

function cssValue( property: StyleProperty, value: unknown ): string {
	const unit = property.unit ?? "px";

	if( typeof value === "number" ) {
		return `${value}${unit}`;
	}

	if( property.type === "sides" ) {
		const sides = sidesOf( value );
		return sides ? `${sides.top}${unit} ${sides.right}${unit} ${sides.bottom}${unit} ${sides.left}${unit}` : "";
	}

	return String( value );
}

/** "background-color" as a script names it: "backgroundColor" */
function scriptName( css: string ): string {
	return css.replace( /-([a-z])/g, ( _, letter: string ) => letter.toUpperCase( ) );
}

/**
 * What a node sets for itself, as the `style` of its component: the names
 * as a script writes them, a number that is in pixels as a number (x4 adds
 * the unit), any other value as a text.
 */

export function inlineStyle( node: DNode ): Record<string, unknown> {
	const values = localCss( node );
	const style: Record<string, unknown> = {};

	for( const property of look ) {
		const value = values[property.name];

		if( value === undefined || value === null || value === "" ) {
			continue;
		}

		const text = cssValue( property, value );
		if( text ) {
			style[scriptName( property.css )] = typeof value === "number" && property.unit === undefined ? value : text;
		}
	}

	return style;
}

/** a name that can be the one of a CSS property, or of a variable ("--button-background") */
function isCssName( name: string ): boolean {
	return /^-{0,2}[A-Za-z_][-A-Za-z0-9_]*$/.test( name );
}

/**
 * The declarations a node sets for itself, by their name: those that can
 * be written, without what could end them. In the order they were given.
 */

export function inlineVars( node: DNode ): Record<string, string> {
	const result: Record<string, string> = {};

	for( const [name, value] of Object.entries( localVars( node ) ) ) {
		const text = String( value ?? "" ).replace( /[;{}]/g, "" ).trim( );

		if( isCssName( name ) && text ) {
			result[name] = text;
		}
	}

	return result;
}

/**
 * Declarations, as the `style` attribute of an element wants them:
 * "--button-background: #c00; text-transform: uppercase"
 */

export function declarationsText( vars: Record<string, string> ): string {
	return Object.entries( vars ).map( ( [name, value] ) => `${name}: ${value}` ).join( "; " );
}

// :: THE STYLESHEET ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

/**
 * The declarations a text holds, one by one, without what could end the
 * rule they are written in: the text is typed by the user.
 */

function declarationsOf( css: string ): string[] {
	return css
		.replace( /\/\*[\s\S]*?\*\//g, "" )
		.replace( /[{}]/g, "" )
		.split( /[;\n]/ )
		.map( line => line.trim( ) )
		.filter( line => /^[-A-Za-z_][-A-Za-z0-9_]*\s*:\s*\S/.test( line ) );
}

/**
 * The declarations a style holds as a text, as names and values: what its
 * editor shows, a row for each.
 */

export function pairsOf( css: string ): [string, string][] {
	return declarationsOf( css ?? "" ).map( line => {
		const at = line.indexOf( ":" );
		return [line.slice( 0, at ).trim( ), line.slice( at + 1 ).trim( )];
	} );
}

/** names and values, as the text of declarations a style holds; a row that is not filled in is left out */
export function pairsText( pairs: [string, string][] ): string {
	return pairs.filter( ( [name, value] ) => isCssName( name ) && value.trim( ) ).map( ( [name, value] ) => `${name}: ${value.trim( )};` ).join( "\n" );
}

/**
 * The stylesheet of some styles: a rule for each, in their order.
 *
 * With a `scope` (a CSS selector), the rules only apply inside what it
 * selects, and count as much as they do without it: this is how the studio
 * shows the styles on a page, and not on itself.
 */

export function cssOf( list: StyleDef[], properties: StyleProperty[], scope?: string ): string {
	const rules: string[] = [];

	for( const style of list ) {
		const lines: string[] = [];

		for( const property of properties ) {
			const value = style.values[property.name];

			if( value === undefined || value === null || value === "" ) {
				continue;
			}

			const text = cssValue( property, value );
			if( text ) {
				lines.push( `${property.css}: ${text};` );
			}
		}

		lines.push( ...declarationsOf( style.css ?? "" ).map( line => `${line};` ) );

		const selector = scope ? `:where( ${scope} ) .${style.name}` : `.${style.name}`;
		rules.push( `${selector} {\n${lines.map( line => `\t${line}\n` ).join( "" )}}\n` );
	}

	return rules.join( "\n" );
}

/** the header of the stylesheet that is written in the project */
export const STYLESHEET_HEADER = "/* GENERATED BY x4studio - DO NOT EDIT (the styles of the project are in .x4studio/styles.json) */\n\n";

/**
 * The path of a file, as it is written in an import of a file that is in
 * `folder`: both are given from the root of the project.
 */

export function relativePath( folder: string, file: string ): string {
	const from = folder.split( "/" ).filter( part => part !== "" );
	const to = file.split( "/" ).filter( part => part !== "" );

	let same = 0;
	while( same < from.length && same < to.length - 1 && from[same] === to[same] ) {
		same++;
	}

	const up = from.slice( same ).map( ( ) => ".." );
	const path = [...up, ...to.slice( same )].join( "/" );

	return up.length ? path : `./${path}`;
}
