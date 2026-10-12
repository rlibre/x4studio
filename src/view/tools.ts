/**
 * @file tools.ts
 * @description the palette: one button per type of node that can be created
 *
 * A row of buttons, in an HBox: the host styles it, and makes it wrap if
 * it wants to.
 */

import { BoxProps, Button, HBox } from "x4js";

import { getObjectTypes } from "../core/registry.ts";
import type { EditorSurface } from "./editor.ts";

interface ToolsProps extends BoxProps {
	surface: EditorSurface;
}

/**
 *
 */

export class CreateTools extends HBox<ToolsProps> {

	constructor( props: ToolsProps ) {
		super( props );
		this.update( );
	}

	/**
	 * Make the buttons again, from the types that are registered now: to
	 * call after types were registered or forgotten.
	 */

	update( ): void {
		const types = getObjectTypes( ).filter( def => def.creatable !== false );

		this.setContent( types.map( def => new Button( {
			cls: "outline",
			icon: def.icon,
			tooltip: def.description ? `${def.title}: ${def.description}` : def.title,
			click: ( ) => this.props.surface.createObject( def.type ),
		} ) ) );
	}
}
