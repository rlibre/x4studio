/**
 * @file themepanel.ts
 * @description the theme of the project: a color for each thing that has one
 *
 * A tool of the studio, with two tabs (Etienne, 2026-10-12: "a theme tool,
 * two tabs: main theme, controls").
 *
 * "Main theme":
 *
 * A line for each color a theme may set, as they are described (see
 * core/theme.ts): its color, and the name of what it is the color of. A
 * line that sets nothing shows, dimmed, the color that applies: the one
 * x4 gives, or the one that comes from the other lines (the background is
 * a shade of the primary scale).
 *
 * The primary scale can be made from one color, its base: every shade is
 * then computed, as x4 computes its own.
 *
 * "Controls": the variables of each control, as x4 declares them. A group
 * for each control, whose lines are made when it is opened. There are
 * hundreds of them: a field keeps the lines whose name holds what is typed.
 * A variable that is a color has the picker of the others; any other one
 * is typed.
 *
 * "From image" takes the colors that count most in a picture (a logo, a
 * screenshot): a click on one of them, then on the name of a line, gives
 * it to that line, once. They are also offered in the picker of every
 * line, before the shades of the primary scale as they are now.
 */

import { Button, Component, FileDialog, HBox, Icon, Input, Label, Tabs, VBox } from "x4js";
import type { ComponentProps, MenuElement } from "x4js";

import icons from "../icons.ts";

import { dominantColors, getThemeColors, isColor, isScaleColor, isValue, scaleOf } from "../core/theme.ts";
import type { Theme, ThemeColor } from "../core/theme.ts";

import { makeField } from "./fields.ts";
import type { Field } from "./fields.ts";

import "./themepanel.scss";

/** the colors that are taken from a picture, at most */
const IMAGE_COLORS = 8;

/** a picture is looked at this small: its colors are the same, and there are fewer pixels to count */
const IMAGE_SIZE = 96;

/** the variables of a control make one group; above this number, one for each second word of their name (the palettes of colors) */
const BIG_GROUP = 40;

/** a line of a group: a variable, and what shows it once it is made */
interface Line {
	name: string;

	/** what the filter looks into, in lower case */
	text: string;

	make: ( ) => Component;
	row?: Component;
}

interface Group {
	/** of the variables of a control: the filter looks into these */
	control: boolean;

	lines: Line[];
	section: Component;
	body: Component;

	/** its lines exist: those of a group that starts folded are made when it is opened */
	made: boolean;
}

export interface ThemePanelProps extends ComponentProps {
	/** the user changed the theme: the host shows it, and gives it back (setTheme) */
	change: ( theme: Theme ) => void;

	/**
	 * The color that applies to a variable in the pages, as CSS writes it;
	 * "" when it is not known. Shown, dimmed, on a line that sets nothing.
	 */
	applied: ( name: string ) => string;

	/**
	 * The names of the variables x4 declares. Those that are not among the
	 * lines that are described are offered too, control by control.
	 */
	variables: string[];
}

export class ThemePanel extends VBox<ThemePanelProps> {

	private theme: Theme = { values: {} };

	private fields = new Map<string, Field>( );		// by the name of their variable
	private base: Field;							// the color the scale is made from
	private groups: Group[] = [];
	private filter: Input;
	private main: Component;						// what the first tab shows

	private picked: Component;						// the colors of the picture
	private hint: Label;
	private colors: string[] = [];
	private armed: string = null;					// the one that was clicked, and waits for a line

	constructor( props: ThemePanelProps ) {
		super( props );

		this.addClass( "themepanel" );

		const picker = new FileDialog( {
			accept: "image/*",
			callback: files => {
				if( files.length ) {
					void this.fromImage( files[0] );
				}
			},
		} );

		// the theme as a whole
		this.main = new VBox( {
			cls: "themeview",
			content: [
				new HBox( {
					cls: "bar",
					content: [
						new Button( { cls: "outline", label: "From image...", tooltip: "Take the colors of a picture: a logo, a screenshot", click: ( ) => picker.showDialog( ) } ),
						new Button( { cls: "outline", label: "Reset", tooltip: "Take everything away, what is set for the controls too: the theme of x4", click: ( ) => this.emit( { values: {} } ) } ),
					],
				} ),

				this.picked = new HBox( { cls: "picked", hidden: true } ),
				this.hint = new Label( { cls: "hint", hidden: true, text: "" } ),

				new Component( { cls: "groups", flex: 1, content: this.makeGroups( ) } ),
			],
		} );

		// control by control
		const controls = new VBox( {
			cls: "themeview",
			content: [
				this.filter = new Input( {
					type: "text",
					cls: "filter",
					placeholder: "Filter: button, border...",
					spellcheck: false,
					dom_events: { input: ( ) => this.applyFilter( ) },
				} ),

				new Component( { cls: "groups", flex: 1, content: this.makeControls( ) } ),
			],
		} );

		this.setContent( [
			new Tabs( {
				cls: "inline",
				flex: true,
				default: "main",
				items: [
					{ name: "main", title: "Main theme", content: this.main },
					{ name: "controls", title: "Controls", content: controls },
				],
			} ),

			// to choose a picture: not seen
			picker,
		] );
	}

	/**
	 * Show a theme. Called by the host once the pages have it: what
	 * applies to the lines that set nothing is read then.
	 */

	setTheme( theme: Theme ): void {
		this.theme = theme;

		for( const [name, field] of this.fields ) {
			field.set( theme.values[name], this.props.applied( name ) );
		}

		this.base.set( theme.base );
	}

	/**
	 * A color as CSS writes it ("rgb(47% 69% 87%)"), as the theme keeps
	 * one: "#rrggbb". null for what is not an opaque color. A canvas says
	 * it: it gives back the color it is given, written that way.
	 */

	private hexOf( css: string ): string {
		if( !css ) {
			return null;
		}

		const context = document.createElement( "canvas" ).getContext( "2d" );
		const before = context.fillStyle = "#010203";

		context.fillStyle = css;

		// left as it was: what it was given is not a color
		const hex = context.fillStyle;
		return isColor( hex ) && ( hex !== before || css.trim( ) === before ) ? hex : null;
	}

	/**
	 * What the picker of a line offers: the colors of the picture, then
	 * the shades of the primary scale as the pages have them now.
	 */

	private swatches( ): string[] {
		const offered = [...this.colors];

		for( const color of getThemeColors( ) ) {
			if( isScaleColor( color ) ) {
				const shade = this.theme.values[color.name] ?? this.hexOf( this.props.applied( color.name ) );

				if( shade && !offered.includes( shade ) ) {
					offered.push( shade );
				}
			}
		}

		return offered;
	}

	private emit( theme: Theme ): void {
		this.theme = theme;
		this.props.change( theme );
	}

	/** the theme with a value for a variable, or without it */
	private withValue( name: string, value: unknown ): Theme {
		const values = { ...this.theme.values };

		if( isValue( value ) ) {
			values[name] = value;
		}
		else {
			delete values[name];
		}

		return { ...this.theme, values };
	}

	// :: THE LINES :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * A group: a title that folds it, and its lines. The lines of a group
	 * that starts folded are only made when it is opened, or when the
	 * filter looks into it.
	 */

	private makeGroup( title: string, lines: Line[], control: boolean ): Component {
		// folded at first: its lines are made when it is opened
		const folded = true;
		const group: Group = { control, lines, section: null, body: new Component( { cls: "body" } ), made: false };

		group.section = new Component( {
			cls: folded ? "group folded" : "group",
			content: [
				new HBox( {
					cls: "head",
					dom_events: {
						click: ( ) => {
							group.section.toggleClass( "folded" );

							if( !group.section.hasClass( "folded" ) ) {
								this.fill( group );
							}
						},
					},
					content: [
						new Label( { cls: "title", flex: true, text: title } ),
						new Icon( { cls: "fold", iconId: icons.chevron } ),
					],
				} ),
				group.body,
			],
		} );

		this.groups.push( group );

		if( !folded ) {
			this.fill( group );
		}

		return group.section;
	}

	/** make the lines of a group, the first time they are to be seen, with what the theme sets */
	private fill( group: Group ): void {
		if( group.made ) {
			return;
		}

		group.made = true;

		for( const line of group.lines ) {
			line.row = line.make( );

			const field = this.fields.get( line.name );
			if( field ) {
				field.set( this.theme.values[line.name], this.props.applied( line.name ) );
			}
		}

		group.body.setContent( group.lines.map( line => line.row ) );
	}

	/**
	 * Keep the lines whose name holds what is typed in the filter, and the
	 * groups that have some: they are opened. With nothing typed,
	 * everything is there again.
	 */

	private applyFilter( ): void {
		const text = this.filter.getValue( ).trim( ).toLowerCase( );

		for( const group of this.groups.filter( g => g.control ) ) {
			const found = text === "" ? group.lines : group.lines.filter( line => line.text.includes( text ) );

			group.section.show( found.length > 0 );

			if( text !== "" && found.length ) {
				group.section.setClass( "folded", false );
				this.fill( group );
			}

			if( group.made ) {
				group.lines.forEach( line => line.row.show( found.includes( line ) ) );
			}
		}
	}

	/**
	 * The lines that are described, in the groups their descriptions give,
	 * in their order. The group of the scale starts with its base color.
	 */

	private makeGroups( ): Component[] {
		const groups: { title: string, colors: ThemeColor[] }[] = [];

		for( const color of getThemeColors( ) ) {
			const title = color.group ?? "Colors";
			let group = groups.find( g => g.title === title );

			if( !group ) {
				groups.push( group = { title, colors: [] } );
			}

			group.colors.push( color );
		}

		// the base color: asked once, wherever the shades are
		this.base = makeField( { name: "base", title: "Base color", type: "color", swatches: ( ) => this.colors }, value => this.setBase( value ), ( ) => this.scaleMenu( ) );
		this.base.row.addClass( "base" );
		this.base.row.setAttribute( "title", "The primary scale is made from this color: every shade is computed from it" );

		return groups.map( group => {
			const lines: Line[] = group.colors.map( color => ( { name: color.name, text: `${color.name} ${color.title} ${group.title}`.toLowerCase( ), make: ( ) => this.makeLine( color ) } ) );

			if( group.colors.some( isScaleColor ) ) {
				lines.unshift( { name: "base", text: "base color", make: ( ) => this.base.row } );
			}

			return this.makeGroup( group.title, lines, false );
		} );
	}

	/**
	 * The variables of each control: those x4 declares and that are not
	 * described. A control is the first word of their name ("--button-
	 * background-hover" is of "button"); a word that has too many of them
	 * is told apart by the second one ("color-gray", "color-blue": the
	 * palettes). None when the variables of x4 could not be read.
	 */

	private makeControls( ): Component[] {
		const described = new Set( getThemeColors( ).map( color => color.name ) );
		const names = this.props.variables.filter( name => !described.has( name ) ).sort( );

		if( names.length === 0 ) {
			return [new Component( { cls: "none", content: "The variables of x4 could not be read from its stylesheets." } )];
		}

		const sort = ( list: string[], words: number ): Map<string, string[]> => {
			const groups = new Map<string, string[]>( );

			for( const name of list ) {
				const key = name.replace( /^--/, "" ).split( "-" ).slice( 0, words ).join( "-" );
				groups.set( key, [...( groups.get( key ) ?? [] ), name] );
			}

			return groups;
		};

		const controls: [string, string[]][] = [];

		for( const [key, list] of sort( names, 1 ) ) {
			controls.push( ...( list.length > BIG_GROUP ? sort( list, 2 ) : [[key, list] as [string, string[]]] ) );
		}

		return controls.map( ( [key, list] ) => this.makeGroup( key, list.map( name => ( { name, text: name.toLowerCase( ), make: ( ) => this.makeVariable( name, key ) } ) ), true ) );
	}

	/**
	 * The line of a variable of a control. What applies to it says what it
	 * is: a color has the picker of the others, anything else is typed.
	 */

	private makeVariable( name: string, control: string ): Component {
		const short = name.replace( /^--/, "" );

		const field = makeField(
			{
				name,
				title: short.startsWith( `${control}-` ) ? short.slice( control.length + 1 ) : short,
				type: this.hexOf( this.props.applied( name ) ) ? "color" : "string",
				swatches: ( ) => this.swatches( ),
			},
			value => this.emit( this.withValue( name, value ) ),
		);

		this.fields.set( name, field );
		field.row.setAttribute( "title", name );

		return field.row;
	}

	private makeLine( color: ThemeColor ): Component {
		const field = makeField(
			{ name: color.name, title: color.title, type: "color", swatches: ( ) => this.swatches( ) },
			value => this.emit( this.withValue( color.name, value ) ),
			isScaleColor( color ) ? ( ) => this.scaleMenu( ) : undefined,
		);

		this.fields.set( color.name, field );

		// the name of the variable, for who writes CSS
		field.row.setAttribute( "title", color.name );

		// A color of the picture was clicked: a click on the name of the
		// line gives it, to that line and no other. For another line, the
		// color is clicked again.
		//
		// On the name itself, not on the row: x4 calls the handlers of a
		// click from what was clicked up to the top, and does it again for
		// each element on the way that listens to clicks. With a listener
		// on the row, a click on the swatch of the line opened its picker
		// twice: the second one was never closed, nor any picker after it.
		field.row.query( ".title" ).addDOMEvent( "click", ( ) => {
			if( this.armed ) {
				const taken = this.armed;

				this.arm( null );
				this.emit( this.withValue( color.name, taken ) );
			}
		} );

		return field.row;
	}

	// :: THE SCALE :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * A base color: the scale is made from it. Taken away, the shades stay
	 * as they are: they are colors as the others.
	 */

	private setBase( value: unknown ): void {
		if( !isColor( value ) ) {
			this.emit( { values: { ...this.theme.values } } );
			return;
		}

		this.emit( { base: value, values: { ...this.theme.values, ...scaleOf( value ) } } );
	}

	/** in the menu of the lines of the scale, and of the base color */
	private scaleMenu( ): MenuElement[] {
		const base = this.theme.base;

		return [
			"-",
			{
				text: "Make the scale from the base color",
				disabled: !base,
				click: ( ) => this.setBase( base ),
			},
			{
				text: "Reset the scale",
				click: ( ) => {
					const values = { ...this.theme.values };

					for( const color of getThemeColors( ) ) {
						if( isScaleColor( color ) ) {
							delete values[color.name];
						}
					}

					this.emit( { values } );
				},
			},
		];
	}

	// :: FROM A PICTURE ::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * The colors of a picture: it is drawn small, and its pixels are
	 * counted (see dominantColors).
	 */

	private async fromImage( file: File ): Promise<void> {
		const url = URL.createObjectURL( file );

		try {
			const image = new Image( );

			await new Promise<void>( ( resolve, reject ) => {
				image.onload = ( ) => resolve( );
				image.onerror = ( ) => reject( new Error( "not a picture" ) );
				image.src = url;
			} );

			// an svg may have no size of its own
			const width = image.naturalWidth || IMAGE_SIZE;
			const height = image.naturalHeight || IMAGE_SIZE;
			const scale = Math.min( 1, IMAGE_SIZE / Math.max( width, height ) );

			const canvas = document.createElement( "canvas" );
			canvas.width = Math.max( 1, Math.round( width * scale ) );
			canvas.height = Math.max( 1, Math.round( height * scale ) );

			const context = canvas.getContext( "2d" );
			context.drawImage( image, 0, 0, canvas.width, canvas.height );

			this.showColors( dominantColors( context.getImageData( 0, 0, canvas.width, canvas.height ).data, IMAGE_COLORS ), file.name );
		}
		catch {
			this.showColors( [], file.name );
		}
		finally {
			URL.revokeObjectURL( url );
		}
	}

	private showColors( colors: string[], from: string ): void {
		this.colors = colors;

		this.picked.setContent( [
			...colors.map( color => new Component( {
				cls: "swatch",
				style: { backgroundColor: color },
				attrs: { title: color, "data-color": color },

				// a second click lets it go
				dom_events: { click: ( ) => this.arm( this.armed === color ? null : color ) },
			} ) ),

			new Component( { flex: 1 } ),

			// done with the picture: its colors are put away, here and in the pickers
			new Button( { cls: "outline", label: "Close", tooltip: "Put these colors away", click: ( ) => this.putAway( ) } ),
		] );

		this.picked.show( colors.length > 0 );
		this.hint.show( true );

		this.arm( null );

		if( colors.length === 0 ) {
			this.hint.setText( `No color could be taken from "${from}".` );
		}
	}

	/**
	 * The color of the picture that waits for a line; null for none. It
	 * waits for one line: given, it does not wait anymore.
	 */

	private arm( color: string ): void {
		this.armed = color;

		for( const swatch of this.picked.queryAll( ".swatch" ) ) {
			swatch.setClass( "armed", color !== null && swatch.getAttribute( "data-color" ) === color );
		}

		this.main.setClass( "arming", color !== null );
		this.hint.setText( color ? "Now click the name of a line: it takes this color. Click the color again to give up." : "Click a color, then the name of a line." );
	}

	private putAway( ): void {
		this.colors = [];
		this.arm( null );

		this.picked.show( false );
		this.hint.show( false );
	}
}
