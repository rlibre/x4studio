/**
 * @file generate.ts
 * @description the TypeScript of a page
 *
 * A page is generated as a class that builds its components, the way Qt
 * does with a form: the user does not edit it, he derives from it.
 *
 *   class LoginPage extends LoginPageUI {
 *       constructor( props: BoxProps ) {
 *           super( props );
 *           this.refs.ok.on( "click", ( ) => this.login( ) );
 *       }
 *   }
 *
 * A component the user gave a name to, in the tree, is reached by that name
 * in `refs`.
 *
 * The file ends with the document itself, as JSON in a comment: it is what
 * the studio reads to open the page again. The code is never read back.
 *
 * (no x4 here: this file runs as is under node, for the tests)
 */

import type { DNode, Document } from "./document.ts";
import { describe, getComponent } from "./components.ts";
import { iconKey, isIconRef } from "./icons.ts";
import { classesOf } from "./styles.ts";

/** opens the comment that holds the document */
const MARK = "x4studio:document";

/** says what the JSON is, and how it is laid out */
const FORMAT = "x4studio/page";
const VERSION = 1;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export interface GenerateOptions {
	/** the name of the class that is generated */
	className: string;

	/** where x4 is imported from; "x4js" by default */
	x4?: string;

	/**
	 * The stylesheet of the project, as the file of the page imports it
	 * ("../styles.ui.css"): imported when a component of the page has a
	 * style. Without it, nothing is imported.
	 */
	stylesheet?: string;

	/**
	 * The module of the icons of the project, as the file of the page
	 * imports it ("../icons"): imported when a component of the page has
	 * an icon.
	 */
	icons?: string;
}

/**
 * The names by which the components are reached in `refs`, by the id of
 * their node. A name is one when it can be written after a dot; of two
 * components that have the same name, the first one of the page has it.
 */

export function refNames( doc: Document ): Map<number, string> {
	const refs = new Map<number, string>( );
	const taken = new Set<string>( );

	// an item is not a component: there is nothing to reach
	for( const node of doc.descendants( doc.root ) ) {
		if( node.name && IDENTIFIER.test( node.name ) && !taken.has( node.name ) && describe( node )?.ctor ) {
			taken.add( node.name );
			refs.set( node.id, node.name );
		}
	}

	return refs;
}

/**
 * the entries of an object, as they are written between its braces
 */

function fields( object: Record<string, unknown> ): string[] {
	return Object.entries( object ).map( ( [key, value] ) => `${IDENTIFIER.test( key ) ? key : JSON.stringify( key )}: ${literal( value )}` );
}

/**
 * a value of the props, as it is written in TypeScript
 */

function literal( value: unknown ): string {
	if( Array.isArray( value ) ) {
		return `[${value.map( literal ).join( ", " )}]`;
	}

	// an icon of the project: what the module of the icons calls it
	if( isIconRef( value ) ) {
		return `icons.${iconKey( value.$icon )}`;
	}

	if( typeof value === "object" && value !== null ) {
		const inner = fields( value as Record<string, unknown> );
		return inner.length ? `{ ${inner.join( ", " )} }` : "{}";
	}

	return JSON.stringify( value );
}

/**
 * true when a value of the props holds an icon of the project: itself, or
 * one of the fields of an object (an item given as one)
 */

function holdsIcon( value: unknown ): boolean {
	if( isIconRef( value ) ) {
		return true;
	}

	return typeof value === "object" && value !== null && Object.values( value ).some( inner => isIconRef( inner ) );
}

/**
 * The source of the class of a page.
 */

export function generate( doc: Document, options: GenerateOptions ): string {
	const refs = refNames( doc );
	const root = doc.root;

	// the page derives from the class its description names: a VBox
	const page = describe( root );
	const used = new Set<string>( ["BoxProps", page.ctor] );
	const declared: string[] = [];

	// `new Button( { label: "OK" } )`, a box with its children under it
	const element = ( node: DNode, indent: string ): string => {
		const { ctor, props, value } = describe( node );

		// an item: the value its parent is given
		if( ctor === null ) {
			const def = getComponent( node.type );

			if( !def.container || typeof value !== "object" || value === null ) {
				return literal( value );
			}

			// An item that holds components (the page of a Tabs): an object,
			// with what it holds under the field its description names. The
			// component itself when it holds one at most, a list otherwise.
			const inner = fields( value as Record<string, unknown> );
			const inside = known( node );
			const name = def.content ?? "content";

			if( !def.single ) {
				inner.push( inside.length ? `${name}: [\n${list( inside, indent + "\t" )}${indent}]` : `${name}: []` );
			}
			else {
				inner.push( `${name}: ${inside.length ? element( inside[0], indent ) : "null"}` );
			}

			return `{ ${inner.join( ", " )} }`;
		}

		const inner = fields( props );
		const children = known( node );

		used.add( ctor );

		// before its children: the refs are declared in the order of the page
		const ref = refs.get( node.id );
		if( ref ) {
			declared.push( `${ref}: ${ctor}` );
		}

		// Under the prop its description names: `content`, or the `items` of
		// a BtnGroup. A box that holds nothing says nothing; a prop that is
		// named is given even empty, as the surface does: a component may
		// not do without its items (a Select).
		const named = getComponent( node.type )?.content;

		if( children.length ) {
			inner.push( `${named ?? "content"}: [\n${list( children, indent + "\t" )}${indent}]` );
		}
		else if( named && node.children ) {
			inner.push( `${named}: []` );
		}

		return `${ref ? `this.refs.${ref} = ` : ""}new ${ctor}( ${inner.length ? `{ ${inner.join( ", " )} }` : "{}"} )`;
	};

	// one element per line
	const list = ( nodes: DNode[], indent: string ): string => {
		return nodes.map( node => `${indent}${element( node, indent )},\n` ).join( "" );
	};

	// the children the studio knows how to build
	const known = ( node: DNode ): DNode[] => {
		return ( node.children ?? [] ).filter( child => describe( child ) );
	};

	const content = list( known( root ), "\t\t\t" );

	const body: string[] = ["\t\tsuper( props );"];

	// What the page says of itself comes after what its user gives it: its
	// classes, then its size, when it has one, with the rest of its style.
	const style: Record<string, unknown> = {};

	if( page.props.width !== undefined ) {
		style.width = page.props.width;
	}

	if( page.props.height !== undefined ) {
		style.height = page.props.height;
	}

	Object.assign( style, page.props.style );

	const setup: string[] = [];

	if( page.props.cls ) {
		setup.push( `\t\tthis.addClass( ${literal( page.props.cls )} );` );
	}

	if( Object.keys( style ).length ) {
		setup.push( `\t\tthis.setStyle( ${literal( style )} );` );
	}

	// the declarations that have no field: variables, which x4 sets one by one
	for( const [name, value] of Object.entries( page.vars ?? {} ) ) {
		setup.push( `\t\tthis.setStyleVariable( ${JSON.stringify( name )}, ${JSON.stringify( value )} );` );
	}

	if( setup.length ) {
		body.push( "", ...setup );
	}

	if( content ) {
		body.push( "", `\t\tthis.setContent( [\n${content}\t\t] );` );
	}

	const lines = [
		"/**",
		" * GENERATED BY x4studio - DO NOT EDIT",
		" * Derive from this class: what is written here is lost when the page is saved.",
		" */",
		"",
		`import { ${[...used].sort( ).join( ", " )} } from ${JSON.stringify( options.x4 ?? "x4js" )};`,
	];

	const nodes = [root, ...doc.descendants( root )];

	// the icons of the components come from the module of the icons of the project
	const withIcon = nodes.some( node => {
		const described = describe( node );
		return !!described && ( holdsIcon( described.value ) || Object.values( described.props ).some( holdsIcon ) );
	} );

	if( options.icons && withIcon ) {
		lines.push( `import icons from ${JSON.stringify( options.icons )};` );
	}

	// the classes of the styles are in the stylesheet of the project
	if( options.stylesheet && nodes.some( node => classesOf( node ).length ) ) {
		lines.push( `import ${JSON.stringify( options.stylesheet )};` );
	}

	lines.push(
		"",
		`export class ${options.className} extends ${page.ctor} {`,
	);

	if( declared.length ) {
		lines.push( `\tdeclare protected refs: { ${declared.join( ", " )} };`, "" );
	}

	lines.push(
		"\tconstructor( props: BoxProps ) {",
		...body,
		"\t}",
		"}",
		"",
		`/* ${MARK}`,
		embed( doc, options.className ),
		"*/",
		"",
	);

	return lines.join( "\n" );
}

/**
 * The document, as it is kept in the comment at the end of the file, with
 * the name of the class it is generated as. The only thing that could
 * close the comment is in a text: it is written there in another way, that
 * JSON reads the same.
 */

function embed( doc: Document, className: string ): string {
	return JSON.stringify( { format: FORMAT, version: VERSION, class: className, root: doc.root }, null, "\t" ).replaceAll( "*/", "*\\/" );
}

/** what a generated file holds of its page */
export interface PageSource {
	/** the name of the class the page is generated as */
	className: string;

	/** the document, as Document.restore wants it */
	snapshot: string;
}

/**
 * The page a generated file holds; null when the text is not a page of
 * the studio.
 */

export function extractPage( source: string ): PageSource {
	const start = source.lastIndexOf( `/* ${MARK}` );
	const end = start < 0 ? -1 : source.indexOf( "*/", start + 2 );

	if( end < 0 ) {
		return null;
	}

	try {
		const data = JSON.parse( source.slice( start + MARK.length + 3, end ) );

		if( data?.format !== FORMAT || typeof data.class !== "string" || typeof data.root !== "object" || data.root === null ) {
			return null;
		}

		return { className: data.class, snapshot: JSON.stringify( data.root ) };
	}
	catch {
		return null;
	}
}
