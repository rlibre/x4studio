/**
 * @file document.ts
 * @description the tree of nodes being edited: a page
 */

import { MIN_SIZE, cleanBox, isBoxName } from "./box.ts";
import type { Box, BoxName } from "./box.ts";

/**
 * A node is plain data: the whole document is saved, restored and undone
 * with JSON. This is why a node does not point to its parent: the document
 * keeps that link aside (parentOf).
 *
 * `type` says which description the node is of (see components.ts), and
 * `props` holds the values of its properties.
 *
 * x, y, w and h are kept in the box, but are given as the other properties
 * are (setProps): they are never names of `props`. Only the page uses its
 * box (see box.ts).
 *
 * `name`, `hidden` and `locked` are what the user says of a node in the
 * tree of the objects. They are left out when they say nothing: no name,
 * shown, free. A node inside a hidden or a locked one is hidden or locked
 * too (isHidden, isLocked).
 */

export interface DNode {
	id: number;
	type: string;
	box: Box;
	props?: Record<string, unknown>;
	children?: DNode[];
	name?: string;
	hidden?: boolean;
	locked?: boolean;
}

/** what changed: the size of the page, props, or the shape of the tree */
export type ChangeKind = "geometry" | "props" | "structure";

export type ChangeListener = ( kind: ChangeKind ) => void;

/**
 * A move among the children of a node: "backward" is one step towards the
 * start of the list, "back" is its start; "forward" and "front" go the
 * other way.
 */

export type StackMove = "front" | "forward" | "backward" | "back";

/** the type of the root of a document: the page */
export const ROOT = "root";

export class Document {

	root: DNode;

	private nextId = 1;
	private parents = new Map<number, DNode>( );
	private nodes = new Map<number, DNode>( );
	private listeners: ChangeListener[] = [];

	constructor( width: number, height: number ) {
		this.root = { id: 0, type: ROOT, box: { x: 0, y: 0, w: width, h: height }, children: [] };
		this.index( );
	}

	// :: NOTIFICATIONS :::::::::::::::::::::::::::::::::::::::::::::::::::::::

	onChange( listener: ChangeListener ): void {
		this.listeners.push( listener );
	}

	/**
	 * To call after changing nodes by hand. The methods below call it themselves.
	 */

	changed( kind: ChangeKind ): void {
		if( kind === "structure" ) {
			this.index( );
		}

		for( const listener of this.listeners ) {
			listener( kind );
		}
	}

	private index( ): void {
		this.parents.clear( );
		this.nodes.clear( );

		let max = 0;

		const visit = ( node: DNode, parent: DNode ) => {
			this.nodes.set( node.id, node );
			if( parent ) {
				this.parents.set( node.id, parent );
			}

			max = Math.max( max, node.id );
			node.children?.forEach( child => visit( child, node ) );
		};

		visit( this.root, null );
		this.nextId = Math.max( this.nextId, max + 1 );
	}

	// :: TREE ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	get( id: number ): DNode {
		return this.nodes.get( id );
	}

	parentOf( node: DNode ): DNode {
		return this.parents.get( node.id );
	}

	isContainer( node: DNode ): boolean {
		return node.children !== undefined;
	}

	/**
	 * the nodes of the list that are not inside another node of the list,
	 * in the order of the tree
	 */

	topLevel( nodes: DNode[] ): DNode[] {
		const set = new Set( nodes );
		const result: DNode[] = [];

		const visit = ( node: DNode ) => {
			if( set.has( node ) ) {
				result.push( node );
				return;
			}

			node.children?.forEach( visit );
		};

		visit( this.root );
		return result;
	}

	/**
	 * every node inside `node`, at any depth
	 */

	descendants( node: DNode ): DNode[] {
		const result: DNode[] = [];

		const visit = ( n: DNode ) => {
			n.children?.forEach( child => {
				result.push( child );
				visit( child );
			} );
		};

		visit( node );
		return result;
	}

	add( node: Omit<DNode, "id">, parent: DNode = this.root, index?: number ): DNode {
		const created: DNode = { ...node, id: this.nextId++, box: cleanBox( node.box ) };

		const children = parent.children;
		children.splice( index ?? children.length, 0, created );

		this.changed( "structure" );
		return created;
	}

	/**
	 * Add copies of nodes, with everything that is inside them: the copies
	 * get ids of their own. What is given is not touched.
	 */

	addCopies( nodes: DNode[], parent: DNode = this.root ): DNode[] {
		const fresh = ( from: DNode ): DNode => {
			const copy: DNode = { id: this.nextId++, type: from.type, box: cleanBox( from.box ) };

			if( from.props ) {
				copy.props = structuredClone( from.props );
			}

			if( from.name ) {
				copy.name = from.name;
			}

			if( from.hidden ) {
				copy.hidden = true;
			}

			if( from.locked ) {
				copy.locked = true;
			}

			if( from.children ) {
				copy.children = from.children.map( fresh );
			}

			return copy;
		};

		const copies = nodes.map( fresh );
		parent.children.push( ...copies );

		this.changed( "structure" );
		return copies;
	}

	remove( nodes: DNode[] ): void {
		for( const node of this.topLevel( nodes ) ) {
			const parent = this.parentOf( node );
			parent.children.splice( parent.children.indexOf( node ), 1 );
		}

		this.changed( "structure" );
	}

	/**
	 * Change the place of nodes among their siblings: a node never leaves
	 * its parent. Several nodes move together and keep their order.
	 *
	 * "forward" and "backward" go one step: over the next sibling that is
	 * not moving with them.
	 */

	reorder( nodes: DNode[], move: StackMove ): void {
		const moving = new Set( this.topLevel( nodes ) );
		const parents = new Set( [...moving].map( node => this.parentOf( node ) ) );

		for( const parent of parents ) {
			const list = parent.children;
			const swap = ( i: number, j: number ) => [list[i], list[j]] = [list[j], list[i]];

			switch( move ) {
				case "front": {
					parent.children = [...list.filter( n => !moving.has( n ) ), ...list.filter( n => moving.has( n ) )];
					break;
				}

				case "back": {
					parent.children = [...list.filter( n => moving.has( n ) ), ...list.filter( n => !moving.has( n ) )];
					break;
				}

				// from the end, so that a node does not jump over one that moves too
				case "forward": {
					for( let i = list.length - 2; i >= 0; i-- ) {
						if( moving.has( list[i] ) && !moving.has( list[i + 1] ) ) {
							swap( i, i + 1 );
						}
					}
					break;
				}

				case "backward": {
					for( let i = 1; i < list.length; i++ ) {
						if( moving.has( list[i] ) && !moving.has( list[i - 1] ) ) {
							swap( i, i - 1 );
						}
					}
					break;
				}
			}
		}

		this.changed( "structure" );
	}

	/**
	 * Move nodes to another place of the tree: into `parent`, the page or a
	 * node that holds others, before its child `before` (at the end when
	 * there is none). They keep their order.
	 *
	 * @returns false when it cannot be done: a node cannot go into itself,
	 * nor into something that holds no node
	 */

	move( nodes: DNode[], parent: DNode, before: DNode = null ): boolean {
		const moving = this.topLevel( nodes ).filter( node => node !== this.root );
		const inside = new Set( moving.flatMap( node => [node, ...this.descendants( node )] ) );

		if( moving.length === 0 || inside.has( parent ) || !this.isContainer( parent ) ) {
			return false;
		}

		// the sibling they come before: the next one that does not move
		const siblings = parent.children;
		let at = before ? siblings.indexOf( before ) : -1;
		while( at >= 0 && at < siblings.length && inside.has( siblings[at] ) ) {
			at++;
		}

		const anchor = at >= 0 ? siblings[at] ?? null : null;

		for( const node of moving ) {
			const from = this.parentOf( node ).children;
			from.splice( from.indexOf( node ), 1 );
		}

		siblings.splice( anchor ? siblings.indexOf( anchor ) : siblings.length, 0, ...moving );

		this.changed( "structure" );
		return true;
	}

	// :: NAMES, HIDDEN, LOCKED :::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Give a name to a node; an empty one takes it away.
	 */

	rename( node: DNode, name: string ): void {
		const text = name.trim( );

		if( text ) {
			node.name = text;
		}
		else {
			delete node.name;
		}

		this.changed( "props" );
	}

	setHidden( nodes: DNode[], hidden: boolean ): void {
		for( const node of nodes ) {
			if( hidden ) {
				node.hidden = true;
			}
			else {
				delete node.hidden;
			}
		}

		this.changed( "props" );
	}

	setLocked( nodes: DNode[], locked: boolean ): void {
		for( const node of nodes ) {
			if( locked ) {
				node.locked = true;
			}
			else {
				delete node.locked;
			}
		}

		this.changed( "props" );
	}

	/**
	 * true for a node that is hidden, or inside one that is
	 */

	isHidden( node: DNode ): boolean {
		for( let n = node; n; n = this.parentOf( n ) ) {
			if( n.hidden ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * true for a node that is locked, or inside one that is
	 */

	isLocked( node: DNode ): boolean {
		for( let n = node; n; n = this.parentOf( n ) ) {
			if( n.locked ) {
				return true;
			}
		}

		return false;
	}

	// :: PROPERTIES ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Give values to properties of nodes. The other properties are kept.
	 *
	 * x, y, w and h are properties too, for whoever gives them: they go to
	 * the box of the node. A size is never under MIN_SIZE.
	 */

	setProps( nodes: DNode[], values: Record<string, unknown> ): void {
		const box: Partial<Record<BoxName, number>> = {};
		const props: Record<string, unknown> = {};

		for( const name in values ) {
			const value = values[name];

			if( !isBoxName( name ) ) {
				props[name] = value;
			}
			else if( typeof value === "number" && Number.isFinite( value ) ) {
				box[name] = name === "w" || name === "h" ? Math.max( MIN_SIZE, value ) : value;
			}
		}

		const placed = Object.keys( box ).length > 0;
		const given = Object.keys( props ).length > 0;

		for( const node of nodes ) {
			if( given ) {
				node.props = { ...node.props, ...props };
			}

			if( placed ) {
				node.box = cleanBox( { ...node.box, ...box } );
			}
		}

		this.changed( placed && !given ? "geometry" : "props" );
	}

	// :: SAVE / RESTORE ::::::::::::::::::::::::::::::::::::::::::::::::::::::

	snapshot( ): string {
		return JSON.stringify( this.root );
	}

	restore( snapshot: string ): void {
		this.root = JSON.parse( snapshot );
		this.changed( "structure" );
	}
}
