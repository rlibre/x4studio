/**
 * @file tree.ts
 * @description the tree of the objects of the page
 *
 * One row per object, the front of the page at the top; the members of a
 * group are under it, a little to the right. A row shows the name of the
 * object, or the title of its type when it has none.
 *
 * Where the objects are in boxes, one after the other, the first one comes
 * at the top instead (see `order`).
 *
 *   click            selects the object, on the surface too
 *   ctrl + click     adds it to the selection, or takes it out (cmd on a Mac)
 *   shift + click    selects the rows from the last one clicked to this one
 *   double click     on the name: rename (Enter to accept, Escape to give up)
 *                    (it is told from two presses on the name, see onRowDown)
 *   drag             another place among the others, into a group or out of it
 *   the lock         the object is not caught nor moved on the surface anymore
 *   the eye          the object is not shown anymore
 *
 * A member of a group is selected here on its own, which a click on the
 * surface does not do. The row under the pointer shows its object on the
 * surface.
 */

import { Component, ComponentProps, Icon, Input } from "x4js";

import type { DNode } from "../core/document.ts";
import { getObjectType, nameOf } from "../core/registry.ts";

import icons from "../icons.ts";
import { isCommand } from "./keys.ts";
import type { EditorSurface } from "./editor.ts";

import "./tree.scss";

/** under this distance, in pixels, a press on a row is a click, not a drag */
const DRAG_SLOP = 4;

/** under this delay, in ms, a second press on the same name is a double click */
const DOUBLE_CLICK = 400;

/** how far a row is pushed to the right for each group it is in, in pixels */
const INDENT = 14;

interface TreeProps extends ComponentProps {
	surface: EditorSurface;

	/**
	 * Which child of a node comes first, at the top:
	 *   "stack"   the last one, which is drawn above the others (by default)
	 *   "flow"    the first one, as the children follow each other in a box
	 */
	order?: "stack" | "flow";

	/**
	 * The page itself has a row, the first one, and the objects are under
	 * it. A click on it selects nothing: it is how an editor shows the
	 * properties of the page (see EditorSurface.getSubjects), and the row
	 * is the selected one while nothing is selected. It is not dragged,
	 * renamed, hidden nor locked. Without this, the page has no row.
	 */
	page?: boolean;
}

interface Row {
	node: DNode;
	element: Component;
}

/** where the rows that are dragged would go (see Document.move) */
interface Drop {
	parent: DNode;
	before: DNode;
	row: Row;								// the row the pointer is on
	where: "above" | "below" | "into";
}

interface Drag {
	node: DNode;							// the row that was pressed
	nodes: DNode[];							// what moves with it
	from: { x: number, y: number };
	moving: boolean;						// the pointer went far enough: it is not a click anymore
	alone: boolean;							// a click, in the end, selects that row only
	drop: Drop;
}

/**
 *
 */

export class TreePanel extends Component<TreeProps> {

	private rows: Row[] = [];
	private pageRow: Component = null;		// the row of the page, when it has one (see props.page)
	private closed = new Set<number>( );	// the groups whose members are not shown
	private shown: string = null;			// what the rows were built from
	private anchor: number = null;			// the last row clicked: where a range starts
	private pressed: { id: number, time: number } = null;	// the last name pressed, to tell a double click
	private marker: Component;				// shows where the rows that are dragged would go
	private renaming: number = null;
	private drag: Drag = null;

	constructor( props: TreeProps ) {
		super( props );

		this.marker = new Component( { cls: "tree-marker", hidden: true } );

		this.addDOMEvent( "pointermove", ev => this.onDragMove( ev ) );
		this.addDOMEvent( "pointerup", ev => this.onDragEnd( ev, true ) );
		this.addDOMEvent( "pointercancel", ev => this.onDragEnd( ev, false ) );

		props.surface.on( "selectionChange", ( ) => this.update( ) );
		props.surface.on( "change", ( ) => this.update( ) );

		this.update( );
	}

	// :: ROWS ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The rows only depend on the tree: names, order, what is hidden or
	 * locked. They are made again when that changes, not each time an
	 * object moves on the page.
	 */

	private update( ): void {
		const doc = this.props.surface.doc;
		const selection = this.props.surface.getSelection( );

		// a member that gets selected must be seen: its groups are opened
		for( const node of selection ) {
			for( let parent = doc.parentOf( node ); parent && parent !== doc.root; parent = doc.parentOf( parent ) ) {
				this.closed.delete( parent.id );
			}
		}

		const tree = JSON.stringify( doc.root.children, ( key, value ) => key === "box" || key === "props" ? undefined : value );
		const shown = `${tree} ${[...this.closed].join( )}`;

		if( shown !== this.shown && this.renaming === null ) {
			this.shown = shown;
			this.rebuild( );
		}

		const selected = new Set( selection.map( node => node.id ) );
		this.rows.forEach( row => row.element.setClass( "selected", selected.has( row.node.id ) ) );

		// nothing selected: what is edited is the page
		if( this.pageRow ) {
			this.pageRow.setClass( "selected", selection.length === 0 );
		}
	}

	private rebuild( ): void {
		const doc = this.props.surface.doc;
		this.rows = [];

		// the row under the pointer goes away without saying that the pointer left it
		this.props.surface.setHover( null );

		// the front of the page is the end of the list of the children: it
		// comes first, unless the children are shown as they follow each other
		const flow = this.props.order === "flow";

		const visit = ( nodes: DNode[], depth: number ) => {
			for( const node of flow ? nodes : [...nodes].reverse( ) ) {
				this.rows.push( { node, element: this.makeRow( node, depth ) } );

				if( node.children && !this.closed.has( node.id ) ) {
					visit( node.children, depth + 1 );
				}
			}
		};

		// under the row of the page, when it has one
		visit( doc.root.children, this.props.page ? 1 : 0 );

		this.pageRow = this.props.page ? this.makePageRow( ) : null;

		this.setContent( [
			this.pageRow,
			...this.rows.map( row => row.element ),
			this.rows.length ? null : new Component( { cls: "tree-empty", content: "Nothing on the page" } ),
			this.marker,
		] );
	}

	/**
	 * The row of the page: its icon and its title are those of its type,
	 * when it is registered. It is not one of the rows: nothing is dropped
	 * on it, and a range of rows does not start from it.
	 */

	private makePageRow( ): Component {
		const surface = this.props.surface;
		const type = getObjectType( surface.doc.root.type );

		return new Component( {
			cls: "tree-row page",
			style: { paddingLeft: 4 },
			content: [
				new Component( { cls: "twisty" } ),
				type?.icon ? new Icon( { cls: "type", iconId: type.icon } ) : new Component( { cls: "type" } ),
				new Component( { tag: "span", cls: "name", content: type?.title ?? "Page" } ),
			],
			dom_events: {
				pointerdown: ev => {
					if( ev.button !== 0 ) {
						return;
					}

					ev.stopPropagation( );
					ev.preventDefault( );

					this.anchor = null;
					surface.select( [] );
				},
				mouseenter: ( ) => surface.setHover( surface.doc.root ),
				mouseleave: ( ) => surface.setHover( null ),
			},
		} );
	}

	private makeRow( node: DNode, depth: number ): Component {
		const surface = this.props.surface;
		const isGroup = !!node.children;
		const icon = getObjectType( node.type )?.icon ?? ( isGroup ? icons.group : null );

		// the arrow of a group shows or hides its members
		const twisty = new Component( {
			cls: !isGroup ? "twisty" : this.closed.has( node.id ) ? "twisty group" : "twisty group open",
			content: isGroup ? new Icon( { iconId: icons.chevron } ) : null,
			dom_events: isGroup ? {
				pointerdown: ev => {
					ev.stopPropagation( );
					ev.preventDefault( );
					this.toggle( node );
				},
			} : {},
		} );

		const name = new Component( { tag: "span", cls: "name", content: nameOf( node ) } );

		const row = new Component( {
			cls: "tree-row",
			style: { paddingLeft: 4 + depth * INDENT },
			content: [
				twisty,
				icon ? new Icon( { cls: "type", iconId: icon } ) : new Component( { cls: "type" } ),
				name,
				this.makeGadget( node.locked ? icons.lock : icons.unlock, !!node.locked, ( ) => surface.setLocked( this.targets( node ), !node.locked ) ),
				this.makeGadget( node.hidden ? icons.eyeOff : icons.eye, !!node.hidden, ( ) => surface.setHidden( this.targets( node ), !node.hidden ) ),
			],
			dom_events: {
				pointerdown: ev => this.onRowDown( node, ev ),
				mouseenter: ( ) => surface.setHover( node ),
				mouseleave: ( ) => surface.setHover( null ),
			},
		} );

		// inside something hidden: still there, but dimmed
		row.setClass( "dim", surface.doc.isHidden( node ) );
		return row;
	}

	/**
	 * The lock or the eye of a row. It shows when the pointer is on the
	 * row, and always when it is on.
	 */

	private makeGadget( icon: string, on: boolean, action: ( ) => void ): Component {
		return new Component( {
			cls: on ? "gadget on" : "gadget",
			content: new Icon( { iconId: icon } ),
			dom_events: {
				// the row must not take it for a click on itself
				pointerdown: ev => {
					ev.stopPropagation( );
					ev.preventDefault( );
				},
				click: action,
			},
		} );
	}

	/**
	 * What the lock or the eye of a row acts on: the whole selection when
	 * the row is in it, the row alone otherwise.
	 */

	private targets( node: DNode ): DNode[] {
		const selection = this.props.surface.getSelection( );
		return selection.includes( node ) ? selection : [node];
	}

	private toggle( group: DNode ): void {
		if( !this.closed.delete( group.id ) ) {
			this.closed.add( group.id );
		}

		this.update( );
	}

	// :: RENAME ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Put a field in place of the name of a row. Enter and leaving the
	 * field accept what was typed, Escape gives up.
	 */

	private rename( node: DNode ): void {
		const row = this.rows.find( r => r.node === node );
		if( !row || this.renaming !== null ) {
			return;
		}

		const before = nameOf( node );
		const input = new Input( { type: "text", cls: "rename", value: before } );

		const end = ( accept: boolean ) => {
			if( this.renaming === null ) {
				return;
			}

			this.renaming = null;

			// the title of the type, left as it is, is not a name
			const text = input.getValue( ).trim( );
			if( accept && text !== before ) {
				this.props.surface.rename( node, text );
			}

			this.shown = null;
			this.update( );
		};

		input.addDOMEvent( "keydown", ev => {
			if( ev.key === "Enter" || ev.key === "Escape" ) {
				ev.stopPropagation( );
				ev.preventDefault( );
				end( ev.key === "Enter" );
			}
		} );

		input.on( "focus", ev => {
			if( ev.focus_out ) {
				end( true );
			}
		} );

		this.renaming = node.id;
		row.element.query( ".name" ).setContent( input );

		input.focus( );
		( input.dom as HTMLInputElement ).select( );
	}

	// :: SELECTION, DRAG :::::::::::::::::::::::::::::::::::::::::::::::::::::

	private onRowDown( node: DNode, ev: PointerEvent ): void {
		// in the field of a name that is typed: the press is for the field
		if( ev.button !== 0 || ( ev.target as Element ).closest( "input" ) ) {
			return;
		}

		ev.stopPropagation( );
		ev.preventDefault( );

		// A double click on the name renames. It is told from two presses:
		// the pointer is captured as soon as it goes down, for the drag that
		// may follow, and the browser then gives its dblclick to the tree,
		// not to the name. Only on the name: the lock and the eye are clicked fast.
		const onName = !!( ev.target as Element ).closest( ".name" );
		const twice = onName && this.pressed?.id === node.id && ev.timeStamp - this.pressed.time < DOUBLE_CLICK;

		this.pressed = onName && !twice ? { id: node.id, time: ev.timeStamp } : null;

		if( twice ) {
			this.rename( node );
			return;
		}

		const surface = this.props.surface;
		const selected = surface.getSelection( );
		const wasSelected = selected.includes( node );

		if( isCommand( ev ) ) {
			surface.select( wasSelected ? selected.filter( n => n !== node ) : [...selected, node] );
			this.anchor = node.id;
			return;
		}

		// from the last row clicked to this one, as they are shown
		const from = this.rows.findIndex( row => row.node.id === this.anchor );
		if( ev.shiftKey && from >= 0 ) {
			const to = this.rows.findIndex( row => row.node === node );
			surface.select( this.rows.slice( Math.min( from, to ), Math.max( from, to ) + 1 ).map( row => row.node ) );
			return;
		}

		// A row that is already selected keeps the others for now: they are
		// dragged together. It is selected alone if the press was only a click.
		if( !wasSelected ) {
			surface.select( [node] );
		}

		this.anchor = node.id;
		this.drag = {
			node,
			nodes: wasSelected ? selected : [node],
			from: { x: ev.clientX, y: ev.clientY },
			moving: false,
			alone: wasSelected && selected.length > 1,
			drop: null,
		};

		this.setCapture( ev.pointerId );
	}

	private onDragMove( ev: PointerEvent ): void {
		const drag = this.drag;
		if( !drag ) {
			return;
		}

		if( !drag.moving && Math.hypot( ev.clientX - drag.from.x, ev.clientY - drag.from.y ) < DRAG_SLOP ) {
			return;
		}

		drag.moving = true;
		drag.drop = this.dropAt( ev.clientY );

		const marker = this.marker;
		marker.show( !!drag.drop );

		if( drag.drop ) {
			const { row, where } = drag.drop;
			const element = row.element.dom as HTMLElement;

			// a line between two rows, or a frame on the group that receives
			marker.setClass( "into", where === "into" );
			marker.setStyle( {
				top: element.offsetTop + ( where === "below" ? element.offsetHeight : 0 ),
				height: where === "into" ? element.offsetHeight : 0,
				left: where === "into" ? 0 : parseFloat( element.style.paddingLeft ) + INDENT,
			} );
		}
	}

	private onDragEnd( ev: PointerEvent, done: boolean ): void {
		const drag = this.drag;
		if( !drag ) {
			return;
		}

		this.drag = null;
		this.releaseCapture( ev.pointerId );
		this.marker.hide( );

		if( !done ) {
			return;
		}

		if( !drag.moving ) {
			if( drag.alone ) {
				this.props.surface.select( [drag.node] );
			}
		}
		else if( drag.drop ) {
			this.props.surface.moveNodes( drag.nodes, drag.drop.parent, drag.drop.before );
		}
	}

	/**
	 * Where the rows that are dragged would go, for a pointer at this
	 * height of the screen. null when they cannot go there: into
	 * themselves.
	 *
	 * The top of the list is the front of the page, which is the end of
	 * the children of a node: "above a row" is after its node, in the tree.
	 *
	 *   the upper half of a row      above it
	 *   the lower half               under it
	 *   the middle of a group        into it, at the front
	 *   under a group that is open   idem: it is above its first member
	 *
	 * With the order "flow" the top of the list is the start of the
	 * children: "above a row" is before its node, the middle of a group is
	 * its end, and under a group that is open is before its first member.
	 */

	private dropAt( clientY: number ): Drop {
		const doc = this.props.surface.doc;
		const moved = this.drag.nodes;

		if( this.rows.length === 0 ) {
			return null;
		}

		// the row under the pointer; above the first one or under the last, that one
		const rects = this.rows.map( row => row.element.getBoundingRect( ) );
		let at = rects.findIndex( rc => clientY < rc.top + rc.height );
		if( at < 0 ) {
			at = this.rows.length - 1;
		}

		const row = this.rows[at];
		const node = row.node;
		const part = ( clientY - rects[at].top ) / rects[at].height;

		const isGroup = !!node.children;
		const open = isGroup && !this.closed.has( node.id ) && node.children.length > 0;

		const flow = this.props.order === "flow";

		let drop: Drop;

		if( isGroup && part > 0.25 && part < 0.75 ) {
			drop = { parent: node, before: null, row, where: "into" };
		}
		else if( open && part >= 0.75 ) {
			drop = flow
				? { parent: node, before: node.children[0], row, where: "below" }
				: { parent: node, before: null, row, where: "into" };
		}
		else {
			const parent = doc.parentOf( node );
			const siblings = parent.children;
			const next = siblings[siblings.indexOf( node ) + 1] ?? null;

			// the rows go the other way round with the order "flow"
			const above = part < 0.5;
			drop = { parent, before: above === flow ? node : next, row, where: above ? "above" : "below" };
		}

		// not into what is dragged, nor into what is inside it
		const inside = moved.some( n => n === drop.parent || doc.descendants( n ).includes( drop.parent ) );
		return inside ? null : drop;
	}
}
