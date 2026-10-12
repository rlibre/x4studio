/**
 * @file theme.ts
 * @description the theme of a project: the colors of its application
 *
 * A theme of x4 is a set of CSS variables, declared on the root of the
 * document. The theme of a project gives a color to some of them; the
 * others keep the one x4 gives them. It is kept in `.x4studio/theme.json`:
 *
 *   {
 *     "format": "x4studio/theme", "version": 1,
 *     "base": "#c8553d",
 *     "values": { "--color-primary-a50": "#c8553d", "--border": "#dddddd" }
 *   }
 *
 * and generated as a stylesheet, which the application imports once:
 *
 *   :root {
 *       --color-primary-a50: #c8553d;
 *       --border: #dddddd;
 *   }
 *
 * The studio does not know the variables of x4. Those that make the theme
 * as a whole are described to it, as the components are (the "theme" of
 * src/components.json): a variable of the primary scale says how far it is
 * from the base color, in lightness, and the scale is then made from one
 * color, as x4 makes its own. The others, those of each control, are read
 * from the stylesheets of x4 by who shows them: a theme may set any
 * variable, and not only colors (a radius, a width).
 *
 * (no DOM here: this file runs as is under node, for the tests)
 */

/** says what the JSON is, and how it is laid out */
const FORMAT = "x4studio/theme";
const VERSION = 1;

/** a color the theme may set, as its description gives it */
export interface ThemeColor {
	/** the CSS variable: "--accent-background" */
	name: string;

	/** what it is the color of */
	title: string;

	/** the title of the group it is shown in */
	group?: string;

	/**
	 * It is a shade of the base color: this much lighter (darker, below
	 * 0), in points of lightness. 0 is the base color itself.
	 */
	shade?: number;

	/** in a scale made from a base color, it is this color whatever the base: the white and the black at its ends */
	fixed?: string;
}

export interface Theme {
	/** the color the primary scale was made from, when it was */
	base?: string;

	/** what the variables are given, by their name: colors for most, any CSS value otherwise */
	values: Record<string, string>;
}

let colors: ThemeColor[] = [];

function isObject( value: unknown ): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray( value );
}

/** a variable is named as CSS names one; nothing else can be written in a stylesheet with it */
function isVariable( name: unknown ): name is string {
	return typeof name === "string" && /^--[A-Za-z0-9_-]+$/.test( name );
}

/** a color as the theme keeps one: #rgb, #rrggbb, #rrggbbaa */
export function isColor( value: unknown ): value is string {
	return typeof value === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test( value );
}

/**
 * What a variable may be given: a CSS value on one line, with nothing that
 * could end the declaration, or the rule, it is written in.
 */

export function isValue( value: unknown ): value is string {
	return typeof value === "string" && value.trim( ) !== "" && /^[^;{}<>\\\n\r]{1,200}$/.test( value );
}

function isThemeColor( value: unknown ): value is ThemeColor {
	return isObject( value )
		&& isVariable( value.name )
		&& typeof value.title === "string"
		&& ( value.group === undefined || typeof value.group === "string" )
		&& ( value.shade === undefined || ( typeof value.shade === "number" && Number.isFinite( value.shade ) ) )
		&& ( value.fixed === undefined || isColor( value.fixed ) );
}

/**
 * The colors a JSON of descriptions gives (its "theme"): none when it
 * gives none. Throws when one of them cannot be understood.
 */

export function readThemeColors( data: unknown ): ThemeColor[] {
	const list = isObject( data ) ? data.theme : undefined;

	if( list === undefined ) {
		return [];
	}

	if( !Array.isArray( list ) ) {
		throw new Error( "theme: not a list of colors" );
	}

	list.forEach( ( color, i ) => {
		if( !isThemeColor( color ) ) {
			throw new Error( `theme: the color #${i + 1} (${isObject( color ) && typeof color.name === "string" ? color.name : "no name"}) cannot be understood` );
		}
	} );

	return list;
}

/** tell which colors a theme may set */
export function setThemeColors( list: ThemeColor[] ): void {
	colors = list;
}

export function getThemeColors( ): ThemeColor[] {
	return colors;
}

/**
 * The theme a text holds: the content of theme.json. One that sets
 * nothing for null. Throws when the text is not a theme. What is not the
 * name of a variable, or not a value one may have (see isValue), is left
 * out: it would be written in a stylesheet.
 */

export function readTheme( text: string ): Theme {
	if( text === null || text === undefined ) {
		return { values: {} };
	}

	let data: unknown;

	try {
		data = JSON.parse( text );
	}
	catch {
		throw new Error( "theme: not JSON" );
	}

	if( !isObject( data ) || data.format !== FORMAT || !isObject( data.values ) ) {
		throw new Error( "theme: not the theme of a project" );
	}

	const theme: Theme = { values: {} };

	if( isColor( data.base ) ) {
		theme.base = data.base;
	}

	for( const [name, value] of Object.entries( data.values ) ) {
		if( isVariable( name ) && isValue( value ) ) {
			theme.values[name] = value;
		}
	}

	return theme;
}

/** the theme, as theme.json keeps it */
export function writeTheme( theme: Theme ): string {
	const data: Record<string, unknown> = { format: FORMAT, version: VERSION };

	if( theme.base ) {
		data.base = theme.base;
	}

	data.values = theme.values;

	return `${JSON.stringify( data, null, "\t" )}\n`;
}

/** how the generated stylesheet starts */
export const THEME_HEADER = "/* GENERATED BY x4studio - DO NOT EDIT (the theme of the project is in .x4studio/theme.json) */\n\n";

/**
 * The theme as a rule: its variables, declared on what `selector` selects.
 * On the root for an application; the studio declares them on its pages
 * only. "" for a theme that sets nothing and a selector that is not the
 * root: there is nothing to say.
 */

export function themeCss( theme: Theme, selector = ":root" ): string {
	const lines = Object.entries( theme.values )
		.filter( ( [name, value] ) => isVariable( name ) && isValue( value ) )
		.map( ( [name, value] ) => `\t${name}: ${value};\n` );

	if( lines.length === 0 && selector !== ":root" ) {
		return "";
	}

	return `${selector} {\n${lines.join( "" )}}\n`;
}


// :: COLORS ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

/** the red, the green and the blue of a color, from 0 to 255; null for what is not a color */
function rgbOf( color: string ): [number, number, number] {
	if( !isColor( color ) ) {
		return null;
	}

	let hex = color.slice( 1 );

	// #rgb and #rgba: each digit twice
	if( hex.length <= 4 ) {
		hex = hex.split( "" ).map( digit => digit + digit ).join( "" );
	}

	return [parseInt( hex.slice( 0, 2 ), 16 ), parseInt( hex.slice( 2, 4 ), 16 ), parseInt( hex.slice( 4, 6 ), 16 )];
}

function hexOf( r: number, g: number, b: number ): string {
	const part = ( value: number ) => Math.max( 0, Math.min( 255, Math.round( value ) ) ).toString( 16 ).padStart( 2, "0" );
	return `#${part( r )}${part( g )}${part( b )}`;
}

/**
 * A color made lighter (darker, with a negative number) by a number of
 * points of lightness, its hue and its saturation kept. It is what Sass
 * calls `color.adjust( $color, $lightness: n% )`, which x4 makes its
 * primary scale with: the same numbers give the same colors.
 */

export function lighten( color: string, points: number ): string {
	const rgb = rgbOf( color );
	if( !rgb ) {
		return color;
	}

	const [r, g, b] = rgb.map( value => value / 255 );
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const delta = max - min;

	// to hue, saturation, lightness
	let h = 0;
	let l = ( max + min ) / 2;
	const s = delta === 0 ? 0 : delta / ( 1 - Math.abs( 2 * l - 1 ) );

	if( delta !== 0 ) {
		if( max === r ) {
			h = ( ( g - b ) / delta ) % 6;
		}
		else if( max === g ) {
			h = ( b - r ) / delta + 2;
		}
		else {
			h = ( r - g ) / delta + 4;
		}
	}

	l = Math.max( 0, Math.min( 1, l + points / 100 ) );

	// and back
	const c = ( 1 - Math.abs( 2 * l - 1 ) ) * s;
	const x = c * ( 1 - Math.abs( ( ( h % 2 ) + 2 ) % 2 - 1 ) );
	const m = l - c / 2;

	const sixth = ( ( Math.floor( h ) % 6 ) + 6 ) % 6;
	const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sixth];

	return hexOf( ( r1 + m ) * 255, ( g1 + m ) * 255, ( b1 + m ) * 255 );
}

/**
 * The scale a base color gives: a color for each variable that is a shade
 * of it, and for those that are the same whatever the base.
 */

export function scaleOf( base: string, list: ThemeColor[] = colors ): Record<string, string> {
	const values: Record<string, string> = {};

	if( !isColor( base ) ) {
		return values;
	}

	for( const color of list ) {
		if( color.fixed !== undefined ) {
			values[color.name] = color.fixed;
		}
		else if( color.shade !== undefined ) {
			values[color.name] = lighten( base, color.shade );
		}
	}

	return values;
}

/** true for a variable that is made from the base color */
export function isScaleColor( color: ThemeColor ): boolean {
	return color.shade !== undefined || color.fixed !== undefined;
}

/**
 * The colors of a picture that count most: those that cover most of it,
 * and that are not alike. `pixels` is what a canvas gives: four numbers a
 * pixel (red, green, blue, alpha), from 0 to 255.
 *
 * The colors are counted in boxes of 16 values a side (a logo has a few
 * flat colors, a screenshot the same ones with noise around them); a box
 * gives the average of what fell in it. The boxes are then taken from the
 * fullest one down, leaving out those that are close to one already taken.
 */

export function dominantColors( pixels: ArrayLike<number>, count: number ): string[] {
	const boxes = new Map<number, { n: number, r: number, g: number, b: number }>( );

	for( let i = 0; i + 3 < pixels.length; i += 4 ) {
		// what is see-through is not a color of the picture
		if( pixels[i + 3] < 128 ) {
			continue;
		}

		const r = pixels[i];
		const g = pixels[i + 1];
		const b = pixels[i + 2];
		const key = ( r >> 4 ) << 8 | ( g >> 4 ) << 4 | ( b >> 4 );

		const box = boxes.get( key );
		if( box ) {
			box.n++;
			box.r += r;
			box.g += g;
			box.b += b;
		}
		else {
			boxes.set( key, { n: 1, r, g, b } );
		}
	}

	const found = [...boxes.values( )]
		.sort( ( a, b ) => b.n - a.n )
		.map( box => [box.r / box.n, box.g / box.n, box.b / box.n] );

	// alike: closer than this, as a distance between the three numbers
	const NEAR = 48;
	const kept: number[][] = [];

	for( const color of found ) {
		if( kept.length >= count ) {
			break;
		}

		if( kept.every( other => Math.hypot( color[0] - other[0], color[1] - other[1], color[2] - other[2] ) >= NEAR ) ) {
			kept.push( color );
		}
	}

	return kept.map( ( [r, g, b] ) => hexOf( r, g, b ) );
}
