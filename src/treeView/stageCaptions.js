// Short, user-facing captions for each structural stage kind. Used by the
// banner overlaid on the canvas during staged operations.
export const STAGE_CAPTION = {
  'leaf-insert':   'Inserted into leaf',
  'overflow':      'Node overflowed — median (highlighted) will bubble up',
  'split':         'Split: median promoted, right half becomes new sibling',
  'root-split':    'Root split — tree grew one level taller',
  'leaf-delete':   'Key removed from leaf',
  'replace-pred':  'Internal key replaced with predecessor',
  'replace-succ':  'Internal key replaced with successor',
  'borrow-left':   'Borrowed a key from left sibling via parent',
  'borrow-right':  'Borrowed a key from right sibling via parent',
  'merge':         'Merged underflowing child with sibling through parent key',
  'merge-drop':    'Merged two minimum children, dropping the separator',
  'root-collapse': 'Root collapsed — tree shrank one level',
};
