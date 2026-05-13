// Geometry and timing constants used by the layout and rendering modules.

export const MIN_KEY_W = 44;       // floor so single-digit keys read well
export const KEY_FONT_PX = 14;
// Monospace advance for the rendering font (JetBrains Mono / Fira Code at
// KEY_FONT_PX), slightly generous so wide glyphs do not kiss the
// vertical dividers.
export const KEY_CHAR_W = 8.6;
export const KEY_H_PAD = 14;       // 7px breathing room on each side
export const KEY_H = 36;
export const NODE_PAD = 8;
export const LEVEL_GAP = 90;       // horizontal-orientation level pitch
export const SIBLING_GAP = 28;
export const STEP_MS = 720;
export const MARGIN = 20;
// Extra room above/left of the canvas so the traversal chip (drawn
// outside the node) is not clipped behind the status / stage banner.
export const TOP_MARGIN = 72;
export const LEFT_MARGIN = 96;

export const CHIP_W = 44;
export const CHIP_H = 28;
