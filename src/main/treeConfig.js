import { BTree, BSTree } from '../trees';

// User-facing bounds on the B-tree order. The CLRS invariant max = 2 * min
// is enforced by validateOrder below; the special case min == max == 1
// switches to a binary search tree (a B-tree degenerates at that ratio).

export const DEFAULT_MIN = 2;
export const DEFAULT_MAX = 4;
export const MIN_KEYS_FLOOR = 1;   // t >= 2 (or BST when min == max == 1)
export const MIN_KEYS_CEIL = 16;   // t <= 17 (max = 32) — UI sanity cap

// Build the right tree variant for the given bounds. BSTree and BTree
// share the same public API so consumers do not branch on which is active.
export function makeTree(min, max, compare) {
  if (min === 1 && max === 1) return new BSTree(compare);
  return new BTree(min + 1, compare);
}

// Validate raw min/max inputs. Returns { ok, t, min, max, binary, error }.
export function validateOrder(rawMin, rawMax) {
  const min = Number.parseInt(rawMin, 10);
  const max = Number.parseInt(rawMax, 10);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { ok: false, error: 'Both fields must be integers.' };
  }
  if (min < MIN_KEYS_FLOOR) {
    return { ok: false, error: `Min keys must be >= ${MIN_KEYS_FLOOR}.` };
  }
  if (min > MIN_KEYS_CEIL) {
    return { ok: false, error: `Min keys must be <= ${MIN_KEYS_CEIL}.` };
  }
  if (min === 1 && max === 1) {
    return { ok: true, t: null, min: 1, max: 1, binary: true };
  }
  if (max <= min) {
    return {
      ok: false,
      error: 'Max keys must be greater than min keys (or set both to 1 for a binary tree).',
    };
  }
  if (max !== 2 * min) {
    return { ok: false, error: `Max keys must equal 2 × min (= ${2 * min}).` };
  }
  return { ok: true, t: min + 1, min, max, binary: false };
}

export const fmtKeys = (keys) => (keys?.length ? `[${keys.join(', ')}]` : '[]');
