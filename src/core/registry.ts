/**
 * @file registry.ts
 * @description the types of nodes the panels know: their title, their icon, their properties
 *
 * The palette, the tree of the objects and the inspector do not read the
 * descriptions of the components: they are told of the types that exist
 * (registerObjectType), by who reads them (components.ts).
 *
 * (no x4 here: this file runs as is under node, for the tests)
 */

import type { DNode } from "./document.ts";
import { isBoxName } from "./box.ts";

export type PropertyType = "string" | "number" | "boolean" | "color" | "options";

export interface PropertyOption {
	value: string;
	title: string;
	icon?: string;
}

/**
 * A property of a node: one entry of `node.props`.
 *
 * The box of a node is not declared by a type: it is read and written as
 * the properties are (getProp, Document.setProps), under names a type
 * cannot use for its own: x, y, w and h.
 */

export interface PropertyDef {
	name: string;				// the key in node.props
	title: string;
	type: PropertyType;

	/** the value of a node that does not hold the property */
	default?: unknown;

	/** the property may have no value at all (a width): a number field is emptied; the value is then null */
	optional?: boolean;

	icon?: string;

	// type "number"
	min?: number;
	max?: number;
	step?: number;

	// type "options": the possible values
	options?: PropertyOption[];
}

export interface ObjectType {
	type: string;				// the value of node.type
	title: string;
	icon?: string;

	/** what the type is, in a sentence: shown with its title where the pointer stays on its button of the palette */
	description?: string;

	/** false: the type is not offered in the palette (the page, an item) */
	creatable?: boolean;

	properties?: PropertyDef[];
}

const types = new Map<string, ObjectType>( );

export function registerObjectType( def: ObjectType ): void {
	types.set( def.type, def );
}

/**
 * Forget a type: the types change while the studio runs (those of the
 * project that is open). The palette that offers them is brought up to
 * date by who does it (CreateTools.update).
 */

export function unregisterObjectType( type: string ): void {
	types.delete( type );
}

export function getObjectType( type: string ): ObjectType {
	return types.get( type );
}

/**
 * every type, in the order they were registered
 */

export function getObjectTypes( ): ObjectType[] {
	return [...types.values( )];
}

function getProperty( type: string, name: string ): PropertyDef {
	return types.get( type )?.properties?.find( p => p.name === name );
}

/**
 * The properties that nodes of several types share: what can be edited
 * when they are selected together.
 *
 * A property is shared when every type defines it the same way: same name,
 * same kind of value and, for options, the same values. They come in the
 * order of the first type, with its titles and icons. A number keeps the
 * limits that suit every type; a property can be emptied only if it is
 * optional for all of them.
 */

export function commonProperties( names: string[] ): PropertyDef[] {
	const [first, ...others] = names.map( name => types.get( name ) );
	const result: PropertyDef[] = [];

	for( const prop of first?.properties ?? [] ) {
		const same = others.map( def => def?.properties?.find( p => p.name === prop.name ) );
		const values = ( p: PropertyDef ) => ( p.options ?? [] ).map( option => option.value ).join( "\n" );

		if( !same.every( p => p && p.type === prop.type && values( p ) === values( prop ) ) ) {
			continue;
		}

		const shared = { ...prop };

		for( const p of same ) {
			if( p.min !== undefined ) {
				shared.min = Math.max( shared.min ?? p.min, p.min );
			}

			if( p.max !== undefined ) {
				shared.max = Math.min( shared.max ?? p.max, p.max );
			}

			if( shared.optional && !p.optional ) {
				shared.optional = false;
			}
		}

		result.push( shared );
	}

	return result;
}

/**
 * How a node is called in the tree of the objects: the name the user gave
 * it, otherwise the title of its type.
 */

export function nameOf( node: DNode ): string {
	return node.name ?? types.get( node.type )?.title ?? node.type;
}

/**
 * The value of a property of a node: its own, or the default of its type.
 * null is a value of its own: the property has none (see `optional`), even
 * when the type has a default for it.
 *
 * x, y, w and h are those of its box.
 */

export function getProp( node: DNode, name: string ): unknown {
	if( isBoxName( name ) ) {
		return node.box[name] ?? 0;
	}

	const value = node.props?.[name];
	return value !== undefined ? value : getProperty( node.type, name )?.default;
}
