/**
 * @file assistant.ts
 * @description the assistant: Claude, designing the pages with the user
 *
 * The user says what he wants in a chat; the model answers by acting on
 * the page, with tools that do what the user does by hand: add
 * components, change their properties, move them, remove them, make
 * classes, open and make pages.
 *
 * The studio names no component here either: what the model is told of
 * them is made from their descriptions, as the palette is.
 *
 *   system        what the studio is, what a node is made of, the components
 *                 and the CSS properties that are described
 *   each message  what the studio shows now: the page as a tree, with the
 *                 ids of its nodes, what is selected, the classes, the icons
 *   tools         get_page, add, set, move, remove, set_class, open_page, add_page
 *
 * What a tool is given comes from a model: everything is checked against
 * the descriptions, and what is refused says why, so that the model can
 * try again.
 *
 * (no x4 here: this file runs as is under node, for the tests)
 */

import { ROOT } from "./document.ts";
import type { DNode, Document } from "./document.ts";

import { ask } from "./claude.ts";
import type { ChatBlock, ChatMessage, ChatTool } from "./claude.ts";
import { accepts, capacity, getComponent, getComponents, initialProps, isBox } from "./components.ts";
import type { ComponentDef } from "./components.ts";
import { findIcon, getIcons } from "./icons.ts";
import { CSS_PROP, STYLES_PROP, VARS_PROP, classesOf, getLook, getStyles, isStyleName, localCss, localVars, nextStyleId, sidesOf } from "./styles.ts";
import type { StyleDef } from "./styles.ts";

/** says what the JSON of a conversation is, and how it is laid out */
const FORMAT = "x4studio/chat";
const VERSION = 1;

/** the requests one message of the user may take: the model uses tools, sees their results, and goes on */
const MAX_ROUNDS = 24;

/** what is kept of a conversation: its last messages of the user, with what answers them */
const MAX_TURNS = 30;

/** a node of the studio has no place of its own: its box is not used */
const NOWHERE = { x: 0, y: 0, w: 0, h: 0 };

/** the sizes every component has (see components.ts), and those of the page */
const SIZES = ["width", "height", "flex"];
const PAGE_SIZES = ["w", "h"];

/**
 * What the assistant needs of the studio: the page that is shown, and what
 * can be done to the project.
 */

export interface AssistantHost {
	/** the document of the page that is shown; null when no page is open */
	document( ): Document;

	/** the name of the page that is shown, and those of all the pages of the project */
	pageName( ): string;
	pageNames( ): string[];

	/** what is selected on the page */
	selection( ): DNode[];

	/**
	 * Change the page that is shown. Everything that is done this way
	 * until `done` is one step for undo: the one of the answer.
	 */
	change( action: ( ) => void ): void;

	/** show nodes to the user: they are selected */
	select( nodes: DNode[] ): void;

	/** the styles of the project are these, from now on; `classes` is true when a class was added or renamed */
	setStyles( styles: StyleDef[], classes: boolean ): void;

	/** show another page; false when the project has none of that name */
	openPage( name: string ): Promise<boolean>;

	/** a new page, which is shown; false when the name cannot be one, or is taken */
	addPage( name: string ): Promise<boolean>;

	/** the answer is over */
	done( ): void;

	/** the conversation, to be kept with the project */
	keep( chat: string ): void;
}

/** a line of the conversation, as the user sees it */
export interface ChatEntry {
	/**
	 *   user      what he typed
	 *   answer    what the model says
	 *   action    what a tool did
	 *   refused   what a tool did not do, and why
	 *   error     what went wrong with the request
	 */
	kind: "user" | "answer" | "action" | "refused" | "error";
	text: string;

	/**
	 * The pictures the user sent with what he typed, as addresses a page
	 * can show (data URLs). Only while the studio is open: they are not
	 * kept with the project.
	 */
	images?: string[];
}

/** a picture sent with a message: what it is ("image/png"), and its bytes in base64 */
export interface ChatImage {
	media: string;
	data: string;
}

/** what stands for a picture in what is kept of a conversation */
const IMAGE_KEPT = "[image]";

/**
 * true for a message of the user himself: what he typed, with or without
 * pictures. Not the results of tools, which are messages of the "user" too.
 */

function isSaid( message: ChatMessage ): boolean {
	if( message.role !== "user" ) {
		return false;
	}

	return typeof message.content === "string" || !message.content.some( block => block.type === "tool_result" );
}

/** who shows the conversation */
export interface AssistantListener {
	/** a line was added */
	added( entry: ChatEntry ): void;

	/** the text of a line grew: an answer, as it is written */
	grew( entry: ChatEntry ): void;

	/** a request begins, or the last one ended */
	busy( on: boolean ): void;

	/** the conversation is another one: forgotten, or the one of another project */
	reset( ): void;
}

function isObject( value: unknown ): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray( value );
}

/** what a tool refuses: said to the model, which may try again */
function refuse( message: string ): never {
	throw new Error( message );
}


// :: WHAT THE MODEL IS TOLD ::::::::::::::::::::::::::::::::::::::::::::::::::

interface Described {
	name: string;
	type: string;
	default?: unknown;
	options?: { value: string }[];
	min?: number;
	max?: number;
	list?: boolean;
	unit?: string;
}

/** "align: left|center|right = left" */
function propertyText( property: Described ): string {
	let kind = property.type;

	if( property.type === "options" ) {
		kind = ( property.options ?? [] ).map( option => option.value ).join( "|" );
	}
	else if( property.type === "icon" ) {
		kind = "icon";
	}
	else if( property.type === "color" ) {
		kind = "color";
	}
	else if( property.type === "sides" ) {
		kind = "number or { left, top, right, bottom }";
	}
	else if( property.list ) {
		kind = "text, items separated by commas";
	}
	else if( property.type === "number" && property.unit === "" ) {
		kind = "number, no unit";
	}

	return property.default === undefined ? `${property.name}: ${kind}` : `${property.name}: ${kind} = ${JSON.stringify( property.default )}`;
}

/** one component, or one item, as the model reads it */
function componentText( def: ComponentDef, all: ComponentDef[] ): string {
	const lines: string[] = [];

	const owner = def.item ? all.find( other => other.items?.some( item => item.type === def.type ) ) : null;
	const where = def.type === ROOT ? ", the page itself: every page has one, it is not added" : owner ? `, an item: only inside ${owner.type}, no size` : "";

	lines.push( `- ${def.type} (${def.title}${where}): ${def.description ?? ""}` );

	if( def.container ) {
		const types = [...( def.items ?? [] ).map( item => item.type ), ...( def.accepts ?? [] )];
		lines.push( `  holds: ${def.items || def.accepts ? types.join( ", " ) : def.single ? "one component, as its only child" : "any component"}` );
	}

	const properties = ( def.properties ?? [] ).map( propertyText );
	if( properties.length ) {
		lines.push( `  props: ${properties.join( "; " )}` );
	}

	return lines.join( "\n" );
}

/**
 * What the model is told once: what the studio is, how a page is made, and
 * what the components and the CSS properties are, from their descriptions.
 */

export function systemPrompt( ): string {
	const all = getComponents( );

	return [
		`You are the design assistant of x4studio, a visual editor of the pages of applications made with x4js, a TypeScript UI framework. The user talks to you in a panel of the studio, beside the page he is editing. You design by acting: your tools change the page, and he sees it change.`,
		``,
		`# Pages`,
		``,
		`A page is a tree of nodes. A node is a component, or an item of a component, of one of the types listed below; the root of the tree is the page. A node is given as:`,
		``,
		`  { "id": 12, "type": "...", "name": "...", "props": { }, "classes": [ ], "css": { }, "vars": { }, "children": [ ] }`,
		``,
		`- props: the properties listed for its type, and nothing else. Every component (not an item) also has width, height and flex.`,
		`- Nothing is placed by coordinates: a container lays its children out, in their order. width and height are in pixels; without them a component has the size of what it shows. flex is its share of the room that is left in its container, along the direction of the container (flex: 1 takes what is left).`,
		`- The page has no width, height or flex, but w and h: its size in pixels, used when its "fit" is false. A page that fits takes the room the application gives it.`,
		`- classes: the names of classes of the project, a look that is shared. Use a class when several components have the same look; set_class makes or changes one.`,
		`- css: the look of this one component, over what its classes say. Only the CSS properties listed below, by their name there. A number is in pixels unless said otherwise.`,
		`- vars: other CSS declarations of this one component, mostly the variables of the theme of x4js ("--button-background": "#c00").`,
		`- name: how the code of the application reaches the component (this.refs.<name>). Give one to what the code will need: fields, buttons, lists. An identifier in camelCase, used once in the page.`,
		`- icon: the name of an icon of the project, among those the state lists. You cannot add icons: when none fits, leave it out and say so.`,
		`- A value that is the default of its property is not given.`,
		``,
		`# Working`,
		``,
		`- Each message of the user comes with the state of the studio: the page that is shown, as a tree with the ids of its nodes, what is selected, the classes, the icons, the pages. "this", "here", "the selected one" is the selection.`,
		`- Act, do not describe: when the user asks for a change, call the tools. Add a whole subtree in one "add" call, with its children nested.`,
		`- Make the smallest change that does what is asked, and keep the rest of the page as it is.`,
		`- When a request can be understood in ways that give different pages, ask one short question first.`,
		`- A tool that refuses says why: correct what you gave it and try again.`,
		`- When you are done, say what you did in a sentence or two. Answer in the language of the user. Write plain text: the panel does not render markdown.`,
		``,
		`# Components`,
		``,
		...all.map( def => componentText( def, all ) ),
		``,
		`# CSS properties (for "css", and for the classes)`,
		``,
		...getLook( ).map( property => `- ${propertyText( property )}` ),
	].join( "\n" );
}

/**
 * A node as the model reads and writes it: what the document keeps under
 * `props` is told apart (its properties, its classes by their name, what it
 * sets for itself).
 */

export function nodeOut( node: DNode ): Record<string, unknown> {
	const out: Record<string, unknown> = { id: node.id, type: node.type };

	if( node.name ) {
		out.name = node.name;
	}

	const props: Record<string, unknown> = {};

	for( const [name, value] of Object.entries( node.props ?? {} ) ) {
		if( name !== STYLES_PROP && name !== CSS_PROP && name !== VARS_PROP && value !== undefined && value !== null ) {
			props[name] = value;
		}
	}

	if( node.type === ROOT ) {
		props.w = node.box.w;
		props.h = node.box.h;
	}

	if( Object.keys( props ).length ) {
		out.props = props;
	}

	const classes = classesOf( node );
	if( classes.length ) {
		out.classes = classes;
	}

	const css = localCss( node );
	if( Object.keys( css ).length ) {
		out.css = css;
	}

	const vars = localVars( node );
	if( Object.keys( vars ).length ) {
		out.vars = vars;
	}

	if( node.hidden ) {
		out.hidden = true;
	}

	if( node.children ) {
		out.children = node.children.map( nodeOut );
	}

	return out;
}

/**
 * What the studio shows now, as the model is told with each message.
 */

export function stateText( host: AssistantHost ): string {
	const doc = host.document( );
	const pages = host.pageNames( );
	const selection = host.selection( ).map( node => node.id );

	const classes = getStyles( ).map( style => {
		const out: Record<string, unknown> = { name: style.name, css: style.values };

		if( style.css ) {
			out.raw = style.css;
		}

		return out;
	} );

	return [
		`<studio_state>`,
		`pages of the project: ${pages.length ? pages.join( ", " ) : "none"}`,
		`classes: ${JSON.stringify( classes )}`,
		`icons: ${getIcons( ).map( icon => icon.name ).join( ", " ) || "none"}`,
		doc ? `page that is shown: ${host.pageName( )}` : `no page is shown: open one, or add one`,
		doc ? `selected: ${selection.length ? selection.join( ", " ) : "nothing"}` : ``,
		doc ? `tree: ${JSON.stringify( nodeOut( doc.root ) )}` : ``,
		`</studio_state>`,
	].filter( line => line !== `` ).join( "\n" );
}


// :: THE TOOLS :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

const NODE_SCHEMA = {
	type: "object",
	properties: {
		type: { type: "string", description: "A type of component, or of item, among those that are described." },
		name: { type: "string" },
		props: { type: "object" },
		classes: { type: "array", items: { type: "string" } },
		css: { type: "object" },
		vars: { type: "object" },
		children: { type: "array", items: { type: "object" }, description: "Nodes of the same form, when the type holds some." },
	},
	required: ["type"],
};

export const TOOLS: ChatTool[] = [
	{
		name: "get_page",
		description: "The page that is shown, as it is now: its tree with the ids of its nodes. The state that comes with a message of the user is the page before your changes; use this to see it after them.",
		input_schema: { type: "object", properties: {} },
	},
	{
		name: "add",
		description: "Add nodes into a node that holds some, with everything inside them. They go at its end, or before one of its children. Returns them with their ids. All of them are added, or none: what is refused says why.",
		input_schema: {
			type: "object",
			properties: {
				parent: { type: "integer", description: "The id of the node they go into: the page, or a container." },
				before: { type: "integer", description: "The id of the child of the parent they come before. Without it: at the end." },
				nodes: { type: "array", items: NODE_SCHEMA },
			},
			required: ["parent", "nodes"],
		},
	},
	{
		name: "set",
		description: "Change a node. Only what is given changes. In props, css and vars, null takes a value away. classes replaces the classes of the node.",
		input_schema: {
			type: "object",
			properties: {
				id: { type: "integer" },
				props: { type: "object" },
				css: { type: "object" },
				vars: { type: "object" },
				classes: { type: "array", items: { type: "string" } },
				name: { type: "string", description: "An empty text takes the name away." },
				hidden: { type: "boolean", description: "A hidden component is built hidden: it takes no room." },
			},
			required: ["id"],
		},
	},
	{
		name: "move",
		description: "Move nodes into another node, or to another place among their siblings, with everything inside them.",
		input_schema: {
			type: "object",
			properties: {
				ids: { type: "array", items: { type: "integer" } },
				parent: { type: "integer" },
				before: { type: "integer", description: "The id of the child of the parent they come before. Without it: at the end." },
			},
			required: ["ids", "parent"],
		},
	},
	{
		name: "remove",
		description: "Remove nodes, with everything inside them.",
		input_schema: {
			type: "object",
			properties: { ids: { type: "array", items: { type: "integer" } } },
			required: ["ids"],
		},
	},
	{
		name: "set_class",
		description: "Make a class of the project, or change one. Every component that has the class follows. In css, null takes a value away.",
		input_schema: {
			type: "object",
			properties: {
				name: { type: "string", description: "The name of the class, as CSS names one (card, big-title). It is made when the project has none of that name." },
				css: { type: "object", description: "Values of the CSS properties that are described, by their name." },
				raw: { type: "string", description: "Other declarations, as CSS writes them: \"--button-background: #c00; text-transform: uppercase;\". Replaces those the class had." },
				new_name: { type: "string", description: "To rename the class." },
			},
			required: ["name"],
		},
	},
	{
		name: "open_page",
		description: "Show another page of the project: the tools then act on it. Returns its tree.",
		input_schema: {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		},
	},
	{
		name: "add_page",
		description: "Make a new page, empty, and show it: the tools then act on it. Returns its tree.",
		input_schema: {
			type: "object",
			properties: { name: { type: "string", description: "As a class is named: LoginPage." } },
			required: ["name"],
		},
	},
];

/** what a tool did: for the model, and for the user (none for a tool that only reads) */
export interface ToolOutcome {
	result: string;
	summary: string;
}

/**
 * A value for a property of a kind, checked. Returns it as it is kept.
 */

function checkValue( name: string, kind: string, value: unknown, options?: { value: string }[] ): unknown {
	switch( kind ) {
		case "number": {
			return typeof value === "number" && Number.isFinite( value ) ? value : refuse( `"${name}" takes a number` );
		}

		case "boolean": {
			return typeof value === "boolean" ? value : refuse( `"${name}" takes true or false` );
		}

		case "options": {
			const values = ( options ?? [] ).map( option => option.value );
			return values.includes( value as string ) ? value : refuse( `"${name}" is one of: ${values.join( ", " )}` );
		}

		case "icon": {
			return findIcon( value ) ? value : refuse( `"${name}" takes the name of an icon of the project: ${getIcons( ).map( icon => icon.name ).join( ", " ) || "it has none"}` );
		}

		case "sides": {
			if( typeof value === "number" && Number.isFinite( value ) ) {
				return value;
			}

			return isObject( value ) ? sidesOf( value ) : refuse( `"${name}" takes a number, or { left, top, right, bottom }` );
		}

		default: {
			if( typeof value === "number" ) {
				return String( value );
			}

			return typeof value === "string" ? value : refuse( `"${name}" takes a text` );
		}
	}
}

/**
 * The props a model gives for a node of a type, checked against its
 * description. null takes a value away: it is undefined in what is returned.
 */

function checkProps( type: string, given: unknown ): Record<string, unknown> {
	if( given === undefined || given === null ) {
		return {};
	}

	if( !isObject( given ) ) {
		refuse( `props is an object` );
	}

	const def = getComponent( type );
	const own = def.properties ?? [];
	const sizes = def.item ? [] : type === ROOT ? PAGE_SIZES : SIZES;
	const props: Record<string, unknown> = {};

	for( const [name, value] of Object.entries( given ) ) {
		const property = own.find( p => p.name === name );

		if( !property && !sizes.includes( name ) ) {
			refuse( `"${name}" is not a property of ${type}. It has: ${[...own.map( p => p.name ), ...sizes].join( ", " ) || "none"}` );
		}

		if( value === null ) {
			props[name] = undefined;
		}
		else if( property ) {
			props[name] = checkValue( name, property.type, value, property.options );
		}
		else {
			props[name] = typeof value === "number" && Number.isFinite( value ) && value >= 0 ? value : refuse( `"${name}" takes a number, 0 or more` );
		}
	}

	return props;
}

/** values of CSS properties, checked against those that are described */
function checkCss( given: unknown ): Record<string, unknown> {
	if( given === undefined || given === null ) {
		return {};
	}

	if( !isObject( given ) ) {
		refuse( `css is an object` );
	}

	const look = getLook( );
	const css: Record<string, unknown> = {};

	for( const [name, value] of Object.entries( given ) ) {
		const property = look.find( p => p.name === name );

		if( !property ) {
			refuse( `"${name}" is not a CSS property that is described. They are: ${look.map( p => p.name ).join( ", " )}. Anything else goes in vars, or in the raw declarations of a class.` );
		}

		css[name] = value === null ? undefined : checkValue( name, property.type, value, property.options );
	}

	return css;
}

/** declarations: a text for each */
function checkVars( given: unknown ): Record<string, unknown> {
	if( given === undefined || given === null ) {
		return {};
	}

	if( !isObject( given ) ) {
		refuse( `vars is an object` );
	}

	const vars: Record<string, unknown> = {};

	for( const [name, value] of Object.entries( given ) ) {
		vars[name] = value === null ? undefined : typeof value === "string" || typeof value === "number" ? String( value ) : refuse( `"${name}" takes a text` );
	}

	return vars;
}

/** the ids of classes, from their names */
function classIds( given: unknown ): number[] {
	if( !Array.isArray( given ) ) {
		refuse( `classes is a list of names` );
	}

	const styles = getStyles( );

	return ( given as unknown[] ).map( name => {
		const style = styles.find( s => s.name === name );
		return style ? style.id : refuse( `no class is called "${name}". The classes are: ${styles.map( s => s.name ).join( ", " ) || "none"}. set_class makes one.` );
	} );
}

/** `held` with `changes` over it, without what was taken away; undefined when nothing is left */
function merged( held: Record<string, unknown>, changes: Record<string, unknown> ): Record<string, unknown> {
	const all: Record<string, unknown> = { ...held, ...changes };

	for( const name of Object.keys( all ) ) {
		if( all[name] === undefined ) {
			delete all[name];
		}
	}

	return Object.keys( all ).length ? all : undefined;
}

/**
 * A node a model gives, checked with everything inside it, as a node that
 * is not in the document yet (its ids are not used: see Document.addCopies).
 */

function planned( spec: unknown, parentType: string ): DNode {
	if( !isObject( spec ) || typeof spec.type !== "string" ) {
		refuse( `a node is { type, ... }` );
	}

	const type = spec.type as string;

	if( !getComponent( type ) || type === ROOT ) {
		refuse( `"${type}" is not a type that can be added. The types are: ${getComponents( ).filter( def => def.type !== ROOT ).map( def => def.type ).join( ", " )}` );
	}

	if( !accepts( parentType, type ) ) {
		refuse( `a ${type} cannot go into a ${parentType}` );
	}

	const props: Record<string, unknown> = { ...initialProps( type ), ...checkProps( type, spec.props ) };

	if( spec.classes !== undefined ) {
		const ids = classIds( spec.classes );
		props[STYLES_PROP] = ids.length ? ids : undefined;
	}

	props[CSS_PROP] = merged( {}, checkCss( spec.css ) );
	props[VARS_PROP] = merged( {}, checkVars( spec.vars ) );

	const node: DNode = { id: 0, type, box: { ...NOWHERE } };

	const kept = merged( {}, props );
	if( kept ) {
		node.props = kept;
	}

	if( typeof spec.name === "string" && spec.name.trim( ) ) {
		node.name = spec.name.trim( );
	}

	if( isBox( type ) ) {
		node.children = [];
	}

	if( spec.children !== undefined ) {
		if( !Array.isArray( spec.children ) ) {
			refuse( `children is a list of nodes` );
		}

		if( ( spec.children as unknown[] ).length > capacity( type ) ) {
			refuse( `a ${type} holds one node at most: put the others in a box, and the box in it` );
		}

		for( const child of spec.children as unknown[] ) {
			const inner = planned( child, type );
			node.children.push( inner );
		}
	}

	return node;
}

/** a node, with what is inside it: how many they are */
function count( nodes: DNode[] ): number {
	return nodes.reduce( ( sum, node ) => sum + 1 + count( node.children ?? [] ), 0 );
}

/** how a node is told to the user: the name he gave it, or the title of its type */
function labelOf( node: DNode ): string {
	if( node.type === ROOT ) {
		return "the page";
	}

	return node.name ? node.name : getComponent( node.type )?.title ?? node.type;
}

function plural( n: number, what: string ): string {
	return n === 1 ? `1 ${what}` : `${n} ${what}s`;
}

/**
 * Do what a tool is asked. Throws when it is refused: the message says
 * why, for the model.
 */

export async function runTool( host: AssistantHost, name: string, given: unknown ): Promise<ToolOutcome> {
	const input: Record<string, unknown> = isObject( given ) ? given : {};

	// the pages first: they need no page to be shown
	if( name === "open_page" || name === "add_page" ) {
		const page = typeof input.name === "string" ? input.name.trim( ) : "";

		if( name === "open_page" ) {
			if( !await host.openPage( page ) ) {
				refuse( `the project has no page called "${page}". Its pages are: ${host.pageNames( ).join( ", " ) || "none"}` );
			}

			return { result: JSON.stringify( nodeOut( host.document( ).root ) ), summary: `Page "${page}" opened` };
		}

		if( !await host.addPage( page ) ) {
			refuse( `"${page}" cannot be a new page: a page is named as a class is (letters, digits and _, a letter first), and no other page may have that name` );
		}

		return { result: JSON.stringify( nodeOut( host.document( ).root ) ), summary: `Page "${page}" added` };
	}

	if( name === "set_class" ) {
		return setClass( host, input );
	}

	const doc = host.document( );
	if( !doc ) {
		refuse( `no page is shown: open one, or add one` );
	}

	const nodeOf = ( id: unknown ): DNode => {
		const node = typeof id === "number" ? doc.get( id ) : undefined;
		return node ?? refuse( `no node of the page has the id ${JSON.stringify( id )}` );
	};

	const nodesOf = ( ids: unknown ): DNode[] => {
		return Array.isArray( ids ) && ids.length ? ids.map( nodeOf ) : refuse( `ids is a list of ids, with one at least` );
	};

	switch( name ) {
		case "get_page": {
			return { result: JSON.stringify( nodeOut( doc.root ) ), summary: null };
		}

		case "add": {
			const parent = nodeOf( input.parent );
			const before = input.before === undefined || input.before === null ? null : nodeOf( input.before );

			if( before && doc.parentOf( before ) !== parent ) {
				refuse( `the node ${before.id} is not a child of the node ${parent.id}` );
			}

			if( !Array.isArray( input.nodes ) || input.nodes.length === 0 ) {
				refuse( `nodes is a list of nodes, with one at least` );
			}

			if( ( parent.children ?? [] ).length + input.nodes.length > capacity( parent.type ) ) {
				refuse( `a ${parent.type} holds one node at most${parent.children?.length ? `, and the node ${parent.id} has one already (${parent.children[0].id})` : ""}: put them in a box` );
			}

			// all of them are checked before one is added
			const nodes = ( input.nodes as unknown[] ).map( spec => planned( spec, parent.type ) );
			let added: DNode[] = [];

			host.change( ( ) => {
				added = doc.addCopies( nodes, parent );

				if( before ) {
					doc.move( added, parent, before );
				}
			} );

			host.select( added );

			return { result: JSON.stringify( added.map( nodeOut ) ), summary: `Added ${plural( count( added ), "component" )} in ${labelOf( parent )}` };
		}

		case "set": {
			const node = nodeOf( input.id );
			const values: Record<string, unknown> = checkProps( node.type, input.props );

			if( input.css !== undefined ) {
				values[CSS_PROP] = merged( localCss( node ), checkCss( input.css ) );
			}

			if( input.vars !== undefined ) {
				values[VARS_PROP] = merged( localVars( node ), checkVars( input.vars ) );
			}

			if( input.classes !== undefined ) {
				const ids = classIds( input.classes );
				values[STYLES_PROP] = ids.length ? ids : undefined;
			}

			if( input.name !== undefined && typeof input.name !== "string" ) {
				refuse( `name is a text` );
			}

			if( input.hidden !== undefined && typeof input.hidden !== "boolean" ) {
				refuse( `hidden is true or false` );
			}

			host.change( ( ) => {
				if( Object.keys( values ).length ) {
					doc.setProps( [node], values );
				}

				if( typeof input.name === "string" ) {
					doc.rename( node, input.name );
				}

				if( typeof input.hidden === "boolean" ) {
					doc.setHidden( [node], input.hidden );
				}
			} );

			host.select( node.type === ROOT ? [] : [node] );

			return { result: JSON.stringify( nodeOut( node ) ), summary: `Changed ${labelOf( node )}` };
		}

		case "move": {
			const nodes = nodesOf( input.ids );
			const parent = nodeOf( input.parent );
			const before = input.before === undefined || input.before === null ? null : nodeOf( input.before );

			if( before && doc.parentOf( before ) !== parent ) {
				refuse( `the node ${before.id} is not a child of the node ${parent.id}` );
			}

			for( const node of nodes ) {
				if( !accepts( parent.type, node.type ) ) {
					refuse( `a ${node.type} cannot go into a ${parent.type}` );
				}
			}

			if( ( parent.children ?? [] ).filter( child => !nodes.includes( child ) ).length + nodes.length > capacity( parent.type ) ) {
				refuse( `a ${parent.type} holds one node at most` );
			}

			let moved = false;
			host.change( ( ) => { moved = doc.move( nodes, parent, before ); } );

			if( !moved ) {
				refuse( `they cannot be moved there: a node does not go into itself, and the page does not move` );
			}

			host.select( nodes );

			return { result: "moved", summary: `Moved ${plural( nodes.length, "component" )} into ${labelOf( parent )}` };
		}

		case "remove": {
			const nodes = nodesOf( input.ids );

			if( nodes.includes( doc.root ) ) {
				refuse( `the page itself is not removed` );
			}

			const removed = count( doc.topLevel( nodes ) );

			host.change( ( ) => doc.remove( nodes ) );
			host.select( [] );

			return { result: "removed", summary: `Removed ${plural( removed, "component" )}` };
		}
	}

	return refuse( `no tool is called "${name}"` );
}

/**
 * Make a class, or change one: its values, its other declarations, its name.
 */

function setClass( host: AssistantHost, input: Record<string, unknown> ): ToolOutcome {
	const styles = getStyles( );
	const name = typeof input.name === "string" ? input.name.trim( ) : "";

	const nameIt = ( text: string ) => `"${text}" cannot be the name of a class: letters, digits, - and _, not a digit first, and not a name that starts with x4`;

	const held = styles.find( style => style.name === name );

	if( !held && !isStyleName( name ) ) {
		refuse( nameIt( name ) );
	}

	const style: StyleDef = held ? { ...held, values: { ...held.values } } : { id: nextStyleId( styles ), name, values: {} };

	style.values = merged( style.values, checkCss( input.css ) ) ?? {};

	if( input.raw !== undefined ) {
		if( typeof input.raw !== "string" ) {
			refuse( `raw is a text` );
		}

		if( input.raw.trim( ) ) {
			style.css = input.raw.trim( );
		}
		else {
			delete style.css;
		}
	}

	let renamed = false;

	if( input.new_name !== undefined ) {
		const other = typeof input.new_name === "string" ? input.new_name.trim( ) : "";

		if( !isStyleName( other ) ) {
			refuse( nameIt( other ) );
		}

		if( styles.some( s => s.name === other && s !== held ) ) {
			refuse( `a class is already called "${other}"` );
		}

		renamed = other !== style.name;
		style.name = other;
	}

	host.setStyles( held ? styles.map( s => s === held ? style : s ) : [...styles, style], !held || renamed );

	return {
		result: JSON.stringify( { name: style.name, css: style.values, raw: style.css } ),
		summary: held ? `Changed the class "${style.name}"` : `Added the class "${style.name}"`,
	};
}


// :: THE CONVERSATION ::::::::::::::::::::::::::::::::::::::::::::::::::::::::

/** what a request needs, and that is the user's: his key, the model he chose */
export interface AssistantSettings {
	key: string;
	model: string;
}

/**
 * A conversation: what was said, as the API wants it given back, and as
 * the user sees it. One at a time: a message is sent when the answer to
 * the one before is over.
 */

export class Assistant {

	/** the conversation as the user sees it */
	readonly log: ChatEntry[] = [];

	listener: AssistantListener = null;

	private host: AssistantHost;
	private messages: ChatMessage[] = [];		// as the API wants them
	private abort: AbortController = null;		// of the request in progress

	constructor( host: AssistantHost ) {
		this.host = host;
	}

	isBusy( ): boolean {
		return this.abort !== null;
	}

	/** give up the request in progress: what was done stays done */
	stop( ): void {
		if( this.abort ) {
			this.abort.abort( );
		}
	}

	/** forget everything that was said; not while an answer is being written */
	clear( ): void {
		if( this.abort ) {
			return;
		}

		this.messages = [];
		this.log.length = 0;
		this.host.keep( this.toText( ) );

		if( this.listener ) {
			this.listener.reset( );
		}
	}

	private add( kind: ChatEntry["kind"], text: string, images?: string[] ): ChatEntry {
		const entry: ChatEntry = { kind, text };

		if( images && images.length ) {
			entry.images = images;
		}

		this.log.push( entry );

		if( this.listener ) {
			this.listener.added( entry );
		}

		return entry;
	}

	/**
	 * What the user says. The model answers, uses tools, sees what they
	 * did and goes on, until it has nothing more to do. Never throws: what
	 * goes wrong is a line of the conversation.
	 *
	 * `images` are pictures that go with the message (a mockup, a
	 * screenshot): the model sees them. As the documentation of the API
	 * gives it (read on 2026-10-12): JPEG, PNG, GIF or WebP, as a block
	 * { type: "image", source: { type: "base64", media_type, data } }.
	 */

	async send( text: string, settings: AssistantSettings, images: ChatImage[] = [] ): Promise<void> {
		if( this.abort || ( !text.trim( ) && images.length === 0 ) ) {
			return;
		}

		const abort = this.abort = new AbortController( );
		const before = this.messages.length;

		this.add( "user", text, images.map( image => `data:${image.media};base64,${image.data}` ) );

		// what he says: his pictures first, then his words
		const said: ChatBlock[] = [
			...images.map( image => ( { type: "image", source: { type: "base64", media_type: image.media, data: image.data } } ) ),
			{ type: "text", text: text.trim( ) ? text : "(see the picture)" },
		];

		this.messages.push( { role: "user", content: images.length ? said : text } );

		if( this.listener ) {
			this.listener.busy( true );
		}

		// what the studio shows when the user speaks: told once, with his message
		const state = stateText( this.host );
		const system = systemPrompt( );

		// the model said its last word: it asks for no tool anymore
		let finished = false;

		try {
			for( let round = 0; round < MAX_ROUNDS; round++ ) {
				// the answer, as it is written
				let answer: ChatEntry = null;

				const { content, stop } = await ask( {
					key: settings.key,
					model: settings.model,
					system,
					tools: TOOLS,
					signal: abort.signal,
					messages: this.messages.map( ( message, i ) => i === before ? { role: message.role, content: [{ type: "text", text: state }, ...said] } : message ),
					text: piece => {
						if( !answer ) {
							answer = this.add( "answer", "" );
						}

						answer.text += piece;
						if( this.listener ) {
							this.listener.grew( answer );
						}
					},
				} );

				// an answer that was cut may end in the middle of the use of a tool
				if( stop === "max_tokens" ) {
					throw new Error( "The answer was cut: it was too long. Ask for less at a time." );
				}

				if( content.length === 0 ) {
					throw new Error( "The model answered nothing." );
				}

				this.messages.push( { role: "assistant", content } );

				if( stop !== "tool_use" ) {
					finished = true;
					break;
				}

				// what it asks is done, and it is told what came of it
				const results: ChatBlock[] = [];

				for( const block of content ) {
					if( block.type !== "tool_use" ) {
						continue;
					}

					try {
						const outcome = await runTool( this.host, block.name as string, block.input );

						if( outcome.summary ) {
							this.add( "action", outcome.summary );
						}

						results.push( { type: "tool_result", tool_use_id: block.id, content: outcome.result } );
					}
					catch( error ) {
						const message = error instanceof Error ? error.message : String( error );

						this.add( "refused", message );
						results.push( { type: "tool_result", tool_use_id: block.id, content: message, is_error: true } );
					}
				}

				this.messages.push( { role: "user", content: results } );
			}

			if( !finished ) {
				throw new Error( "Stopped: too many steps for one request." );
			}
		}
		catch( error ) {
			// What was said in this exchange is forgotten: it stopped where
			// the API cannot take it up again (a tool without its result).
			// What was done to the page stays, and is in the next state.
			this.messages.length = before;

			if( abort.signal.aborted ) {
				this.add( "error", "Stopped." );
			}
			else {
				this.add( "error", error instanceof Error ? error.message : String( error ) );
			}
		}

		this.abort = null;
		this.forgetThinking( );
		this.trim( );

		this.host.done( );
		this.host.keep( this.toText( ) );

		if( this.listener ) {
			this.listener.busy( false );
		}
	}

	/**
	 * Take away what the model thought, once its answer is over.
	 *
	 * A block of thinking is signed for the conversation it was written
	 * in: it is only taken back when everything before it (the system, the
	 * tools, the messages) is what it was. Here it is not: the state of
	 * the studio goes with the last message of the user only, and the old
	 * messages are dropped. The API then refuses the request ("Invalid
	 * signature in thinking block. The block is bound to a different
	 * conversation"). While an answer is being made, with its tools,
	 * nothing before it changes and the blocks are given back, as they
	 * have to be; after it, they may be left out ("Allowed: outside tool
	 * use, omit prior turns' thinking", documentation of the API, read on
	 * 2026-10-12).
	 */

	private forgetThinking( ): void {
		for( const message of this.messages ) {
			if( message.role !== "assistant" || typeof message.content === "string" ) {
				continue;
			}

			const kept = message.content.filter( block => block.type !== "thinking" && block.type !== "redacted_thinking" );

			// a message cannot be empty
			message.content = kept.length ? kept : [{ type: "text", text: "..." }];
		}
	}

	/**
	 * Keep the end of the conversation only. It is cut where the user
	 * speaks: a tool is never without its result.
	 */

	private trim( ): void {
		const starts: number[] = [];

		this.messages.forEach( ( message, i ) => {
			if( isSaid( message ) ) {
				starts.push( i );
			}
		} );

		if( starts.length > MAX_TURNS ) {
			this.messages.splice( 0, starts[starts.length - MAX_TURNS] );
		}
	}

	/** the conversation, as it is kept with the project */
	toText( ): string {
		// Without the pictures: they are heavy, and a project is not where
		// they belong. A word stands where each was, for the model too when
		// the conversation is taken up again.
		const messages = this.messages.map( message => typeof message.content === "string" ? message : {
			role: message.role,
			content: message.content.map( block => block.type === "image" ? { type: "text", text: IMAGE_KEPT } : block ),
		} );

		const log = this.log.map( entry => entry.images ? { kind: entry.kind, text: entry.text ? `${entry.text} ${IMAGE_KEPT}` : IMAGE_KEPT } : entry );

		return `${JSON.stringify( { format: FORMAT, version: VERSION, messages, log }, null, "\t" )}\n`;
	}

	/**
	 * Take up a conversation that was kept; with null, or a text that is
	 * not one, there is none.
	 */

	load( text: string ): void {
		this.stop( );
		this.messages = [];
		this.log.length = 0;

		try {
			const data = JSON.parse( text ?? "null" );

			if( isObject( data ) && data.format === FORMAT && Array.isArray( data.messages ) && Array.isArray( data.log ) ) {
				this.messages = data.messages as ChatMessage[];

				// one that was kept before they were taken away
				this.forgetThinking( );
				this.log.push( ...( data.log as ChatEntry[] ).filter( entry => isObject( entry ) && typeof entry.kind === "string" && typeof entry.text === "string" ) );
			}
		}
		catch {
			// not a conversation: the project starts a new one
		}

		if( this.listener ) {
			this.listener.reset( );
		}
	}
}
