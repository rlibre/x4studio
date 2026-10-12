/**
 * @file clipboard.ts
 * @description copy and paste of nodes
 *
 * What is copied is a text: the nodes and everything inside them. It can
 * be kept anywhere, and pasted in another page.
 */

import type { DNode, Document } from "./document.ts";

/** says what the text is: anything else is not pasted */
const FORMAT = "x4studio/nodes";

/**
 * The nodes as a text, in the order of the tree. A node that is inside
 * another node of the list comes with it.
 */

export function copyNodes( doc: Document, nodes: DNode[] ): string {
	return JSON.stringify( { format: FORMAT, nodes: doc.topLevel( nodes ) } );
}

function isNode( value: unknown ): value is DNode {
	const node = value as DNode;

	if( typeof node !== "object" || node === null || typeof node.type !== "string" || typeof node.box !== "object" || node.box === null ) {
		return false;
	}

	const { x, y, w, h } = node.box;
	if( ![x, y, w, h].every( v => typeof v === "number" && Number.isFinite( v ) ) ) {
		return false;
	}

	return node.children === undefined || ( Array.isArray( node.children ) && node.children.every( isNode ) );
}

/**
 * true for a text made by copyNodes
 */

export function canPaste( text: string ): boolean {
	return readNodes( text ).length > 0;
}

function readNodes( text: string ): DNode[] {
	try {
		const data = JSON.parse( text );
		return data?.format === FORMAT && Array.isArray( data.nodes ) && data.nodes.every( isNode ) ? data.nodes : [];
	}
	catch {
		return [];
	}
}

/**
 * Add to the page the nodes of a text made by copyNodes: at its end, where
 * who pastes takes them from. They get ids of their own. Returns the new
 * nodes: none when the text is not a copy.
 */

export function pasteNodes( doc: Document, text: string ): DNode[] {
	const nodes = readNodes( text );
	return nodes.length ? doc.addCopies( nodes ) : [];
}
