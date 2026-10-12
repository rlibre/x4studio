/**
 * @file pagetheme.ts
 * @description the theme the pages are shown with: the one of x4, not the one of the studio
 *
 * A page that is edited is made of x4 components, as the studio is. A
 * theme of x4 is a set of CSS variables, declared on the root of the
 * document: the studio declares its own there (dark), and a page shown as
 * it is would take them too. What is designed would look like the tool
 * that designs it.
 *
 * Declaring the main variables again on the page is not enough: x4 derives
 * most of the others from them (`--button-background: var(
 * --accent-background )`), on the root, where they get their value once
 * and for all. So every variable x4 declares on the root is declared again
 * on the page, as x4 wrote it: there, they get their value from each other.
 *
 * They are read from the stylesheets of the document: the rules whose
 * selector is ":root" and nothing else are those of x4. The studio writes
 * its own theme with another selector (":root:root", see theme.scss), so
 * that it is not taken with them.
 *
 * A browser does not let the rules of a stylesheet be read when the page
 * was opened from the disk (file://): the pages are then shown with the
 * theme of the studio, as before. Served by `x4js dev`, or by any server,
 * they have the theme of x4.
 */

/** the selector of the rules x4 declares its variables in */
const ROOT = ":root";

/**
 * The variables x4 declares on the root, with what it gives them, as it
 * wrote it ("var( --accent-background )"). None when they cannot be read.
 */

export function rootVariables( ): Map<string, string> {
	const declarations = new Map<string, string>( );

	for( const sheet of Array.from( document.styleSheets ) ) {
		let rules: CSSRule[];

		try {
			rules = Array.from( sheet.cssRules );
		}
		catch {
			// not readable: a stylesheet of another origin, or a page opened from the disk
			console.warn( "x4studio: the theme of x4 could not be read from a stylesheet; the pages are shown with the theme of the studio" );
			continue;
		}

		for( const rule of rules ) {
			if( !( rule instanceof CSSStyleRule ) || rule.selectorText.trim( ) !== ROOT ) {
				continue;
			}

			// the last one that is declared counts, as in the document
			for( let i = 0; i < rule.style.length; i++ ) {
				const name = rule.style[i];

				if( name.startsWith( "--" ) ) {
					declarations.set( name, rule.style.getPropertyValue( name ).trim( ) );
				}
			}
		}
	}

	return declarations;
}

/**
 * The stylesheet that gives the theme of x4 to what `scope` selects (a CSS
 * selector: what holds a page). "" when the variables cannot be read.
 */

export function pageTheme( scope: string, declarations = rootVariables( ) ): string {
	if( declarations.size === 0 ) {
		return "";
	}

	const lines = [...declarations].map( ( [name, value] ) => `\t${name}: ${value};\n` );

	// what x4 sets on the body with these variables is set again too: the
	// page would inherit what the body got from the theme of the studio
	return `${scope} {\n${lines.join( "" )}\tcolor: var( --text-primary );\n\tfont-family: var( --font-name );\n\tfont-size: var( --font-size );\n}\n\n`;
}
