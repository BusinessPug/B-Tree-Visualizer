// CLRS-style B-tree, parameterised by min-degree `t`. Non-root nodes hold
// between `t-1` and `2t-2` keys; reaching `2t-1` triggers an overflow and
// split. Insert and delete are both bottom-up, so the tree is never in an
// invalid shape between the snapshots taken at stage boundaries.
//
// The structure is value-type-agnostic: a `compare(a, b)` three-way
// comparator is injected at construction time so the same code services
// integers, floats, strings, characters, etc.

import { defaultCompare } from './compare';

class BTreeNode {
  constructor(isLeaf = true) {
    this.keys = [];
    this.children = [];
    this.isLeaf = isLeaf;
    this.id = Math.random().toString(36).slice(2);
  }
}

export class BTree {
  constructor(t = 3, compare = defaultCompare) {
    if (!Number.isInteger(t) || t < 2) {
      throw new Error(`BTree: min-degree t must be an integer >= 2 (got ${t})`);
    }
    this.root = new BTreeNode(true);
    this.t = t;
    this.compare = compare;
    this._stages = [];
    // When true, mutating operations skip snapshotting entirely. Used by
    // bulk loaders so per-key staging does not balloon into O(n^2) deep
    // copies of the whole tree.
    this._silent = false;
  }

  // A stage is { snapshot, kind, focusIds, meta }. `kind` describes what
  // just changed, `focusIds` lists nodes the UI should highlight, `meta`
  // carries optional structured hints (e.g. medianIndex for overflow).
  _stage(kind, focusIds = [], meta = null) {
    if (this._silent) return;
    this._stages.push({
      snapshot: this.snapshot(),
      kind,
      focusIds: [...focusIds],
      meta,
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
      newRoot.keys = [split.median];
      newRoot.children = [this.root, split.right];
      this.root = newRoot;
      this._stage('root-split', [newRoot.id, newRoot.children[0].id, split.right.id]);
    }
    return this._stages;
  }

  // Insert without producing stages or intermediate snapshots; used by
  // bulk loaders (Random Fill).
  insertSilent(key) {
    const prev = this._silent;
    this._silent = true;
    try {
      const split = this._insertRec(this.root, key);
      if (split) {
        const newRoot = new BTreeNode(false);
        newRoot.keys = [split.median];
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
        // The parent now owns the new right sibling — the snapshot is
        // consistent, so emit the deferred 'split' stage for the child.
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
      // Defer the 'split' stage until the caller has attached
      // `result.right`, otherwise the snapshot would omit it.
      result.leftId = node.id;
      return result;
    }
    return null;
  }

  // An overflowing node becomes [lower half] | median | [upper half]: the
  // median bubbles up to the parent and a new right sibling owns the
  // upper half.
  _splitOverflow(node) {
    const t = this.t;
    const median = node.keys[t - 1];
    const right = new BTreeNode(node.isLeaf);
    right.keys = node.keys.splice(t);
    node.keys.splice(t - 1, 1);
    if (!node.isLeaf) right.children = node.children.splice(t);
    return { median, right };
  }

  // Delete

  deletePath(key) {
    const cmp = this.compare;
    const path = [];
    const walk = (n) => {
      let i = n.keys.findIndex((k) => cmp(k, key) >= 0);
      if (i === -1) i = n.keys.length;
      const found = i < n.keys.length && cmp(n.keys[i], key) === 0;
      path.push({
        nodeId: n.id,
        keys: [...n.keys],
        keyIndex: i,
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

  // Bottom-up delete: descend without preemptive rebalancing, fix
  // underflows on the way back up. The only node that ever holds t-2 keys
  // is the child we just returned from; the caller resolves it via _fix.
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
        // Both adjacent children sit at the minimum: concatenate them,
        // skipping the separator (which is the key being deleted).
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

  // Resolve underflow at parent.children[i] by borrowing from a rich
  // sibling or merging with a minimum sibling.
  _fix(parent, i) {
    const t = this.t;
    const left = i > 0 ? parent.children[i - 1] : null;
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
    const child = parent.children[i];
    const sibling = parent.children[i - 1];
    child.keys.unshift(parent.keys[i - 1]);
    parent.keys[i - 1] = sibling.keys.pop();
    if (!sibling.isLeaf) child.children.unshift(sibling.children.pop());
  }

  _borrowFromNext(parent, i) {
    const child = parent.children[i];
    const sibling = parent.children[i + 1];
    child.keys.push(parent.keys[i]);
    parent.keys[i] = sibling.keys.shift();
    if (!sibling.isLeaf) child.children.push(sibling.children.shift());
  }

  _merge(parent, i) {
    const left = parent.children[i];
    const right = parent.children[i + 1];
    left.keys = [...left.keys, parent.keys[i], ...right.keys];
    if (!left.isLeaf) left.children = [...left.children, ...right.children];
    parent.keys.splice(i, 1);
    parent.children.splice(i + 1, 1);
  }

  snapshot() {
    const ser = (n) => ({
      id: n.id,
      keys: [...n.keys],
      isLeaf: n.isLeaf,
      children: n.children.map(ser),
    });
    return ser(this.root);
  }
}

export default BTree;
