/**
 * @file itemtools.ts
 * @description the part of the palette that offers the items of what is selected
 *
 * An item cannot be used by itself: it only exists in the component it is
 * an item of (the usual buttons of a BtnGroup, the items of a Listbox). It
 * is not in the palette with the components: its button is here, and is
 * there while its owner is selected, or one of the children of its owner.
 *
 * A click adds the item where a component would go: into the owner that is
 * selected, or after the child that is.
 */

import { BoxProps, Button, HBox } from "x4js";

import type { EditorSurface } from "./editor.ts";

import { itemsOf } from "../core/components.ts";

interface ItemToolsProps extends BoxProps {
	surface: EditorSurface;
}

export class ItemTools extends HBox<ItemToolsProps> {

	// the items the buttons were built for
	private builtFor: string = null;

	constructor( props: ItemToolsProps ) {
		super( { ...props, hidden: true } );

		props.surface.on( "selectionChange", ( ) => this.update( ) );
		props.surface.on( "change", ( ) => this.update( ) );

		this.update( );
	}

	/**
	 * Make the buttons again when what is selected has other items than
	 * before. Also to call after the descriptions of the components changed.
	 */

	update( force = false ): void {
		const surface = this.props.surface;
		const selection = surface.getSelection( );
		const node = selection[selection.length - 1];

		// what is selected, when it has items; else the one that holds it
		const owner = !node ? null : itemsOf( node.type ).length ? node : surface.doc.parentOf( node );
		const items = owner ? itemsOf( owner.type ) : [];

		const key = items.map( item => item.type ).join( " " );
		if( force || key !== this.builtFor ) {
			this.builtFor = key;

			this.setContent( items.map( item => new Button( {
				cls: "outline",
				icon: item.icon,
				tooltip: item.description ? `${item.title}: ${item.description}` : item.title,
				click: ( ) => surface.createObject( item.type ),
			} ) ) );
		}

		this.show( items.length > 0 );
	}
}
