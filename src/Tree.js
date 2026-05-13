// CLRS-style B-tree parameterised by min-degree `t` (default 3, giving
// order-5: non-root nodes hold 2..4 keys, root 1..4). For arbitrary `t`,
// non-root nodes hold `t-1` to `2t-2` keys; the classical `2t-1` limit is
// the overflow threshold and triggers a split. Both insert and delete are
// bottom-up so the tree never holds an invalid shape between snapshots
// taken at stage boundaries.
//
// The tree is value-type-agnostic: a `compare(a, b)` three-way comparator
// is injected at construction time (default numeric / lexicographic) so
// the same code services integers, floats, strings, characters, etc.

const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

class BTreeNode {
  constructor(isLeaf = true) {
    this.keys     = [];
    this.children = [];
    this.isLeaf   = isLeaf;
    this.id       = Math.random().toString(36).slice(2);
  }
}

export class BTree {
  // `t` is the CLRS min-degree. Non-root nodes hold between `t-1` and
  // `2t-2` keys; reaching `2t-1` keys triggers a split. The root may hold
  // 1 to `2t-2` keys. Default `t=3` reproduces the original order-5 tree
  // (min 2 keys, max 4 keys, overflow at 5).
  constructor(t = 3, compare = defaultCompare) {
    if (!Number.isInteger(t) || t < 2) {
      throw new Error(`BTree: min-degree t must be an integer >= 2 (got ${t})`);
    }
    this.root    = new BTreeNode(true);
    this.t       = t;
    this.compare = compare;
    this._stages = [];
    // When true, mutating operations skip snapshotting entirely. Random
    // Fill uses this: snapshotting per stage on a 10k-key bulk load means
    // O(n^2) deep-copies of the whole tree. The visible snapshot is taken
    // once after the batch instead.
    this._silent = false;
  }

  // A stage is { snapshot, kind, focusIds, meta }. `kind` describes what
  // just changed, `focusIds` lists the nodes the UI should highlight, and
  // `meta` carries optional structured hints (e.g. medianIndex for overflow
  // so the UI can mark the key that is about to bubble up).
  _stage(kind, focusIds = [], meta = null) {
    if (this._silent) return;
    this._stages.push({
      snapshot: this.snapshot(), kind, focusIds: [...focusIds], meta,
    });
  }

  search(key, node = this.root, path = []) {
    const cmp = this.compare;
    let i = 0;
    while (i < node.keys.length && cmp(key, node.keys[i]) > 0) i++;
    path.push({ nodeId: node.id, keyIndex: i, keys: [...node.keys] });
    if (i < node.keys.length && cmp(key, node.keys[i]) === 0) {
      return { found: true, nodeId: node.id, keyIndex: i, path };
    }
    if (node.isLeaf) return { found: false, path };
    return this.search(key, node.children[i], path);
  }

  // Insert
  insertPath(key) {
    const cmp = this.compare;
    const path = [];
    const walk = (n) => {
      path.push({ nodeId: n.id, keys: [...n.keys] });
      if (n.isLeaf) return;
      let i = 0;
      while (i < n.keys.length && cmp(key, n.keys[i]) > 0) i++;
      if (n.children[i]) walk(n.children[i]);
    };
    walk(this.root);
    return path;
  }

  insert(key) {
    this._stages = [];
    const split = this._insertRec(this.root, key);
    if (split) {
      const newRoot = new BTreeNode(false);
      newRoot.keys     = [split.median];
      newRoot.children = [this.root, split.right];
      this.root = newRoot;
      this._stage('root-split', [newRoot.id, newRoot.children[0].id, split.right.id]);
    }
    return this._stages;
  }

  // Insert without producing stages or intermediate snapshots. Used by
  // bulk loaders (Random Fill).
  insertSilent(key) {
    const prev = this._silent;
    this._silent = true;
    try {
      const split = this._insertRec(this.root, key);
      if (split) {
        const newRoot = new BTreeNode(false);
        newRoot.keys     = [split.median];
        newRoot.children = [this.root, split.right];
        this.root = newRoot;
      }
    } finally {
      this._silent = prev;
    }
  }

  _insertRec(node, key) {
    const cmp = this.compare;
    if (node.isLeaf) {
      let i = 0;
      while (i < node.keys.length && cmp(key, node.keys[i]) > 0) i++;
      node.keys.splice(i, 0, key);
      if (node.keys.length >= 2 * this.t - 1) {
        this._stage('overflow', [node.id], { medianIndex: this.t - 1, nodeId: node.id });
      } else {
        this._stage('leaf-insert', [node.id], { insertedIndex: i, nodeId: node.id });
      }
    } else {
      let i = 0;
      while (i < node.keys.length && cmp(key, node.keys[i]) > 0) i++;
      const split = this._insertRec(node.children[i], key);
      if (split) {
        node.keys.splice(i, 0, split.median);
        node.children.splice(i + 1, 0, split.right);
        // Now that the parent owns the new right sibling, the snapshot is
        // consistent — emit the deferred 'split' stage for the child here.
        this._stage(
          'split',
          [split.leftId, split.right.id],
          { leftId: split.leftId, rightId: split.right.id },
        );
        if (node.keys.length >= 2 * this.t - 1) {
          this._stage('overflow', [node.id], { medianIndex: this.t - 1, nodeId: node.id });
        }
      }
    }
    if (node.keys.length >= 2 * this.t - 1) {
      const result = this._splitOverflow(node);
      // Defer the 'split' stage until the caller (parent or insert()) has
      // attached `result.right`; otherwise the snapshot would omit it and
      // the promoted median, making keys appear to vanish.
      result.leftId = node.id;
      return result;
    }
    return null;
  }

  // An overflowing 5-key node becomes [k0 k1] | k2 | [k3 k4]: the median
  // bubbles up to the parent and a new right sibling owns the upper half.
  _splitOverflow(node) {
    const t      = this.t;
    const median = node.keys[t - 1];
    const right  = new BTreeNode(node.isLeaf);
    right.keys   = node.keys.splice(t);
    node.keys.splice(t - 1, 1);
    if (!node.isLeaf) right.children = node.children.splice(t);
    return { median, right };
  }

  // Delete
  deletePath(key) {
    const cmp = this.compare;
    const path = [];
    const walk = (n) => {
      let i = n.keys.findIndex(k => cmp(k, key) >= 0);
      if (i === -1) i = n.keys.length;
      const found = i < n.keys.length && cmp(n.keys[i], key) === 0;
      path.push({
        nodeId: n.id, keys: [...n.keys], keyIndex: i,
        action: found ? 'found' : 'traverse',
      });
      if (!found && !n.isLeaf && n.children[i]) walk(n.children[i]);
    };
    walk(this.root);
    return path;
  }

  delete(key) {
    this._stages = [];
    this._delete(this.root, key);
    if (this.root.keys.length === 0 && !this.root.isLeaf) {
      this.root = this.root.children[0];
      this._stage('root-collapse', [this.root.id]);
    }
    return this._stages;
  }

  // Bottom-up delete: descend without preemptive rebalancing, fix underflows
  // on the way back up. The only node that ever holds t - 2 = 1 key is the
  // child we just returned from; the caller resolves it via _fix.
  _delete(node, key) {
    const cmp = this.compare;
    const t = this.t;
    let i = 0;
    while (i < node.keys.length && cmp(key, node.keys[i]) > 0) i++;

    if (i < node.keys.length && cmp(node.keys[i], key) === 0) {
      if (node.isLeaf) {
        node.keys.splice(i, 1);
        this._stage('leaf-delete', [node.id]);
        return;
      }
      const lc = node.children[i];
      const rc = node.children[i + 1];
      if (lc.keys.length >= t) {
        const pred = this._getPredecessor(lc);
        node.keys[i] = pred;
        this._stage('replace-pred', [node.id, lc.id]);
        this._delete(lc, pred);
        if (lc.keys.length < t - 1) this._fix(node, i);
      } else if (rc.keys.length >= t) {
        const succ = this._getSuccessor(rc);
        node.keys[i] = succ;
        this._stage('replace-succ', [node.id, rc.id]);
        this._delete(rc, succ);
        if (rc.keys.length < t - 1) this._fix(node, i + 1);
      } else {
        // Both adjacent children sit at the minimum: concatenate them
        // skipping the separator (which is the key being deleted). The
        // result has 2 + 2 = 4 keys, never the transient 5 of CLRS-style.
        lc.keys = [...lc.keys, ...rc.keys];
        if (!lc.isLeaf) lc.children = [...lc.children, ...rc.children];
        node.keys.splice(i, 1);
        node.children.splice(i + 1, 1);
        this._stage('merge-drop', [node.id, lc.id]);
      }
    } else {
      if (node.isLeaf) return;
      const child = node.children[i];
      this._delete(child, key);
      if (child.keys.length < t - 1) this._fix(node, i);
    }
  }

  // Resolve underflow at parent.children[i] by borrowing from a rich sibling
  // or merging with a minimum sibling. A merge yields 1 + 1 + 2 = 4 keys.
  _fix(parent, i) {
    const t     = this.t;
    const left  = i > 0 ? parent.children[i - 1] : null;
    const right = i < parent.children.length - 1 ? parent.children[i + 1] : null;
    if (left && left.keys.length >= t) {
      this._borrowFromPrev(parent, i);
      this._stage('borrow-left', [parent.id, left.id, parent.children[i].id]);
    } else if (right && right.keys.length >= t) {
      this._borrowFromNext(parent, i);
      this._stage('borrow-right', [parent.id, right.id, parent.children[i].id]);
    } else if (left) {
      this._merge(parent, i - 1);
      this._stage('merge', [parent.id, parent.children[i - 1].id]);
    } else {
      this._merge(parent, i);
      this._stage('merge', [parent.id, parent.children[i].id]);
    }
  }

  _getPredecessor(node) {
    while (!node.isLeaf) node = node.children[node.children.length - 1];
    return node.keys[node.keys.length - 1];
  }
  _getSuccessor(node) {
    while (!node.isLeaf) node = node.children[0];
    return node.keys[0];
  }
  _borrowFromPrev(parent, i) {
    const child   = parent.children[i];
    const sibling = parent.children[i - 1];
    child.keys.unshift(parent.keys[i - 1]);
    parent.keys[i - 1] = sibling.keys.pop();
    if (!sibling.isLeaf) child.children.unshift(sibling.children.pop());
  }
  _borrowFromNext(parent, i) {
    const child   = parent.children[i];
    const sibling = parent.children[i + 1];
    child.keys.push(parent.keys[i]);
    parent.keys[i] = sibling.keys.shift();
    if (!sibling.isLeaf) child.children.push(sibling.children.shift());
  }
  _merge(parent, i) {
    const left  = parent.children[i];
    const right = parent.children[i + 1];
    left.keys   = [...left.keys, parent.keys[i], ...right.keys];
    if (!left.isLeaf) left.children = [...left.children, ...right.children];
    parent.keys.splice(i, 1);
    parent.children.splice(i + 1, 1);
  }

  snapshot() {
    const ser = (n) => ({
      id: n.id, keys: [...n.keys], isLeaf: n.isLeaf, children: n.children.map(ser),
    });
    return ser(this.root);
  }
}

// Binary Search Tree variant exposed for the "min = max = 1" case.
//
// A real B-tree degenerates when min == max == 1 (max would need to equal
// 2 * min for splits/merges to balance), so binary mode is implemented as
// a separate, much simpler structure that shares the BTree's public API
// (insert / delete / search / snapshot / insertPath / deletePath / stages).
// Each node still has a `keys` array (always length 1) and a `children`
// array — index 0 is the left subtree, index 1 the right; missing
// children are simply absent from the rendered snapshot.
//
// The stage kinds emitted here are a subset of the B-tree's, so the
// existing log / banner / colour wiring in MainComponent and TreeView
// works without modification:
//
//   leaf-insert    new leaf attached
//   leaf-delete    removed key from a leaf with no children
//   root-collapse  one-child node replaced by its only child
//   replace-succ   internal key swapped with in-order successor

class BSTNode {
  constructor(key) {
    this.keys     = [key];
    this.children = [];
    this.isLeaf   = true;
    this.id       = Math.random().toString(36).slice(2);
  }
}

export class BSTree {
  constructor(compare = defaultCompare) {
    this.root    = null;
    this.compare = compare;
    this._stages = [];
    this._silent = false;
  }

  _stage(kind, focusIds = [], meta = null) {
    if (this._silent) return;
    this._stages.push({
      snapshot: this.snapshot(), kind, focusIds: [...focusIds], meta,
    });
  }

  // Returns null for an empty tree, matching the contract TreeView
  // already handles. We materialise both child slots so the renderer
  // keeps left/right positions consistent even when one side is empty.
  snapshot() {
    const ser = (n) => n && {
      id: n.id,
      keys: [...n.keys],
      isLeaf: !(n.children[0] || n.children[1]),
      children: [n.children[0], n.children[1]].filter(Boolean).map(ser),
    };
    return ser(this.root);
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
        nodeId: cur.id, keys: [...cur.keys], keyIndex: 0,
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
        cur.isLeaf = false;
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
    return this._stages;
  }

  _delete(node, key) {
    if (!node) return node;
    const cmp = this.compare;
    const c = cmp(key, node.keys[0]);
    if (c < 0) {
      node.children[0] = this._delete(node.children[0], key);
      this._refreshLeaf(node);
      return node;
    }
    if (c > 0) {
      node.children[1] = this._delete(node.children[1], key);
      this._refreshLeaf(node);
      return node;
    }
    // c === 0 — this is the node to remove.
    const left  = node.children[0] || null;
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
    this._stage('replace-succ', [node.id, right.id]);
    node.children[1] = this._delete(right, succKey);
    this._refreshLeaf(node);
    return node;
  }

  _refreshLeaf(node) {
    node.isLeaf = !(node.children[0] || node.children[1]);
  }
}

export default BTree;
