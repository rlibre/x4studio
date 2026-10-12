/**
 * @file fields.ts
 * @description the fields of the inspector: a title, and what edits a value
 *
 * One kind of field per kind of value:
 *
 *   string    a text
 *   number    a number; emptied, the value is not set
 *   boolean   a box that is ticked
 *   color     a swatch that opens a picker, and its code; "no color" is not set
 *   options   up to four choices: small buttons side by side, the one that
 *             is down is the value, and a click on it takes it away;
 *             more: a list, whose first line is empty
 *   sides     the four sides of a box (a padding, a margin): a number for
 *             each, and a lock that makes them one
 *   icon      an icon of the project: a button that shows it, and opens
 *             the picker of the icons (see iconpicker.ts)
 *
 * A field that holds no value shows, dimmed, the one that applies anyway
 * (what a class says, what x4 does), when it is given one.
 */

import { Button, ColorInput, Component, HBox, Input, Menu, Select } from "x4js";
import type { MenuElement } from "x4js";

import type { PropertyOption, PropertyType } from "../core/registry.ts";

// the lock of the four sides: the one of the tree of the objects
import icons from "../icons.ts";

import { findIcon } from "../core/icons.ts";
import { sidesOf } from "../core/styles.ts";
import type { Sides } from "../core/styles.ts";

import { pickIcon } from "./iconpicker.ts";

/** what a field needs to know of what it edits: a property of a component, or a CSS property */
export interface FieldDef {
	name: string;
	title: string;

	/** the kind of value; "sides" is the four sides of a box (see makeSides), "icon" the name of an icon of the project */
	type: PropertyType | "sides" | "icon";

	min?: number;
	max?: number;
	step?: number;
	options?: PropertyOption[];

	/** takes half a row: two fields side by side */
	half?: boolean;

	/** type "color": colors that are offered in its picker, asked each time it opens */
	swatches?: ( ) => string[];
}

export interface Field {
	readonly def: FieldDef;

	/** the row: the title and the editor */
	readonly row: Component;

	/**
	 * Show a value; undefined for none. Nothing is done while the user is
	 * in the field. `applies` is what is shown, dimmed, when there is no
	 * value.
	 */
	set( value: unknown, applies?: string ): void;
}

/** above this number of choices, a list instead of buttons */
const MAX_BUTTONS = 4;

/**
 * What the browser says applies for the four sides of a box ("4px", "4px
 * 8px", up to four lengths, as CSS writes them: top, right, bottom, left),
 * as a number for each side. null when it cannot be read.
 */

function appliedSides( applies: string ): Sides {
	const values = ( applies ?? "" ).trim( ).split( /\s+/ ).map( part => parseFloat( part ) );

	if( values.length === 0 || values.length > 4 || values.some( value => isNaN( value ) ) ) {
		return null;
	}

	const top = values[0];
	const right = values[1] ?? top;
	const bottom = values[2] ?? top;
	const left = values[3] ?? right;

	return { left, top, right, bottom };
}

/**
 * The editor of the four sides of a box (a padding, a margin): a number
 * for the left, the top, the right and the bottom, and a lock. While it is
 * locked, the four sides are one value: what is typed in one goes to all,
 * and the value is one number. Unlocked, each side has its own, and the
 * value is an object (see Sides, core/styles.ts).
 */

function makeSides( def: FieldDef, change: ( value: unknown ) => void ): { editor: Component, set: ( value: unknown, applies?: string, force?: boolean ) => void } {
	let locked = true;
	let held: Sides = null;		// what the field holds; null for no value

	const emit = ( ) => {
		if( !held ) {
			change( undefined );
		}
		else if( locked ) {
			change( held.left );
		}
		else {
			change( { ...held } );
		}
	};

	// what was typed in the field of a side
	const typed = ( side: keyof Sides, input: Input ) => {
		const number = input.getNumValue( );
		const value = isNaN( number ) ? null : Math.min( def.max ?? Infinity, Math.max( def.min ?? -Infinity, number ) );

		if( locked ) {
			held = value === null ? null : { left: value, top: value, right: value, bottom: value };
		}
		else {
			held = { ...( held ?? { left: 0, top: 0, right: 0, bottom: 0 } ), [side]: value ?? 0 };

			// every field emptied: no value at all
			if( value === null && left.getValue( ) === "" && top.getValue( ) === "" && right.getValue( ) === "" && bottom.getValue( ) === "" ) {
				held = null;
			}
		}

		emit( );
		fill( undefined, false );
	};

	const makeSide = ( side: keyof Sides, title: string ): Input => {
		const input: Input = new Input( {
			type: "number",
			min: def.min,
			max: def.max,
			cls: "side",
			tooltip: title,
			change: ( ) => typed( side, input ),
		} );

		return input;
	};

	const left = makeSide( "left", "Left" );
	const top = makeSide( "top", "Top" );
	const right = makeSide( "right", "Right" );
	const bottom = makeSide( "bottom", "Bottom" );

	const lock = new Button( {
		cls: "outline icon lock",
		icon: icons.lock,
		tooltip: "The four sides at once",
		click: ( ) => {
			locked = !locked;

			// locked: every side takes the value of the left one
			if( locked && held ) {
				held = { left: held.left, top: held.left, right: held.left, bottom: held.left };
			}

			if( held ) {
				emit( );
			}

			fill( undefined, true );
		},
	} );

	// what applies without a value, shown in the fields that are empty
	let applied: Sides = null;

	const fillSide = ( input: Input, value: number, hint: number, letter: string, force: boolean ) => {
		input.setAttribute( "placeholder", hint === undefined ? letter : String( hint ) );

		if( force || !input.hasFocus( ) ) {
			input.setValue( value === undefined ? "" : String( value ) );
		}
	};

	const fill = ( applies: string, force: boolean ) => {
		if( applies !== undefined ) {
			applied = appliedSides( applies );
		}

		lock.setIcon( locked ? icons.lock : icons.unlock );
		lock.setClass( "down", locked );

		fillSide( left, held?.left, applied?.left, "L", force );
		fillSide( top, held?.top, applied?.top, "T", force );
		fillSide( right, held?.right, applied?.right, "R", force );
		fillSide( bottom, held?.bottom, applied?.bottom, "B", force );
	};

	return {
		editor: new HBox( { cls: "sides", content: [lock, left, top, right, bottom] } ),

		// One number: the sides are locked together. An object: each has
		// its own. No value: the lock stays as the user left it.
		set: ( value, applies, force ) => {
			held = sidesOf( value );

			if( held ) {
				locked = typeof value === "number";
			}

			fill( applies ?? "", !!force );
		},
	};
}

/**
 * A field for a value. `change` is called each time the user changes it,
 * with undefined when he takes the value away. `menu` is what its menu
 * (right click) has after "Reset": asked each time it opens.
 */

export function makeField( def: FieldDef, change: ( value: unknown ) => void, menu?: ( ) => MenuElement[] ): Field {
	let editor: Component;

	// `force`: even while the user is in the field (he just asked to reset it)
	let set: ( value: unknown, applies?: string, force?: boolean ) => void;

	switch( def.type ) {
		case "number": {
			const input = new Input( {
				type: "number",
				min: def.min,
				max: def.max,
				step: def.step,
				change: ( ) => {
					const value = input.getNumValue( );
					change( isNaN( value ) ? undefined : Math.min( def.max ?? Infinity, Math.max( def.min ?? -Infinity, value ) ) );
				},
			} );

			editor = input;
			set = ( value, applies, force ) => {
				input.setAttribute( "placeholder", applies ?? null );

				if( force || !input.hasFocus( ) ) {
					input.setValue( typeof value === "number" ? String( value ) : "" );
				}
			};
			break;
		}

		case "boolean": {
			const input = new Input( {
				type: "checkbox",
				change: ( ) => change( input.getCheck( ) ),
			} );

			editor = input;
			set = value => input.setCheck( value === true );
			break;
		}

		case "color": {
			const input = new ColorInput( {
				color: null,
				format: "hex",
				picker: true,
				nullable: true,
				swatches: def.swatches,
				change: ev => change( ev.value ?? undefined ),
			} );

			editor = input;
			set = ( value, applies, force ) => {
				// What applies without a value, for a stylesheet that shows
				// it in the swatch (see themepanel.scss).
				// (an empty value takes the variable away)
				input.setStyleVariable( "--applies", applies ? applies : "" );

				if( force || !input.dom.contains( document.activeElement ) ) {
					input.setColor( typeof value === "string" ? value : null );
				}
			};
			break;
		}

		case "options": {
			const options = def.options ?? [];

			if( options.length <= MAX_BUTTONS ) {
				let current: unknown;

				// its icon when the choice has one, with its title as a tooltip; its title otherwise
				const buttons = options.map( option => new Button( {
					cls: option.icon ? "outline icon" : "outline",
					label: option.icon ? undefined : option.title,
					icon: option.icon,
					tooltip: option.icon ? option.title : option.value,
					click: ( ) => change( current === option.value ? undefined : option.value ),
				} ) );

				editor = new HBox( { cls: "choices", content: buttons } );
				set = value => {
					current = value;
					buttons.forEach( ( button, i ) => button.setClass( "down", options[i].value === value ) );
				};
			}
			else {
				const select = new Select( {
					items: [{ id: "", text: "" }, ...options.map( option => ( { id: option.value, text: option.title } ) )],
					value: "",
					change: ev => change( ev.value === "" ? undefined : ev.value ),
				} );

				editor = select;
				set = ( value, applies ) => {
					select.setAttribute( "title", applies ?? null );
					select.setValue( typeof value === "string" ? value : "" );
				};
			}
			break;
		}

		// An icon of the project: a button that shows it, with its name, and
		// opens the picker, where the icons are seen, to take another one, or none.
		case "icon": {
			let current: unknown;

			// A click on the button while the picker is open closes it, and
			// that is all. The picker closes by itself as soon as the button
			// of the mouse goes down outside of it: it was open if it closed
			// since this very press began.
			let closedAt = -1;
			let wasOpen = false;

			const button: Button = new Button( {
				cls: "outline pick",
				label: "",
				click: ( ) => {
					if( !wasOpen ) {
						pickIcon( button, current, change ).on( "closed", ( ) => { closedAt = performance.now( ); } );
					}
				},
				dom_events: {
					pointerdown: ev => { wasOpen = closedAt >= ev.timeStamp; },
				},
			} );

			editor = button;
			set = value => {
				const icon = findIcon( value );
				current = value;

				// a name that no icon has anymore is still said: the icon may come back
				button.setIcon( icon ? icon.svg : null );
				button.setText( icon ? icon.name : typeof value === "string" && value ? `${value} (missing)` : "(none)" );
			};
			break;
		}

		case "sides": {
			const sides = makeSides( def, change );

			editor = sides.editor;
			set = sides.set;
			break;
		}

		default: {
			const input = new Input( {
				type: "text",
				change: ( ) => change( input.getValue( ) === "" ? undefined : input.getValue( ) ),
			} );

			editor = input;
			set = ( value, applies, force ) => {
				input.setAttribute( "placeholder", applies ?? null );

				if( force || !input.hasFocus( ) ) {
					input.setValue( value === undefined || value === null ? "" : String( value ) );
				}
			};
			break;
		}
	}

	editor.addClass( "editor" );

	// what the field holds, and what applies without it: for its menu
	let held: unknown;
	let applied: string;

	const show = ( value: unknown, applies?: string ) => {
		held = value;
		applied = applies;
		set( value, applies );
	};

	// A right click on the field, its title or its editor: a menu that
	// takes the value away. The field then shows what applies again.
	const row = new Component( {
		cls: def.half ? `field half ${def.type}` : `field ${def.type}`,
		content: [
			new Component( { tag: "span", cls: "title", content: def.title } ),
			editor,
		],
		dom_events: {
			contextmenu: ev => {
				ev.preventDefault( );
				ev.stopPropagation( );

				new Menu( {
					items: [ {
						text: "Reset",
						disabled: held === undefined || held === null || held === "",
						click: ( ) => {
							change( undefined );

							// the user may be in the field: it is emptied all the same
							held = undefined;
							set( undefined, applied, true );
						},
					}, ...( menu ? menu( ) : [] ) ],
				} ).displayAt( ev.clientX, ev.clientY );
			},
		},
	} );

	return { def, row, set: show };
}
