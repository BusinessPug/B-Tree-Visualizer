// Shared helpers for trees that maintain parent pointers and a lazy
// snapshot cache.
//
// Every node carries `_dirty` and `_snap`. A mutation that touches a
// node's own keys / children / isLeaf must call `markDirty(node)`; that
// walks up the parent chain so every ancestor is also flagged. Snapshot
// rebuild is then lazy and skips clean subtrees, so a leaf-only edit
// rebuilds O(depth) snapshot objects instead of O(n).

export function markDirty(node) {
  let n = node;
  while (n && !n._dirty) {
    n._dirty = true;
    n = n.parent;
  }
}

export function setParent(child, parent) {
  if (child) child.parent = parent;
}

export function setParents(children, parent) {
  for (const c of children) setParent(c, parent);
}

// Recursive snapshot builder. Returns the cached snap for a clean node;
// otherwise builds a fresh snap whose `children` array reuses cached
// child snaps wherever possible (structural sharing).
export function snapshotNode(node) {
  if (!node._dirty && node._snap) return node._snap;
  const snap = {
    id: node.id,
    keys: [...node.keys],
    isLeaf: node.isLeaf,
    children: node.children.map(snapshotNode),
  };
  node._snap = snap;
  node._dirty = false;
  return snap;
}
