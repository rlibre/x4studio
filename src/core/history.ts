/**
 * @file history.ts
 * @description undo / redo
 */

import type { Document } from "./document.ts";

/**
 * Undo and redo by whole snapshots of the document. A document is a small
 * tree of plain data: this is simple, and cannot get out of sync.
 *
 *   history.begin( );
 *   ...change the document...
 *   history.commit( );     // kept only if something really changed
 */

export class History {

	private doc: Document;
	private undos: string[] = [];
	private redos: string[] = [];
	private pending: string = null;

	constructor( doc: Document ) {
		this.doc = doc;
	}

	begin( ): void {
		this.pending = this.doc.snapshot( );
	}

	commit( ): void {
		if( this.pending !== null && this.pending !== this.doc.snapshot( ) ) {
			this.undos.push( this.pending );
			this.redos.length = 0;
		}

		this.pending = null;
	}

	canUndo( ): boolean {
		return this.undos.length > 0;
	}

	canRedo( ): boolean {
		return this.redos.length > 0;
	}

	undo( ): void {
		if( this.canUndo( ) ) {
			this.redos.push( this.doc.snapshot( ) );
			this.doc.restore( this.undos.pop( ) );
		}
	}

	redo( ): void {
		if( this.canRedo( ) ) {
			this.undos.push( this.doc.snapshot( ) );
			this.doc.restore( this.redos.pop( ) );
		}
	}
}
