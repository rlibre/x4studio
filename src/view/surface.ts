/**
 * @file surface.ts
 * @description the editing surface of the studio: components in boxes
 *
 * Shows a Document as the page it describes: one real x4 component per
 * node, in boxes that lay them out as they will in the application. Nothing
 * is placed by hand: a component is where its box puts it.
 *
 * The page is not alive: its components get no event at all (it is inert).
 * A layer above it, which is not one of its ancestors, receives the
 * pointer, finds the node under it from where the components are, and draws
 * what shows the selection.
 *
 * Unless it is tried (setTrying): the page is then alive, as it will be in
 * the application, and the pointer goes through the layer to it. Its tabs
 * change, its lists drop down, its fields are typed in. Nothing is behind
 * its buttons: the code of the application is not there. What is done to
 * it while it is tried is not kept: it is built again when the try ends.
 */

import { Component, ComponentEvent, ComponentEvents, ComponentProps, EvSelectionChange, EventCallback, Menu, MenuElement } from "x4js";

// every class of x4, by its name: the components are built from descriptions that name theirs
import * as x4 from "x4js";

import type { DNode, Document, StackMove } from "../core/document.ts";
import { History } from "../core/history.ts";
import { canPaste, copyNodes, pasteNodes } from "../core/clipboard.ts";
import { isCommand } from "./keys.ts";
import type { EditorSurface } from "./editor.ts";

import { getProp } from "../core/registry.ts";

import { accepts, capacity, describe, getComponent, initialChildren, initialProps, isBox, itemsOf, takes } from "../core/components.ts";
import type { X4Element } from "../core/components.ts";
import { findIcon, isIconRef } from "../core/icons.ts";

import "./surface.scss";

export interface BoxSurfaceProps extends ComponentProps {
	document: Document;

	/**
	 * What the host adds to the menu of the surface (right click), after
	 * its own items. Called each time the menu opens.
	 */
	menu?: ( ) => MenuElement[];

	selectionChange?: EventCallback<EvSelectionChange>;
	change?: EventCallback<ComponentEvent>;

	/** the page is tried, or not anymore (see setTrying): the surface may end a try by itself, with Escape */
	tryChange?: ( on: boolean ) => void;
}

interface BoxSurfaceEvents extends ComponentEvents {
	/** the selection changed; `selection` holds the selected nodes */
	selectionChange: EvSelectionChange;

	/** the document changed */
	change: ComponentEvent;
}

/**
 * What a component is built with, on the surface, for a value its
 * description gives: where it names an icon of the project (see
 * core/icons.ts), the source of that svg, which x4 draws as it is. In an
 * object, its fields are looked at too: the props of a component, an item
 * that is given as an object.
 */

function withIcons( value: unknown ): unknown {
	if( isIconRef( value ) ) {
		const icon = findIcon( value.$icon );
		return icon ? icon.svg : undefined;
	}

	if( typeof value !== "object" || value === null || Array.isArray( value ) ) {
		return value;
	}

	const result: Record<string, unknown> = {};

	for( const [name, inner] of Object.entries( value ) ) {
		if( isIconRef( inner ) ) {
			const icon = findIcon( inner.$icon );
			result[name] = icon ? icon.svg : undefined;
		}
		else {
			result[name] = inner;
		}
	}

	return result;
}

/** where something is on the layer, in pixels from its top-left corner (a type, not an interface: it is given as a style) */
type Place = {
	left: number;
	top: number;
	width: number;
	height: number;
};

/**
 *
 */

export class BoxSurface extends Component<BoxSurfaceProps, BoxSurfaceEvents> implements EditorSurface {

	readonly doc: Document;
	readonly history: History;

	private host: Component;				// holds the page: the real components
	private layer: Component;				// above the page: receives the pointer
	private frames: Component;				// around what is selected
	private hover: Component;				// around the node the host points at (see setHover)

	private components = new Map<number, Component>( );
	private selection: number[] = [];
	private hovered: number = null;
	private editing = false;				// between beginEdit and endEdit
	private trying = false;					// the page is alive (see setTrying)

	constructor( props: BoxSurfaceProps ) {
		super( props );

		this.doc = props.document;
		this.history = new History( this.doc );

		this.mapPropEvents( props, "selectionChange", "change" );

		// to receive the keyboard
		this.setAttribute( "tabindex", 0 );

		// The page and the layer scroll together: what the layer draws
		// stays on the components.
		this.setContent( new Component( {
			cls: "canvas",
			content: [
				this.host = new Component( { cls: "host", attrs: { inert: "true" } } ),

				this.layer = new Component( {
					cls: "layer",
					content: [
						this.frames = new Component( { cls: "frames" } ),
						this.hover = new Component( { cls: "hover", hidden: true } ),
					],
					dom_events: {
						pointerdown: ev => this.onPointerDown( ev ),
						contextmenu: ev => this.onContextMenu( ev ),
						resized: ( ) => this.updateLayer( ),
					},
				} ),
			],
		} ) );

		// While the page is tried, a link of the page must not take the
		// studio somewhere else, nor a form send it: both would load
		// another page in place of the studio. (seen before the page sees them)
		this.host.dom.addEventListener( "click", ev => {
			if( ( ev.target as Element ).closest( "a[href]" ) ) {
				ev.preventDefault( );
			}
		}, true );

		this.host.dom.addEventListener( "submit", ev => ev.preventDefault( ), true );

		this.addShortcuts( );

		// Copy, cut and paste are not shortcuts: their keys are left to the
		// browser, which then gives its clipboard without asking anything.
		// (x4 does not know these three events: they are listened to directly)
		this.dom.addEventListener( "copy", ev => this.onCopy( ev as ClipboardEvent, false ) );
		this.dom.addEventListener( "cut", ev => this.onCopy( ev as ClipboardEvent, true ) );
		this.dom.addEventListener( "paste", ev => this.onPaste( ev as ClipboardEvent ) );

		this.doc.onChange( ( ) => {
			this.rebuild( );
			this.updateLayer( );
		} );

		this.rebuild( );
	}

	// :: SELECTION :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	getSelection( ): DNode[] {
		return this.selection.map( id => this.doc.get( id ) ).filter( node => !!node );
	}

	/**
	 * The nodes of this document that have the ids of those given. A panel
	 * that is shared by several pages may, for a moment, hold the nodes of
	 * another one: what it asks is done on those of this page.
	 */

	private own( nodes: DNode[] ): DNode[] {
		return nodes.map( node => node && this.doc.get( node.id ) ).filter( node => !!node );
	}

	select( nodes: DNode[] ): void {
		const selected = this.own( nodes );

		this.selection = selected.map( node => node.id );
		this.reveal( );
		this.updateLayer( );
		this.fire( "selectionChange", { selection: selected, empty: selected.length === 0 } );
	}

	/**
	 * What the properties panel is about: the selection, or the page when
	 * nothing is selected. A box has properties of its own: it does not
	 * stand for what it holds.
	 */

	getSubjects( ): DNode[] {
		const selection = this.getSelection( );
		return selection.length ? selection : [this.doc.root];
	}

	// :: TRY :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	isTrying( ): boolean {
		return this.trying;
	}

	/**
	 * Try the page, or go back to editing it. Tried, it is alive: it gets
	 * the pointer and the keyboard, and the studio draws nothing over it.
	 * Back to editing, it is built again: what was typed, ticked or opened
	 * meanwhile was not the page.
	 */

	setTrying( on: boolean ): void {
		if( on === this.trying ) {
			return;
		}

		// a field that was being typed in: its step for undo ends here
		this.endEdit( );

		this.trying = on;
		this.setClass( "trying", on );

		// an inert page gets no event at all
		this.host.setAttribute( "inert", on ? false : "true" );

		if( !on ) {
			this.rebuild( );
			this.updateLayer( );
			this.focus( );
		}

		if( this.props.tryChange ) {
			this.props.tryChange( on );
		}
	}

	// :: COMMANDS ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Change the document in a way that can be undone as one step.
	 */

	run( action: ( ) => void ): void {
		if( this.editing ) {
			action( );		// part of the edit in progress
			return;
		}

		this.history.begin( );
		action( );
		this.history.commit( );
		this.fire( "change", {} );
	}

	/**
	 * For a change made of many small ones (the user types in a field):
	 * everything done between beginEdit and endEdit is undone as one step.
	 */

	beginEdit( ): void {
		if( !this.editing ) {
			this.editing = true;
			this.history.begin( );
		}
	}

	endEdit( ): void {
		if( this.editing ) {
			this.editing = false;
			this.history.commit( );
			this.fire( "change", {} );
		}
	}

	/**
	 * Where a node of a type that is added goes: into what is selected, at
	 * its end, when it takes such a child (a box takes any component, a
	 * BtnGroup its buttons); else after what is selected, in the box that
	 * holds it; else after that box, and so on up to the page. With nothing
	 * selected: at the end of the page.
	 *
	 * `before` is the child of `parent` it comes before, null for the end.
	 * null when it goes nowhere: an item, with nothing selected that takes it.
	 */

	private insertion( type: string ): { parent: DNode, before: DNode } {
		const root = this.doc.root;
		const selection = this.getSelection( );

		let node = selection[selection.length - 1];

		if( node && takes( node, type ) ) {
			return { parent: node, before: null };
		}

		// What holds one node, and has it (the page of a Tabs, with its
		// box): what is added goes into that node, when it takes it. The
		// page is selected, a component is clicked in the palette: it is
		// in the page.
		if( node && capacity( node.type ) === 1 && node.children?.length === 1 && takes( node.children[0], type ) ) {
			return { parent: node.children[0], before: null };
		}

		for( ; node && node !== root; node = this.doc.parentOf( node ) ) {
			const parent = this.doc.parentOf( node );

			if( takes( parent, type ) ) {
				const siblings = parent.children;
				return { parent, before: siblings[siblings.indexOf( node ) + 1] ?? null };
			}
		}

		return accepts( root.type, type ) ? { parent: root, before: null } : null;
	}

	/**
	 * Add a component, or an item, of a registered type (see insertion),
	 * and select it. null when there is nowhere it can go.
	 */

	createObject( type: string, values?: Record<string, unknown> ): DNode {
		const where = this.insertion( type );
		if( !where ) {
			return null;
		}

		const { parent, before } = where;

		// a node of the studio has no place of its own: its box is not used
		const created: Omit<DNode, "id"> = { type, box: { x: 0, y: 0, w: 0, h: 0 } };

		// the first values its description gives (the text of a new button), then those that are asked for
		const props = { ...initialProps( type ), ...values };
		if( Object.keys( props ).length ) {
			created.props = props;
		}

		if( isBox( type ) ) {
			created.children = [];
		}

		// what a new one holds at first, as its description says: they are made with it
		const held = initialChildren( type );

		let node: DNode;
		this.run( ( ) => {
			node = this.doc.add( created, parent, before ? parent.children.indexOf( before ) : undefined );

			if( held.length ) {
				this.doc.addCopies( held.map( child => ( { ...child, id: 0 } ) ), node );
			}

			this.select( [node] );
		} );

		return node;
	}

	/**
	 * Give values to properties of nodes: by default, of the selection.
	 */

	setProps( values: Record<string, unknown>, nodes = this.getSelection( ) ): void {
		const changed = this.own( nodes );
		if( changed.length ) {
			this.run( ( ) => this.doc.setProps( changed, values ) );
		}
	}

	/**
	 * Change what the subjects set for themselves, over what their classes
	 * say: the value of a CSS property the studio knows (`kind` is "css"),
	 * or a declaration that has no field ("vars"). Each node keeps the
	 * others it has. An undefined value takes the name away.
	 */

	patch( kind: string, name: string, value: unknown ): void {
		this.run( ( ) => {
			for( const node of this.getSubjects( ) ) {
				const held = node.props?.[kind];
				const values: Record<string, unknown> = typeof held === "object" && held !== null ? { ...held } : {};

				if( value === undefined ) {
					delete values[name];
				}
				else {
					values[name] = value;
				}

				this.doc.setProps( [node], { [kind]: Object.keys( values ).length ? values : undefined } );
			}
		} );
	}

	/**
	 * What applies to the first of the subjects for a CSS property, as the
	 * browser computed it on the page ("16px", "normal"): what its classes,
	 * x4 and the theme make of it, whatever it sets itself. "" when it has
	 * no component.
	 */

	applied( css: string ): string {
		const node = this.getSubjects( )[0];
		return ( node && this.components.get( node.id )?.getStyleVariable( css ) ) ?? "";
	}

	deleteSelection( ): void {
		this.run( ( ) => {
			this.doc.remove( this.getSelection( ) );
			this.select( [] );
		} );
	}

	/**
	 * Move the selection among its siblings (see Document.reorder): the
	 * children of a box follow each other, "backward" is one step towards
	 * the start of the box.
	 */

	reorder( move: StackMove ): void {
		const nodes = this.getSelection( );
		if( nodes.length ) {
			this.run( ( ) => this.doc.reorder( nodes, move ) );
		}
	}

	undo( ): void {
		this.endEdit( );		// an edit in progress is a step of its own
		this.history.undo( );
		this.afterHistory( );
	}

	redo( ): void {
		this.endEdit( );
		this.history.redo( );
		this.afterHistory( );
	}

	private afterHistory( ): void {
		// the nodes that came back are other objects: keep those that still exist
		this.select( this.getSelection( ) );
		this.fire( "change", {} );
	}

	// :: THE TREE OF THE OBJECTS :::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Give a name to a node, an empty one takes it away. In the code that
	 * is generated, the name is how the component is reached (`refs`).
	 */

	rename( node: DNode, name: string ): void {
		const [renamed] = this.own( [node] );
		if( renamed ) {
			this.run( ( ) => this.doc.rename( renamed, name ) );
		}
	}

	/**
	 * A hidden component is built hidden: it takes no room in its box.
	 */

	setHidden( nodes: DNode[], hidden: boolean ): void {
		const changed = this.own( nodes );
		if( changed.length ) {
			this.run( ( ) => this.doc.setHidden( changed, hidden ) );
		}
	}

	/**
	 * A locked node is shown, but the pointer goes through it: it is
	 * selected in the tree only.
	 */

	setLocked( nodes: DNode[], locked: boolean ): void {
		const changed = this.own( nodes );
		if( changed.length ) {
			this.run( ( ) => this.doc.setLocked( changed, locked ) );
		}
	}

	/**
	 * Move nodes in the tree (see Document.move): another place in their
	 * box, or another box.
	 */

	moveNodes( nodes: DNode[], parent: DNode, before: DNode = null ): void {
		const moved = this.own( nodes );
		const [into] = this.own( [parent] );
		const [under] = this.own( [before] );

		// not where they cannot be: an item out of its list, a box into a
		// BtnGroup, a second component into what holds one
		if( moved.length && into && moved.every( node => accepts( into.type, node.type ) ) && this.hasRoom( into, moved ) ) {
			this.run( ( ) => this.doc.move( moved, into, under ?? null ) );
		}
	}

	/**
	 * Show a node on the surface, with a line around it: the one the user
	 * points at in the tree. null for none.
	 */

	setHover( node: DNode ): void {
		this.hovered = node?.id ?? null;
		this.updateHover( );
	}

	// :: CLIPBOARD :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The keys of copy and cut, seen by the browser: it gives its
	 * clipboard to be filled, with the selection as a text.
	 */

	private onCopy( ev: ClipboardEvent, cut: boolean ): void {
		// tried: the keys are for the fields of the page
		if( this.trying ) {
			return;
		}

		const nodes = this.getSelection( );
		if( nodes.length === 0 ) {
			return;
		}

		ev.clipboardData.setData( "text/plain", copyNodes( this.doc, nodes ) );
		ev.preventDefault( );

		if( cut ) {
			this.deleteSelection( );
		}
	}

	/**
	 * What was copied is added where a new component would go (see
	 * insertion), and selected.
	 */

	private onPaste( ev: ClipboardEvent ): void {
		if( this.trying ) {
			return;
		}

		const text = ev.clipboardData.getData( "text/plain" );
		ev.preventDefault( );

		if( !canPaste( text ) ) {
			return;
		}

		// Pasted at the end of the page, then taken where it goes: one step.
		// What cannot go there (an item, with nothing selected that takes
		// it) is not pasted: the step leaves the document as it was.
		this.run( ( ) => {
			const nodes = pasteNodes( this.doc, text );
			const where = nodes.length ? this.insertion( nodes[0].type ) : null;

			if( where && nodes.every( node => accepts( where.parent.type, node.type ) ) && this.hasRoom( where.parent, nodes ) ) {
				this.doc.move( nodes, where.parent, where.before );
				this.select( nodes );
			}
			else {
				this.doc.remove( nodes );
			}
		} );
	}

	/**
	 * true when a node can hold these nodes, with those it already has:
	 * some hold one node at most (the page of a Tabs)
	 */

	private hasRoom( parent: DNode, nodes: DNode[] ): boolean {
		const staying = ( parent.children ?? [] ).filter( child => !nodes.includes( child ) ).length;
		return staying + nodes.length <= capacity( parent.type );
	}

	// :: DISPLAY :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The page is built again, whole, each time the document changes: one
	 * component per node, nested as the nodes are. No component is used
	 * twice.
	 */

	private rebuild( ): void {
		this.components.clear( );

		// what a node is, for its parent: its component, or the value of an item
		const build = ( node: DNode ): unknown => {
			const element = describe( node );

			if( element && element.ctor === null ) {
				const value = withIcons( element.value );
				const def = getComponent( node.type );

				// An item that holds components (the page of a Tabs): they
				// are built, and are one of its fields. It has no component
				// of its own: it is where its owner draws it (findParts).
				if( def.container && node.children && typeof value === "object" && value !== null ) {
					const inside = node.children.map( build );
					return { ...value, [def.content ?? "content"]: def.single ? inside[0] ?? null : inside };
				}

				return value;
			}

			const component = this.instantiate( node, element, node.children?.map( build ) );
			this.components.set( node.id, component );
			this.findParts( node, component );

			return component;
		};

		// the page has the size its description gives it: its own, or the room the surface has (fit)
		const page = build( this.doc.root ) as Component;
		page.addClass( "page" );

		// the variables the page sets for itself: it is not built with props that could give them
		for( const [name, value] of Object.entries( describe( this.doc.root )?.vars ?? {} ) ) {
			page.setStyleVariable( name, value );
		}

		this.host.setContent( page );
		this.reveal( );
	}

	/**
	 * A component that shows one of its items at a time (the pages of a
	 * Tabs) is made to show the one that is selected, or that holds what is
	 * selected: its description says how (`reveal`). The page is not alive,
	 * a click on a title would do nothing: what is selected in the tree is
	 * then seen. From the outermost to the innermost: tabs may be in tabs.
	 */

	private reveal( ): void {
		const calls: ( ( ) => void )[] = [];

		for( const node of this.getSelection( ) ) {
			for( let item = node; item && item !== this.doc.root; item = this.doc.parentOf( item ) ) {
				const owner = this.doc.parentOf( item );
				const how = owner ? getComponent( owner.type )?.reveal : null;

				if( !how || !getComponent( item.type )?.item ) {
					continue;
				}

				const component = this.components.get( owner.id ) as unknown as Record<string, unknown>;
				const key = getProp( item, how.by );

				if( component && typeof component[how.method] === "function" && key !== undefined && key !== null ) {
					calls.unshift( ( ) => ( component[how.method] as ( key: unknown ) => void )( key ) );
				}
			}
		}

		for( const call of calls ) {
			try {
				call( );
			}
			catch( error ) {
				console.warn( "x4studio: an item could not be shown", error );
			}
		}
	}

	/**
	 * A component that builds itself what stands for its children (a
	 * BtnGroup makes a button of the text "ok", a Listbox a row of each
	 * item): its description says where they are, one element per child, in
	 * their order. An item is then on the page as a component is: it is
	 * caught under the pointer, and framed when it is selected.
	 */

	private findParts( node: DNode, component: Component ): void {
		const selector = getComponent( node.type )?.parts;
		if( !selector || !node.children ) {
			return;
		}

		const parts = component.queryAll( selector );

		node.children.forEach( ( child, i ) => {
			if( parts[i] && !this.components.has( child.id ) ) {
				this.components.set( child.id, parts[i] );
			}
		} );
	}

	/**
	 * The x4 component of a node, from what its description says of it
	 * (see describe, core/components.ts), with what stands for its children
	 * when it holds some.
	 */

	private instantiate( node: DNode, element: X4Element, content: unknown[] ): Component {
		const ctor = element ? ( x4 as unknown as Record<string, unknown> )[element.ctor] : null;

		let component: Component = null;

		// The class comes from a description, which a project may have
		// written: it may not be a component, or not take these props.
		if( typeof ctor === "function" ) {
			try {
				// its props, with the icons themselves where it names some
				const own = withIcons( element.props ) as Record<string, unknown>;

				// its children, under the prop its description names: `content`, or the `items` of a BtnGroup
				const props = node.children ? { ...own, [getComponent( node.type )?.content ?? "content"]: content } : own;

				const built = new ( ctor as new ( props: unknown ) => unknown )( props );
				component = built instanceof Component ? built : null;
			}
			catch( error ) {
				console.warn( `x4studio: ${element.ctor} could not be built`, error );
			}
		}

		// a type the studio does not know, or a class x4 does not have: something stands where it is
		component ??= new Component( { cls: "unknown", content: element?.ctor ?? node.type } );

		// A box draws nothing by itself: the studio shows where it is, and
		// gives it some room while it holds nothing. Not part of the page.
		if( node.children && node !== this.doc.root ) {
			component.addClass( "sbox" );
			component.setClass( "empty", node.children.length === 0 );
		}

		return component;
	}

	/**
	 * where the component of a node is on the layer; null when it has none
	 */

	private placeOf( node: DNode ): Place {
		const component = this.components.get( node.id );
		if( !component ) {
			return null;
		}

		const rc = component.getBoundingRect( );
		const origin = this.layer.getBoundingRect( );

		return { left: rc.left - origin.left, top: rc.top - origin.top, width: rc.width, height: rc.height };
	}

	/**
	 * What shows the selection: a frame around each selected node, placed
	 * from where its component is. Drawn again each time the page is built,
	 * and when it changes size. A host that hides the surface and shows it
	 * again asks for it (refresh): nothing has a place while it is hidden.
	 */

	refresh( ): void {
		this.updateLayer( );
	}

	/**
	 * Build the page again, as when the document changes. For what a
	 * component is built with and that is not in the document: the classes
	 * of the styles of the project, when a style is renamed or removed.
	 */

	redraw( ): void {
		this.rebuild( );
		this.updateLayer( );
	}

	private updateLayer( ): void {
		// what is hidden takes no room: there is nothing to go around
		const nodes = this.getSelection( ).filter( node => !this.doc.isHidden( node ) );

		this.frames.setContent( nodes.map( node => new Component( {
			cls: this.doc.isLocked( node ) ? "frame locked" : "frame",
			style: this.placeOf( node ),
		} ) ) );

		this.updateHover( );
	}

	private updateHover( ): void {
		const node = this.hovered === null ? null : this.doc.get( this.hovered );
		const place = node && !this.doc.isHidden( node ) ? this.placeOf( node ) : null;

		this.hover.show( !!place );
		if( place ) {
			this.hover.setStyle( place );
		}
	}

	// :: POINTER :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The node under a point of the screen: the innermost one. null on the
	 * page itself, and outside of it.
	 *
	 * What is hidden is not there, and the pointer goes through what is
	 * locked, with everything inside it. A component may stick out of its
	 * box: the children are looked at first.
	 */

	private nodeAt( x: number, y: number ): DNode {
		const find = ( node: DNode ): DNode => {
			if( node.hidden || node.locked ) {
				return null;
			}

			for( const child of node.children ?? [] ) {
				const hit = find( child );
				if( hit ) {
					return hit;
				}
			}

			const rc = this.components.get( node.id )?.getBoundingRect( );
			return rc && x >= rc.left && x < rc.right && y >= rc.top && y < rc.bottom ? node : null;
		};

		for( const child of this.doc.root.children ) {
			const hit = find( child );
			if( hit ) {
				return hit;
			}
		}

		return null;
	}

	private onPointerDown( ev: PointerEvent ): void {
		ev.stopPropagation( );
		ev.preventDefault( );
		this.focus( );

		const node = this.nodeAt( ev.clientX, ev.clientY );
		const selected = this.getSelection( );

		// Right button: the menu will act on the selection, so the node
		// under the pointer must be in it.
		if( ev.button === 2 ) {
			if( node && !selected.includes( node ) ) {
				this.select( [node] );
			}

			return;
		}

		if( ev.button !== 0 ) {
			return;
		}

		// ctrl + click: the node goes in the selection, or out of it
		if( isCommand( ev ) ) {
			if( node ) {
				this.select( selected.includes( node ) ? selected.filter( n => n !== node ) : [...selected, node] );
			}

			return;
		}

		// on the page or beside it: nothing is selected, the properties are those of the page
		this.select( node ? [node] : [] );
	}

	/**
	 * In the menu: the items of what is selected, when it has some of its
	 * own, or of the one that holds it. An item whose first property is a
	 * choice is offered with each of its values: the one that is picked is
	 * the one the new item has.
	 */

	private itemsMenu( ): MenuElement[] {
		const selection = this.getSelection( );
		const node = selection[selection.length - 1];
		const owner = !node ? null : itemsOf( node.type ).length ? node : this.doc.parentOf( node );

		const items = owner ? itemsOf( owner.type ) : [];
		if( items.length === 0 ) {
			return [];
		}

		const adds: MenuElement[] = items.map( item => {
			const first = item.properties?.[0];
			const text = `Add: ${item.title}`;

			if( first?.type === "options" && first.options?.length ) {
				return {
					text,
					icon: item.icon,
					menu: new Menu( {
						items: first.options.map( option => ( { text: option.title, click: ( ) => { this.createObject( item.type, { [first.name]: option.value } ); } } ) ),
					} ),
				};
			}

			return { text, icon: item.icon, click: ( ) => { this.createObject( item.type ); } };
		} );

		return [...adds, "-"];
	}

	/**
	 * the menu of the surface, never the one of the browser
	 */

	private onContextMenu( ev: MouseEvent ): void {
		ev.stopPropagation( );
		ev.preventDefault( );

		const none = this.getSelection( ).length === 0;

		const menu = new Menu( {
			items: [
				...this.itemsMenu( ),
				{ text: "Move before", disabled: none, click: ( ) => this.reorder( "backward" ) },
				{ text: "Move after", disabled: none, click: ( ) => this.reorder( "forward" ) },
				{ text: "Delete", disabled: none, click: ( ) => this.deleteSelection( ) },
				"-",
				{ text: "Undo", disabled: !this.history.canUndo( ), click: ( ) => this.undo( ) },
				{ text: "Redo", disabled: !this.history.canRedo( ), click: ( ) => this.redo( ) },
				"-",
				...this.props.menu?.( ) ?? [],
			],
		} );

		menu.displayAt( ev.clientX, ev.clientY );
	}

	// :: KEYBOARD ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The keys of the surface, as shortcuts of x4: they work while the
	 * surface has the focus, and while nothing has it if the surface is the
	 * last view that had it. The key of the commands (Mod) is Ctrl, or Cmd
	 * on a Mac.
	 */

	private addShortcuts( ): void {
		// While the page is tried, the keys are its own: they edit nothing.
		const editing = ( action: ( ) => void ) => ( ) => {
			if( !this.trying ) {
				action( );
			}
		};

		// One step out: the box that holds what is selected, then nothing.
		// While the page is tried: back to editing, from a field of the
		// page too (which no other shortcut is taken from).
		this.addShortcut( "Escape", ( ) => {
			if( this.trying ) {
				this.setTrying( false );
				return;
			}

			const first = this.getSelection( )[0];
			const parent = first ? this.doc.parentOf( first ) : null;

			this.select( parent && parent !== this.doc.root ? [parent] : [] );
		}, { editable: true } );

		this.addShortcut( ["Delete", "Backspace"], editing( ( ) => this.deleteSelection( ) ) );

		// redo: with Y on Windows, with shift and Z on a Mac and on Linux
		this.addShortcut( "Mod+Z", editing( ( ) => this.undo( ) ) );
		this.addShortcut( ["Mod+Y", "Shift+Mod+Z"], editing( ( ) => this.redo( ) ) );

		// (copy, cut and paste: see the constructor)

		// the arrows move the selection in its box, whatever its direction
		this.addShortcut( ["ArrowUp", "ArrowLeft"], editing( ( ) => this.reorder( "backward" ) ) );
		this.addShortcut( ["ArrowDown", "ArrowRight"], editing( ( ) => this.reorder( "forward" ) ) );
	}
}
