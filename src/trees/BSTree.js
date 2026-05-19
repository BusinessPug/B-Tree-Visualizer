// Binary Search Tree variant exposed for the "min = max = 1" case.
//
// A true B-tree degenerates when min == max == 1 (the upper bound would
// need to be 2 * min for splits/merges to balance). Binary mode is
// implemented as a simpler structure that shares the BTree public API
// (insert / delete / search / snapshot / insertPath / deletePath /
// stages), so the UI does not have to branch on which one is active.
//
// Each node has a `keys` array of length 1 and a `children` array — index
// 0 is the left subtree, 1 is the right. The stage kinds emitted here are
// a subset of the B-tree's: leaf-insert, leaf-delete, root-collapse,
// replace-succ.
//
// Nodes carry parent pointers and a lazy snapshot cache; see nodeOps.js.

import { defaultCompare } from './compare';
import { markDirty, setParent } from './nodeOps';

class BSTNode {
  constructor(key) {
    this.keys = [key];
    this.children = [];
    this.isLeaf = true;
    this.id = Math.random().toString(36).slice(2);
    this.parent = null;
    this._dirty = true;
    this._snap = null;
  }
}

export class BSTree {
  constructor(compare = defaultCompare) {
    this.root = null;
    this.compare = compare;
    this._stages = [];
    this._silent = false;
  }

  _stage(kind, focusIds = [], meta = null) {
    if (this._silent) return;
    this._stages.push({
      snapshot: this.snapshot(),
      kind,
      focusIds: [...focusIds],
      meta,
    });
  }

  // Returns null for an empty tree. Collapses empty child slots so the
  // renderer keeps left/right positions consistent even when one side is
  // empty. Caches the serialised form per live node.
  snapshot() {
    return serialise(this.root);
  }

  search(key) {
    const cmp = this.compare;
    const path = [];
    let cur = this.root;
    while (cur) {
      path.push({ nodeId: cur.id, keyIndex: 0, keys: [...cur.keys] });
      const c = cmp(key, cur.keys[0]);
      if (c === 0) return { found: true, nodeId: cur.id, keyIndex: 0, path };
      cur = c < 0 ? cur.children[0] : cur.children[1];
    }
    return { found: false, path };
  }

  insertPath(key) {
    const cmp = this.compare;
    const path = [];
    let cur = this.root;
    while (cur) {
      path.push({ nodeId: cur.id, keys: [...cur.keys] });
      const c = cmp(key, cur.keys[0]);
      if (c === 0) return path; // duplicate; caller blocks the insert
      const next = c < 0 ? cur.children[0] : cur.children[1];
      if (!next) return path;
      cur = next;
    }
    return path;
  }

  deletePath(key) {
    const cmp = this.compare;
    const path = [];
    let cur = this.root;
    while (cur) {
      const c = cmp(key, cur.keys[0]);
      const found = c === 0;
      path.push({
        nodeId: cur.id,
        keys: [...cur.keys],
        keyIndex: 0,
        action: found ? 'found' : 'traverse',
      });
      if (found) return path;
      cur = c < 0 ? cur.children[0] : cur.children[1];
    }
    return path;
  }

  insert(key) {
    this._stages = [];
    if (!this.root) {
      this.root = new BSTNode(key);
      this._stage('leaf-insert', [this.root.id], { nodeId: this.root.id });
      return this._stages;
    }
    const cmp = this.compare;
    let cur = this.root;
    while (true) {
      const c = cmp(key, cur.keys[0]);
      if (c === 0) return this._stages; // duplicate; no-op
      const slot = c < 0 ? 0 : 1;
      if (!cur.children[slot]) {
        const leaf = new BSTNode(key);
        cur.children[slot] = leaf;
        leaf.parent = cur;
        cur.isLeaf = false;
        markDirty(cur);
        this._stage('leaf-insert', [leaf.id], { nodeId: leaf.id });
        return this._stages;
      }
      cur = cur.children[slot];
    }
  }

  insertSilent(key) {
    const prev = this._silent;
    this._silent = true;
    try { this.insert(key); } finally { this._silent = prev; }
  }

  delete(key) {
    this._stages = [];
    this.root = this._delete(this.root, key);
    if (this.root) this.root.parent = null;
    return this._stages;
  }

  _delete(node, key) {
    if (!node) return node;
    const cmp = this.compare;
    const c = cmp(key, node.keys[0]);

    if (c < 0) return this._descendInto(node, 0, key);
    if (c > 0) return this._descendInto(node, 1, key);

    // c === 0 — this is the node to remove.
    const left = node.children[0] || null;
    const right = node.children[1] || null;

    if (!left && !right) {
      this._stage('leaf-delete', [node.id]);
      return null;
    }
    if (!left || !right) {
      // One child only: collapse the unary link by promoting the child.
      const only = left || right;
      this._stage('root-collapse', [only.id]);
      return only;
    }

    // Two children: swap key with in-order successor, then recurse to
    // delete that successor from the right subtree.
    let succ = right;
    while (succ.children[0]) succ = succ.children[0];
    const succKey = succ.keys[0];
    node.keys[0] = succKey;
    markDirty(node);
    this._stage('replace-succ', [node.id, right.id]);
    return this._descendInto(node, 1, succKey);
  }

  _descendInto(node, slot, key) {
    const prev = node.children[slot];
    const sub = this._delete(prev, key);
    if (sub !== prev) {
      node.children[slot] = sub;
      setParent(sub, node);
      markDirty(node);
    }
    this._refreshLeaf(node);
    return node;
  }

  _refreshLeaf(node) {
    const isLeaf = !(node.children[0] || node.children[1]);
    if (node.isLeaf !== isLeaf) {
      node.isLeaf = isLeaf;
      markDirty(node);
    }
  }
}

// BSTree snapshots collapse empty child slots, so we serialise here
// rather than via the generic snapshotNode (which walks every entry in
// node.children).
function serialise(node) {
  if (!node) return null;
  if (!node._dirty && node._snap) return node._snap;
  const kids = [node.children[0], node.children[1]]
    .filter(Boolean)
    .map(serialise);
  const snap = {
    id: node.id,
    keys: [...node.keys],
    isLeaf: !(node.children[0] || node.children[1]),
    children: kids,
  };
  node._snap = snap;
  node._dirty = false;
  return snap;
}

export default BSTree;
