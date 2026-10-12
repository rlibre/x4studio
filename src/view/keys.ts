/**
 * @file keys.ts
 * @description the key of the commands, with the mouse
 *
 * The key of the commands is ctrl on Windows and Linux, and its own key on
 * a Mac (cmd), where ctrl is another key with its own uses (ctrl + click
 * opens the context menu).
 *
 * The shortcuts are those of x4 (addShortcut, shortcutText), which knows
 * that key as "Mod". What is here is for a click.
 */

/** a Mac, or what has its keyboard */
export const isMac = /mac|iphone|ipad/i.test( navigator.platform ?? "" );

/**
 * true when the key of the commands is down: cmd on a Mac, ctrl elsewhere.
 *
 * Not with alt: on Windows, AltGr is seen as ctrl + alt, and the keys it
 * gives are characters, not commands.
 */

export function isCommand( ev: KeyboardEvent | MouseEvent ): boolean {
	return ( isMac ? ev.metaKey : ev.ctrlKey ) && !ev.altKey;
}
