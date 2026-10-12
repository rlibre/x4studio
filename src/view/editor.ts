/**
 * @file editor.ts
 * @description what the panels ask of the editing surface
 *
 * The palette, the inspector and the tree of the objects do not know how a
 * page is edited: they only need the surface to tell what is selected, to
 * change it, and to say when something changed. They are given the surface
 * of the page that is shown (see current.ts).
 */

import type { DNode, Document } from "../core/document.ts";

export interface EditorSurface {
	readonly doc: Document;

	/**
	 * "selectionChange": the selection changed.
	 * "change": the document changed.
	 */
	on( name: "selectionChange" | "change", listener: ( ev: any ) => void ): unknown;

	// :: SELECTION ::

	getSelection( ): DNode[];
	select( nodes: DNode[] ): void;

	/**
	 * What the tools and the properties are about: the selection, a
	 * container standing for what is inside it, or the page when nothing
	 * is selected.
	 */
	getSubjects( ): DNode[];

	/** show a node to the user: the one he points at in the tree; null for none */
	setHover( node: DNode ): void;

	// :: CHANGES :: each one is a step for undo

	createObject( type: string ): DNode;
	setProps( values: Record<string, unknown>, nodes?: DNode[] ): void;

	/** everything done between the two is one step: a field that is typed in */
	beginEdit( ): void;
	endEdit( ): void;

	rename( node: DNode, name: string ): void;
	setHidden( nodes: DNode[], hidden: boolean ): void;
	setLocked( nodes: DNode[], locked: boolean ): void;

	/** another place in the tree: into `parent`, under its child `before` (see Document.move) */
	moveNodes( nodes: DNode[], parent: DNode, before?: DNode ): void;
}
