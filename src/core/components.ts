/**
 * @file components.ts
 * @description the x4 components the studio knows
 *
 * The studio does not know what a button or a box is: it is told, by
 * descriptions that are data (JSON). Those it comes with are in
 * `src/components.json`; a project adds its own, or says again those of
 * the studio, in its `.x4studio/components.json`. Handling one more
 * component is a description to write, not code to change.
 *
 *   {
 *     "type": "button", "title": "Button", "class": "Button",
 *     "description": "A button the user clicks.",
 *     "icon": "<svg ...>...</svg>",
 *     "properties": [ { "name": "label", "title": "Label", "type": "string", "initial": "Button" } ]
 *   }
 *
 * A node of the document stands for one x4 component. From its description
 * comes what that component is, as plain data: the name of its class and
 * the props it is built with (describe). The surface builds the component
 * from it, the generator writes the code that builds it: what is seen and
 * what is generated cannot differ.
 *
 * (no x4 here: this file runs as is under node, for the tests)
 */

import { ROOT } from "./document.ts";
import type { DNode } from "./document.ts";
import { isBoxName } from "./box.ts";
import { getProp, registerObjectType, unregisterObjectType } from "./registry.ts";
import type { PropertyDef, PropertyType } from "./registry.ts";

import { findIcon, iconRef } from "./icons.ts";
import { RESERVED_PROPS, classesOf, declarationsText, inlineStyle, inlineVars } from "./styles.ts";

/** says what the JSON is, and how it is laid out */
const FORMAT = "x4studio/components";

/**
 * A property of a component, as its description gives it: what the
 * editors need to edit it (see PropertyDef), and where its value goes.
 *
 * `default` is what x4 does when it is told nothing: a value that is the
 * default is not given to the component, nor written in the generated code.
 */

export interface ComponentProperty extends Omit<PropertyDef, "type"> {
	/**
	 * The kind of its value: those the editors know, and "icon", the name
	 * of an icon of the project. The component is not given that name: see
	 * core/icons.ts.
	 */
	type: PropertyType | "icon";

	/** the prop of the x4 component the value is given as; the name of the property when missing */
	prop?: string;

	/** the value is not a prop, but this property of the `style` of the component (as CSS names it in a script: "alignItems") */
	style?: string;

	/** for a property of type "boolean": the value is not a prop, but this class, which the component has when it is true ("x4fit", "outline") */
	cls?: string;

	/** the value a new component gets */
	initial?: unknown;

	/**
	 * The value is a list: typed as one text, with commas between its
	 * items ("a, b"), and given to the component as an array. For a
	 * property of type "string", whose items are plain texts; items that
	 * have properties of their own are nodes (see ComponentDef.items).
	 */
	list?: boolean;
}

/**
 * An x4 component, as its description gives it.
 *
 * A description may also be the one of an item: what a component is given
 * in a list, which is not a component itself. The texts of a BtnGroup
 * ("ok", "cancel.outline"), the items of a Listbox ({ id, text }). An item
 * is a node as a component is, a child of the one it is given to; it has no
 * class, and is written as a value.
 *
 * An item may hold a component: the page of a Tabs is { name, title,
 * content }, where `content` is what the page shows. Such an item is a
 * node that stands for nothing on the page by itself (a ghost): it carries
 * the properties of the page, and what it holds is a real component.
 */

export interface ComponentDef {
	type: string;				// the type of its nodes
	title: string;
	class?: string;				// the name of its x4 class; an item has none

	/** what it is, in a sentence: shown as a tooltip in the palette */
	description?: string;

	/** its icon in the palette and in the tree: the source of an svg */
	icon?: string;

	/** it holds other nodes: components, or items. An item given as an object may hold components too. */
	container?: boolean;

	/**
	 * It holds one node at most: what it is given is that node itself, not
	 * a list (the `content` of the page of a Tabs is one component).
	 */
	single?: boolean;

	/**
	 * For a component that shows one of its items at a time (the pages of a
	 * Tabs): how the studio makes it show the one that is selected, or that
	 * holds what is selected. `method` is a method of the component, called
	 * with the value of the property `by` of the item: `selectTab( name )`.
	 */
	reveal?: { method: string, by: string };

	/** the prop its children are given as: "content" when missing, "items" for a BtnGroup or a Listbox */
	content?: string;

	/**
	 * The items it is given, described here and nowhere else: an item
	 * cannot be used by itself, it only exists in what it is an item of.
	 * It is not in the palette; it is offered when its owner is selected.
	 */
	items?: ComponentDef[];

	/**
	 * The types of the components its children may be, beside its own
	 * items. When missing: any component for a box, none for a component
	 * that has items of its own.
	 */
	accepts?: string[];

	/**
	 * For a component that builds itself what stands for its children (a
	 * BtnGroup makes a button of the text "ok"): a CSS selector, from the
	 * component, that finds one element per child, in their order. It is
	 * how the studio knows where an item is on the page.
	 */
	parts?: string;

	/**
	 * Not a component, an item. It is given as the value of its first
	 * property ("value": the text of a BtnGroup), or as an object made of
	 * its properties ("object": the item of a Listbox).
	 */
	item?: "value" | "object";

	/**
	 * For an item given as a value: the value is made of all its
	 * properties, with this text between them, and not of the first one
	 * only. A text or a choice gives its value, a boolean that is true
	 * gives its name, and what is empty gives nothing: "ok.outline.default".
	 */
	join?: string;

	/**
	 * Props it is always built with. A property may be one of them: its
	 * value then takes the place of the one given here. It is how a prop
	 * x4 cannot do without has a value when the user gives none: the `max`
	 * of a Progress is here, and is the `default` of its property.
	 */
	fixed?: Record<string, unknown>;

	/** the first values of a new one, for the properties every component has: { "height": 120 } */
	initial?: Record<string, unknown>;

	/**
	 * What a new one holds at first, from the palette: nodes that are made
	 * with it. A new Tabs has one page, and a new page a box: something can
	 * be put in at once. Each is { "type", "props"? }, and holds what its
	 * own description says.
	 */
	holds?: { type: string, props?: Record<string, unknown> }[];

	properties?: ComponentProperty[];
}

/** an x4 component, as data: `new ctor( props )` */
export interface X4Element {
	/** the name of the class; null for an item, which is its `value` */
	ctor: string;
	props: Record<string, unknown>;

	/** an item: what its parent is given for it */
	value?: unknown;

	/** the page: the variables it sets for itself, by their name */
	vars?: Record<string, string>;
}

/**
 * The size of a component: on each axis, the one of what it shows (no
 * value), or a fixed one, in pixels. `flex` is its share of the room that
 * is left in its box, along the direction of the box. Every component has
 * these: a description does not give them.
 */

const SIZE: PropertyDef[] = [
	{ name: "width", title: "Width", type: "number", min: 0, optional: true },
	{ name: "height", title: "Height", type: "number", min: 0, optional: true },
	{ name: "flex", title: "Flex", type: "number", min: 0, optional: true },
];

/**
 * The size of the page, which is the one of its box. It has it when it
 * does not take the room it is given: the description of the page has a
 * property for that, `fit`.
 */

const PAGE_FIT = "fit";

const PAGE_SIZE: PropertyDef[] = [
	{ name: "w", title: "Width", type: "number", min: 1 },
	{ name: "h", title: "Height", type: "number", min: 1 },
];

const PROPERTY_TYPES = ["string", "number", "boolean", "color", "options", "icon"];

/** the components that are known now, by their type */
const components = new Map<string, ComponentDef>( );

/**
 * A property, as the registry of the editors wants it. They do not know
 * what an icon is: for them it is a text, its name. The inspector of the
 * studio knows better (propertyKind).
 */

function registered( property: ComponentProperty ): PropertyDef {
	return { ...property, type: property.type === "icon" ? "string" : property.type };
}

function isObject( value: unknown ): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray( value );
}

/** a property a description may give: not one every component has, nor a name of the box of a node, nor where a node keeps its styles */
function isProperty( value: unknown ): value is ComponentProperty {
	return isObject( value )
		&& typeof value.name === "string" && value.name !== "" && !RESERVED_PROPS.includes( value.name ) && !isBoxName( value.name ) && !SIZE.some( size => size.name === value.name )
		&& typeof value.title === "string"
		&& PROPERTY_TYPES.includes( value.type as string )
		&& ( value.type !== "options" || Array.isArray( value.options ) )
		&& ( value.cls === undefined || ( typeof value.cls === "string" && value.type === "boolean" ) );
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * @param item true for the description of an item, which is inside the one of its owner
 */

function isComponent( value: unknown, item = false ): value is ComponentDef {
	if( !isObject( value ) || typeof value.type !== "string" || value.type === "" || typeof value.title !== "string" ) {
		return false;
	}

	// an item has a kind and no class, a component a class and no kind
	if( item ? ( value.item !== "value" && value.item !== "object" ) || value.class !== undefined : value.item !== undefined || typeof value.class !== "string" || !IDENTIFIER.test( value.class ) ) {
		return false;
	}

	// An item has no items of its own. It may hold components, when it is
	// given as an object: they are one of its fields.
	if( item ? value.items !== undefined || ( value.container !== undefined && ( value.container !== true || value.item !== "object" ) ) : value.items !== undefined && !( Array.isArray( value.items ) && value.items.every( def => isComponent( def, true ) ) ) ) {
		return false;
	}

	const reveal = value.reveal;
	if( reveal !== undefined && !( isObject( reveal ) && typeof reveal.method === "string" && IDENTIFIER.test( reveal.method ) && typeof reveal.by === "string" && reveal.by !== "" ) ) {
		return false;
	}

	if( value.single !== undefined && typeof value.single !== "boolean" ) {
		return false;
	}

	if( value.holds !== undefined && !( Array.isArray( value.holds ) && value.holds.every( node => isObject( node ) && typeof node.type === "string" && ( node.props === undefined || isObject( node.props ) ) ) ) ) {
		return false;
	}

	return ( value.content === undefined || ( typeof value.content === "string" && IDENTIFIER.test( value.content ) ) )
		&& ( value.accepts === undefined || ( Array.isArray( value.accepts ) && value.accepts.every( type => typeof type === "string" ) ) )
		&& ( value.parts === undefined || typeof value.parts === "string" )
		&& ( value.join === undefined || typeof value.join === "string" )
		&& ( value.fixed === undefined || isObject( value.fixed ) )
		&& ( value.initial === undefined || isObject( value.initial ) )
		&& ( value.properties === undefined || ( Array.isArray( value.properties ) && value.properties.every( isProperty ) ) );
}

/**
 * The descriptions a JSON holds, once it is parsed. Throws when it is not
 * a file of descriptions, or when one of them cannot be understood: its
 * message says which.
 */

export function readComponents( data: unknown ): ComponentDef[] {
	if( !isObject( data ) || data.format !== FORMAT || !Array.isArray( data.components ) ) {
		throw new Error( "components: not a description of components" );
	}

	data.components.forEach( ( def, i ) => {
		if( !isComponent( def ) ) {
			throw new Error( `components: the description #${i + 1} (${isObject( def ) && typeof def.type === "string" ? def.type : "no type"}) cannot be understood` );
		}
	} );

	return data.components;
}

/**
 * Tell the editors what the components are: these, and no other. Of two
 * descriptions of the same type, the last one counts: a project says again
 * a component of the studio by describing it after it.
 *
 * To call before anything is built, then each time the descriptions change
 * (another project is opened). A palette that is already there is brought
 * up to date by who calls (CreateTools.update).
 */

export function registerComponents( defs: ComponentDef[] ): void {
	for( const type of components.keys( ) ) {
		unregisterObjectType( type );
	}

	components.clear( );

	// a component, then its items: they are types of nodes too
	for( const def of defs ) {
		components.set( def.type, def );
	}

	for( const def of defs ) {
		if( components.get( def.type ) === def ) {
			def.items?.forEach( item => components.set( item.type, item ) );
		}
	}

	for( const def of components.values( ) ) {
		const page = def.type === ROOT;
		const own = ( def.properties ?? [] ).map( registered );

		registerObjectType( {
			type: def.type,
			title: def.title,
			icon: def.icon,
			description: def.description,

			// in the palette: the components. An item is offered with its owner (itemsOf).
			creatable: !page && !def.item,

			// an item is not a component: it has no size
			properties: def.item ? own : [...own, ...( page ? PAGE_SIZE : SIZE )],
		} );
	}
}

/**
 * The kind of a property of a type, as its description gives it: "icon"
 * where the editors only see a text. undefined for a property the
 * description does not give (the size every component has).
 */

export function propertyKind( type: string, name: string ): ComponentProperty["type"] {
	const def = components.get( type );
	const property = def && def.properties ? def.properties.find( p => p.name === name ) : null;

	return property ? property.type : undefined;
}

/**
 * the description of a type; undefined for a type the studio does not know
 */

export function getComponent( type: string ): ComponentDef {
	return components.get( type );
}

/**
 * every description that is known now: the components, and their items
 */

export function getComponents( ): ComponentDef[] {
	return [...components.values( )];
}

/**
 * true for the type of a component that holds others
 */

export function isBox( type: string ): boolean {
	return !!components.get( type )?.container;
}

/**
 * The items a component is given, as it describes them: what can be added
 * to it beside components. None for most.
 */

export function itemsOf( type: string ): ComponentDef[] {
	return components.get( type )?.items ?? [];
}

/**
 * true when a node of a type may be a child of one of another type: the
 * parent holds nodes, and takes this one. A box takes any component, and
 * no item; a component that has items takes its own, and the components
 * it names (see ComponentDef.accepts).
 */

export function accepts( parentType: string, type: string ): boolean {
	const parent = components.get( parentType );

	if( !parent?.container ) {
		return false;
	}

	if( parent.items?.some( item => item.type === type ) ) {
		return true;
	}

	if( parent.accepts ) {
		return parent.accepts.includes( type );
	}

	return !parent.items && !components.get( type )?.item;
}

/**
 * What a new node of a type holds at first, as its description says
 * (`holds`): nodes without ids, each with its first values and with what
 * it holds itself. Only what the type takes, and as many as it has room
 * for: a description cannot make a tree that could not be made by hand.
 * None for most types.
 */

export function initialChildren( type: string, depth = 0 ): Omit<DNode, "id">[] {
	const def = components.get( type );

	// a description that holds itself, by mistake, does not go on forever
	if( !def?.container || !def.holds || depth > 8 ) {
		return [];
	}

	const children: Omit<DNode, "id">[] = [];

	for( const held of def.holds ) {
		if( !accepts( type, held.type ) || children.length >= capacity( type ) ) {
			continue;
		}

		const node: Omit<DNode, "id"> = { type: held.type, box: { x: 0, y: 0, w: 0, h: 0 } };

		const props = { ...initialProps( held.type ), ...held.props };
		if( Object.keys( props ).length ) {
			node.props = props;
		}

		if( isBox( held.type ) ) {
			node.children = initialChildren( held.type, depth + 1 ) as DNode[];
		}

		children.push( node );
	}

	return children;
}

/**
 * how many nodes a node of a type may hold: one for what holds one at most
 */

export function capacity( type: string ): number {
	return components.get( type )?.single ? 1 : Infinity;
}

/**
 * true when a node may be given `more` children of a type: it takes that
 * type (see accepts), and has room for them
 */

export function takes( parent: DNode, type: string, more = 1 ): boolean {
	return accepts( parent.type, type ) && ( parent.children?.length ?? 0 ) + more <= capacity( parent.type );
}

/**
 * The props of a new node of a type: the properties its description gives
 * a first value to. undefined when there is none.
 */

export function initialProps( type: string ): Record<string, unknown> {
	const props: Record<string, unknown> = { ...components.get( type )?.initial };

	for( const property of components.get( type )?.properties ?? [] ) {
		if( property.initial !== undefined ) {
			props[property.name] = property.initial;
		}
	}

	return Object.keys( props ).length ? props : undefined;
}

/**
 * What an item is given as: the value of its first property, or an object
 * made of its properties. An item has no class.
 */

function describeItem( node: DNode, def: ComponentDef ): X4Element {
	const props: Record<string, unknown> = { ...def.fixed };

	for( const property of def.properties ?? [] ) {
		let value = getProp( node, property.name );

		if( value === undefined || value === null || value === property.default ) {
			continue;
		}

		// an icon of the project, when it still has it
		if( property.type === "icon" ) {
			const icon = findIcon( value );
			if( !icon ) {
				continue;
			}

			value = iconRef( icon.name );
		}

		props[property.prop ?? property.name] = value;
	}

	if( def.item === "object" ) {
		return { ctor: null, props, value: props };
	}

	// a value: what each property gives, the first one alone when they are not joined
	const parts: string[] = [];

	for( const property of def.properties ?? [] ) {
		const value = getProp( node, property.name );

		if( property.type === "boolean" ) {
			if( value === true ) {
				parts.push( property.name );
			}
		}
		else if( value !== undefined && value !== null && value !== "" ) {
			parts.push( String( value ) );
		}
		else if( parts.length === 0 && def.join === undefined ) {
			break;		// the first one is empty: so is the value
		}
	}

	return { ctor: null, props, value: def.join === undefined ? parts[0] ?? "" : parts.join( def.join ) };
}

/**
 * The x4 component of a node: its class and its props, without its
 * children (the `content` of a box is the business of who builds it).
 * null for a node of a type the studio does not know. For an item, there
 * is no class, and what counts is its `value`.
 *
 * Only what differs from what x4 does by itself is given: the code that is
 * generated says nothing more than what the user chose.
 */

export function describe( node: DNode ): X4Element {
	const def = components.get( node.type );
	if( !def ) {
		return null;
	}

	if( def.item ) {
		return describeItem( node, def );
	}

	// Its classes first, as x4 code is written: { cls: "outline", label: "OK" }.
	// Those of the styles the user gave it, then those of its own properties.
	const classes = [
		...classesOf( node ),
		...( def.properties ?? [] ).filter( property => property.cls && getProp( node, property.name ) === true ).map( property => property.cls ),
	];

	const props: Record<string, unknown> = classes.length ? { cls: classes.join( " " ), ...def.fixed } : { ...def.fixed };

	// Everything that is about the look goes to the style, where a class
	// will be able to say it too.
	const style: Record<string, unknown> = {};

	for( const property of def.properties ?? [] ) {
		let value = getProp( node, property.name );

		if( value === undefined || value === null || value === property.default ) {
			continue;
		}

		// a class the component has, or not: said above
		if( property.cls ) {
			continue;
		}

		// An icon of the project, when it still has it: a reference to it,
		// which who builds the component turns into what it needs.
		if( property.type === "icon" ) {
			const icon = findIcon( value );
			if( !icon ) {
				continue;
			}

			value = iconRef( icon.name );
		}

		// "ok, cancel": the items, without the spaces around them
		if( property.list && typeof value === "string" ) {
			value = value.split( "," ).map( item => item.trim( ) ).filter( item => item !== "" );
		}

		if( property.style ) {
			style[property.style] = value;
		}
		else {
			props[property.prop ?? property.name] = value;
		}
	}

	// The page is always shown. It has the size of its box, unless it
	// takes the room it is given.
	if( node.type === ROOT ) {
		if( getProp( node, PAGE_FIT ) !== true ) {
			props.width = node.box.w;
			props.height = node.box.h;
		}
	}
	else {
		const width = getProp( node, "width" );
		if( typeof width === "number" ) {
			props.width = width;
		}

		const height = getProp( node, "height" );
		if( typeof height === "number" ) {
			props.height = height;
		}

		const flex = getProp( node, "flex" );
		if( typeof flex === "number" && flex > 0 ) {
			props.flex = flex;
		}

		if( node.hidden ) {
			props.hidden = true;
		}
	}

	// what the node sets for itself, over what its classes say
	Object.assign( style, inlineStyle( node ) );

	if( Object.keys( style ).length ) {
		props.style = style;
	}

	// The declarations that have no field, variables above all. x4 has no
	// prop for a variable: they are the text of the `style` attribute,
	// which the style above is then added to. The page is not built with
	// props of its own: its variables are given apart.
	const vars = inlineVars( node );

	if( Object.keys( vars ).length === 0 ) {
		return { ctor: def.class, props };
	}

	if( node.type === ROOT ) {
		return { ctor: def.class, props, vars };
	}

	props.attrs = { style: declarationsText( vars ) };
	return { ctor: def.class, props };
}
