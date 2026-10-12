/**
 * @file iconpicker.ts
 * @description the icons of the project, to pick one from
 *
 * A project may have many icons, and a name does not say what one looks
 * like: they are shown as they are drawn, in a grid, each with its name
 * under it. A field keeps those whose name holds what is typed.
 */

import { Button, Component, Input, Popup } from "x4js";

import { getIcons } from "../core/icons.ts";

import "./iconpicker.scss";

/**
 * Open the picker under a component: the field that asks for an icon.
 *
 * @param current the name of the icon the field holds: its tile is shown down
 * @param pick called with the name of the icon that is clicked, undefined for "no icon"
 * @returns the popup, which closes by itself: who asks may want to know when
 */

export function pickIcon( anchor: Component, current: unknown, pick: ( name: string ) => void ): Popup {
	let popup: Popup = null;

	// the first of those that are shown: the one Enter picks
	let first: string = null;

	const choose = ( name: string ) => {
		popup.close( );
		pick( name );
	};

	const tiles = new Component( { cls: "tiles" } );

	const fill = ( ) => {
		const text = filter.getValue( ).trim( ).toLowerCase( );
		const all = getIcons( );
		const shown = all.filter( icon => icon.name.toLowerCase( ).includes( text ) );

		first = shown.length ? shown[0].name : null;

		const content: Component[] = [];

		// "no icon" is a choice as the others, while nothing is looked for
		if( text === "" ) {
			content.push( new Button( { cls: current ? "outline tile none" : "outline tile none down", label: "(none)", click: ( ) => choose( undefined ) } ) );
		}

		for( const icon of shown ) {
			content.push( new Button( {
				cls: icon.name === current ? "outline tile down" : "outline tile",
				icon: icon.svg,
				label: icon.name,
				tooltip: icon.name,
				click: ( ) => choose( icon.name ),
			} ) );
		}

		if( shown.length === 0 ) {
			content.push( new Component( { cls: "nothing", content: all.length ? "No icon has this name." : "The project has no icon yet." } ) );
		}

		tiles.setContent( content );
	};

	const filter = new Input( {
		type: "text",
		placeholder: "Filter",
		spellcheck: false,
		dom_events: {
			input: ( ) => fill( ),
			keydown: ev => {
				if( ev.key === "Enter" && first ) {
					choose( first );
				}
				else if( ev.key === "Escape" ) {
					popup.close( );
				}
			},
		},
	} );

	fill( );

	popup = new Popup( { cls: "iconpicker", autoClose: true, content: [filter, tiles] } );
	popup.displayNear( anchor.getBoundingRect( ), "top left", "bottom left", { x: 0, y: 4 } );

	filter.focus( );

	return popup;
}
