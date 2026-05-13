// Order-5 B-tree (min-degree t = 3): every non-root node holds between
// t - 1 = 2 and 2t - 2 = 4 keys; the root may hold 1 to 4. The classical
// CLRS limit of 2t - 1 = 5 keys is treated as the overflow threshold:
// reaching it triggers a split. Both insert and delete are bottom-up so the
// tree never holds an invalid shape between snapshots taken at stage
// boundaries.

class BTreeNode {
  constructor(isLeaf = true) {
    this.keys     = [];
    this.children = [];
    this.isLeaf   = isLeaf;
    this.id       = Math.random().toString(36).slice(2);
  }
}

export class BTree {
  constructor() {
    this.root    = new BTreeNode(true);
    this.t       = 3;
    this._stages = [];
  }

  // A stage is { snapshot, kind, focusIds, meta }. `kind` describes what
  // just changed, `focusIds` lists the nodes the UI should highlight, and
  // `meta` carries optional structured hints (e.g. medianIndex for overflow
  // so the UI can mark the key that is about to bubble up).
  _stage(kind, focusIds = [], meta = null) {
    this._stages.push({
      snapshot: this.snapshot(), kind, focusIds: [...focusIds], meta,
    });
  }

  search(key, node = this.root, path = []) {
    let i = 0;
    while (i < node.keys.length && key > node.keys[i]) i++;
    path.push({ nodeId: node.id, keyIndex: i, keys: [...node.keys] });
    if (i < node.keys.length && key === node.keys[i]) {
      return { found: true, nodeId: node.id, keyIndex: i, path };
    }
    if (node.isLeaf) return { found: false, path };
    return this.search(key, node.children[i], path);
  }

  // Insert
  insertPath(key) {
    const path = [];
    const walk = (n) => {
      path.push({ nodeId: n.id, keys: [...n.keys] });
      if (n.isLeaf) return;
      let i = 0;
      while (i < n.keys.length && key > n.keys[i]) i++;
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

  _insertRec(node, key) {
    if (node.isLeaf) {
      let i = 0;
      while (i < node.keys.length && key > node.keys[i]) i++;
      node.keys.splice(i, 0, key);
      if (node.keys.length >= 2 * this.t - 1) {
        this._stage('overflow', [node.id], { medianIndex: this.t - 1, nodeId: node.id });
      } else {
        this._stage('leaf-insert', [node.id], { insertedIndex: i, nodeId: node.id });
      }
    } else {
      let i = 0;
      while (i < node.keys.length && key > node.keys[i]) i++;
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
    const path = [];
    const walk = (n) => {
      let i = n.keys.findIndex(k => k >= key);
      if (i === -1) i = n.keys.length;
      const found = i < n.keys.length && n.keys[i] === key;
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
    const t = this.t;
    let i = 0;
    while (i < node.keys.length && key > node.keys[i]) i++;

    if (i < node.keys.length && node.keys[i] === key) {
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

export default BTree;
