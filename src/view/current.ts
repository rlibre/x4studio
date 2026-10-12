/**
 * @file current.ts
 * @description the surface the panels talk to
 *
 * The palette, the properties and the tree of the objects are given one
 * surface when they are built, and the studio has one surface per page
 * that is open. This is the one they are given: it stands for the surface
 * of the page that is shown, and tells them when another page takes its
 * place as it tells them of any change.
 *
 * With no page open, it is the surface of a page that holds nothing, and
 * on which nothing can be done.
 */

import { Document } from "../core/document.ts";
import type { DNode } from "../core/document.ts";
import type { EditorSurface } from "./editor.ts";

import type { BoxSurface } from "./surface.ts";

type SurfaceEvent = "selectionChange" | "change";

export class CurrentSurface implements EditorSurface {

	private active: BoxSurface = null;
	private nothing = new Document( 1, 1 );		// what is edited when no page is open

	private selectionListeners: ( ( ev: any ) => void )[] = [];
	private changeListeners: ( ( ev: any ) => void )[] = [];

	get doc( ): Document {
		return this.active?.doc ?? this.nothing;
	}

	on( name: SurfaceEvent, listener: ( ev: any ) => void ): void {
		if( name === "selectionChange" ) {
			this.selectionListeners.push( listener );
		}
		else {
			this.changeListeners.push( listener );
		}
	}

	/**
	 * the surface of the page that is shown; null when no page is open
	 */

	getActive( ): BoxSurface {
		return this.active;
	}

	/**
	 * Another page is shown, or none: for the panels, everything changed.
	 */

	setActive( surface: BoxSurface ): void {
		// a field that was being typed in: its step for undo ends with its page
		this.active?.endEdit( );
		this.active = surface;

		this.fire( "selectionChange", surface );
		this.fire( "change", surface );
	}

	/**
	 * To call when a surface says something changed: the panels are told
	 * when it is the one that is shown.
	 */

	fire( name: SurfaceEvent, from: BoxSurface ): void {
		if( from !== this.active ) {
			return;
		}

		const listeners = name === "selectionChange" ? this.selectionListeners : this.changeListeners;
		listeners.forEach( listener => listener( {} ) );
	}

	// :: SELECTION :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	getSelection( ): DNode[] {
		return this.active?.getSelection( ) ?? [];
	}

	select( nodes: DNode[] ): void {
		this.active?.select( nodes );
	}

	getSubjects( ): DNode[] {
		return this.active?.getSubjects( ) ?? [];
	}

	setHover( node: DNode ): void {
		this.active?.setHover( node );
	}

	// :: CHANGES :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	createObject( type: string ): DNode {
		return this.active?.createObject( type ) ?? null;
	}

	setProps( values: Record<string, unknown>, nodes?: DNode[] ): void {
		this.active?.setProps( values, nodes );
	}

	beginEdit( ): void {
		this.active?.beginEdit( );
	}

	endEdit( ): void {
		this.active?.endEdit( );
	}

	rename( node: DNode, name: string ): void {
		this.active?.rename( node, name );
	}

	setHidden( nodes: DNode[], hidden: boolean ): void {
		this.active?.setHidden( nodes, hidden );
	}

	setLocked( nodes: DNode[], locked: boolean ): void {
		this.active?.setLocked( nodes, locked );
	}

	moveNodes( nodes: DNode[], parent: DNode, before?: DNode ): void {
		this.active?.moveNodes( nodes, parent, before );
	}

	// :: FOR THE INSPECTOR OF THE STUDIO :: (not asked by the palette nor by the tree)

	/** see BoxSurface.patch */
	patch( kind: string, name: string, value: unknown ): void {
		this.active?.patch( kind, name, value );
	}

	/** see BoxSurface.applied */
	applied( css: string ): string {
		return this.active?.applied( css ) ?? "";
	}
}
