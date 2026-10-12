/**
 * @file icons.ts
 * @description the icons of the studio itself: those of its commands
 *
 * undo, redo and delete are those of the designer, copied: the two editors
 * do not import each other. The others were drawn for the studio.
 *
 * The icon of a component is not here: it comes with its description
 * (src/components.json).
 */

import undo from "./icons/undo.svg";
import redo from "./icons/redo.svg";
import remove from "./icons/delete.svg";
import before from "./icons/before.svg";
import after from "./icons/after.svg";

// the tree of the objects, the sections that fold, the lock of the four sides
import eye from "./icons/eye.svg";
import eyeOff from "./icons/eye-off.svg";
import lock from "./icons/lock.svg";
import unlock from "./icons/unlock.svg";
import chevron from "./icons/chevron.svg";
import group from "./icons/group.svg";

const icons = {
	undo,
	redo,
	remove,
	before,
	after,

	eye,
	eyeOff,
	lock,
	unlock,
	chevron,
	group,
};

export default icons;
