import findNode from './findNode';
import { fmtKeys } from './treeConfig';

// Produce a human-readable explanation for a structural stage so the
// operation log records *why* a split / merge / borrow occurred, not just
// that one happened. Returns null when the stage is already covered by
// the headline "Inserted X" / "Deleted X" message.
export default function describeStage(stage) {
  const { kind, snapshot: snap, focusIds = [], meta } = stage;
  switch (kind) {
    case 'leaf-insert':
    case 'leaf-delete':
      return null;

    case 'overflow': {
      const n = findNode(snap, meta?.nodeId);
      if (!n) return 'Node overflowed.';
      const median = n.keys[meta.medianIndex];
      return `Overflow ${fmtKeys(n.keys)} — median ${median} will be promoted.`;
    }

    case 'split': {
      const left = findNode(snap, meta?.leftId);
      const right = findNode(snap, meta?.rightId);
      if (!left || !right) return 'Split: median promoted, right half became new sibling.';
      return `Split → left ${fmtKeys(left.keys)} · median promoted to parent · right ${fmtKeys(right.keys)}.`;
    }

    case 'root-split': {
      const left = snap.children?.[0];
      const right = snap.children?.[1];
      return `Root split — tree grew one level. New root ${fmtKeys(snap.keys)} over ${fmtKeys(left?.keys || [])} and ${fmtKeys(right?.keys || [])}.`;
    }

    case 'borrow-left': {
      const child = findNode(snap, focusIds[2]);
      const sib = findNode(snap, focusIds[1]);
      return `Borrow from left sibling: child became ${fmtKeys(child?.keys || [])}, sibling now ${fmtKeys(sib?.keys || [])}.`;
    }

    case 'borrow-right': {
      const child = findNode(snap, focusIds[2]);
      const sib = findNode(snap, focusIds[1]);
      return `Borrow from right sibling: child became ${fmtKeys(child?.keys || [])}, sibling now ${fmtKeys(sib?.keys || [])}.`;
    }

    case 'merge': {
      const merged = findNode(snap, focusIds[1]);
      return `Merge — both siblings at minimum, pulled separator down. Merged node now ${fmtKeys(merged?.keys || [])}.`;
    }

    case 'merge-drop': {
      const merged = findNode(snap, focusIds[1]);
      return `Merged two minimum children, dropping the separator (the deleted key). Merged node now ${fmtKeys(merged?.keys || [])}.`;
    }

    case 'replace-pred': {
      const lc = findNode(snap, focusIds[1]);
      return `Internal key replaced by in-order predecessor from left subtree ${fmtKeys(lc?.keys || [])}; now recursing to remove it from the leaf.`;
    }

    case 'replace-succ': {
      const rc = findNode(snap, focusIds[1]);
      return `Internal key replaced by in-order successor from right subtree ${fmtKeys(rc?.keys || [])}; now recursing to remove it from the leaf.`;
    }

    case 'root-collapse':
      return `Root collapsed — only child promoted to root ${fmtKeys(snap.keys)}. Tree shrank one level.`;

    default:
      return null;
  }
}
