/**
 * @file box.ts
 * @description the box of a node: a position and a size
 *
 * A node of the studio has no place of its own: its component is where the
 * box that holds it puts it. Its box is not used, and is all zeros. The
 * page is the exception: the size of its box is the one it is shown at
 * when it does not take the room it is given.
 *
 * (it comes from the code the studio shared with the report designer,
 * where every object is placed by its box)
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * What of a box is read and written as properties of its node: see
 * getProp (registry.ts) and Document.setProps. A description cannot give
 * one of these names to a property of its own.
 */

const BOX_NAMES = ["x", "y", "w", "h"] as const;

export type BoxName = typeof BOX_NAMES[number];

export function isBoxName( name: string ): name is BoxName {
	return ( BOX_NAMES as readonly string[] ).includes( name );
}

/** smallest size a node can be given */
export const MIN_SIZE = 1;

/**
 * a box with nothing but its four numbers, the noise rounded off
 */

export function cleanBox( box: Box ): Box {
	const round = ( v: number ) => Math.round( v * 1e4 ) / 1e4 + 0;

	return { x: round( box.x ), y: round( box.y ), w: round( box.w ), h: round( box.h ) };
}
