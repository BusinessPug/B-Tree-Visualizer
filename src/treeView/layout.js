// Reingold–Tilford tidy-tree layout, computed in two passes:
//
//   1. shapeOf(snap) — recursive, memoised by snapshot reference. Builds
//      an immutable "shape" describing each subtree relative to its own
//      left edge (rootX, child x-offsets, left/right contours). Because
//      the tree module shares unchanged subtrees across snapshots, the
//      cache lets a single-leaf edit reuse all sibling subtree shapes.
//
//   2. flatten(snap, orientation) — single traversal that places nodes
//      into absolute coordinates and emits the edge list. The shapes are
//      treated as read-only, so caching is safe.
//
// Sibling placement uses an incremental running contour rather than
// re-merging from scratch at each step: when adding sibling i, we measure
// it against the merged contour of siblings 0..i-1, shift it, then fold
// its own contour into the running merge. This drops the per-parent work
// from O(b² · d) to O(b · d).

import { KEY_H, NODE_PAD, LEVEL_GAP, SIBLING_GAP } from './constants';
import { keyMetrics, nodeWidth } from './keyMetrics';

const LEVEL_PITCH = KEY_H + NODE_PAD * 2 + LEVEL_GAP;
const NODE_BOX_HEIGHT = KEY_H + NODE_PAD * 2;

const shapeCache = new WeakMap();

function shapeOf(snap) {
  const cached = shapeCache.get(snap);
  if (cached) return cached;
  const shape = buildShape(snap);
  shapeCache.set(snap, shape);
  return shape;
}

function buildShape(snap) {
  const metrics = keyMetrics(snap.keys);
  const w = nodeWidth(metrics);

  if (snap.isLeaf || !snap.children?.length) {
    return {
      snap,
      rootX: 0,
      rootBoxWidth: w,
      rootBoxHeight: NODE_BOX_HEIGHT,
      keyWidths: metrics.widths,
      keyOffsets: metrics.offsets,
      children: [],
      childXs: [],
      leftContour: [0],
      rightContour: [w],
    };
  }

  const children = snap.children.map(shapeOf);
  const childXs = placeChildren(children);

  const firstCx = childXs[0] + children[0].rootX + children[0].rootBoxWidth / 2;
  const lastIdx = children.length - 1;
  const lastCx = childXs[lastIdx]
    + children[lastIdx].rootX + children[lastIdx].rootBoxWidth / 2;
  const rootCentre = (firstCx + lastCx) / 2;
  const rootXRaw = rootCentre - w / 2;

  // Merge child contours into the parent frame; the running arrays are
  // already in this frame thanks to placeChildren.
  const merged = mergeContours(children, childXs);

  // Normalise so the subtree's leftmost x is 0.
  let minLeft = rootXRaw;
  for (const v of merged.left) if (v < minLeft) minLeft = v;
  const shift = -minLeft;

  return {
    snap,
    rootX: rootXRaw + shift,
    rootBoxWidth: w,
    rootBoxHeight: NODE_BOX_HEIGHT,
    keyWidths: metrics.widths,
    keyOffsets: metrics.offsets,
    children,
    childXs: childXs.map((x) => x + shift),
    leftContour: [rootXRaw + shift, ...merged.left.map((v) => v + shift)],
    rightContour: [rootXRaw + shift + w, ...merged.right.map((v) => v + shift)],
  };
}

// Returns the x of each child's left edge in the parent's frame, where
// the first child sits at 0. Incremental: each step compares the new
// child only against the running right contour of everything placed so
// far.
function placeChildren(children) {
  const xs = [0];
  const runningRight = [...children[0].rightContour];

  for (let i = 1; i < children.length; i++) {
    const cLeft = children[i].leftContour;
    const levels = Math.min(runningRight.length, cLeft.length);
    let maxOverlap = -Infinity;
    for (let l = 0; l < levels; l++) {
      const overlap = runningRight[l] - cLeft[l];
      if (overlap > maxOverlap) maxOverlap = overlap;
    }
    const x = maxOverlap + SIBLING_GAP;
    xs.push(x);

    const cRight = children[i].rightContour;
    for (let l = 0; l < cRight.length; l++) {
      const v = x + cRight[l];
      if (l < runningRight.length) {
        if (v > runningRight[l]) runningRight[l] = v;
      } else {
        runningRight.push(v);
      }
    }
  }
  return xs;
}

// Merge every child's contour into a single pair of arrays, shifted into
// the parent's frame. Runs once per parent after placement is settled.
function mergeContours(children, childXs) {
  const left = [];
  const right = [];
  for (let i = 0; i < children.length; i++) {
    const dx = childXs[i];
    const cL = children[i].leftContour;
    const cR = children[i].rightContour;
    for (let l = 0; l < cL.length; l++) {
      const v = dx + cL[l];
      if (l < left.length) { if (v < left[l]) left[l] = v; }
      else left.push(v);
    }
    for (let l = 0; l < cR.length; l++) {
      const v = dx + cR[l];
      if (l < right.length) { if (v > right[l]) right[l] = v; }
      else right.push(v);
    }
  }
  return { left, right };
}

// Single traversal that produces the flat node + edge lists from the
// shape tree. Shapes are read-only; placement state lives in the local
// closures here.
export function flatten(rootSnap, orientation) {
  if (!rootSnap) return { nodes: [], edges: [] };

  const rootShape = shapeOf(rootSnap);
  const nodes = [];
  const childRelations = []; // { parent, kids: [...] }

  const place = (shape, baseX, depth) => {
    const node = {
      id: shape.snap.id,
      keys: shape.snap.keys,
      isLeaf: shape.snap.isLeaf,
      depth,
      x: baseX + shape.rootX,
      y: depth * LEVEL_PITCH,
      width: shape.rootBoxWidth,
      height: shape.rootBoxHeight,
      keyWidths: shape.keyWidths,
      keyOffsets: shape.keyOffsets,
    };
    nodes.push(node);
    if (shape.children.length) {
      const kids = shape.children.map(
        (c, i) => place(c, baseX + shape.childXs[i], depth + 1),
      );
      childRelations.push({ parent: node, kids });
    }
    return node;
  };
  place(rootShape, 0, 0);

  if (orientation === 'vertical') transposeForVertical(nodes);

  const edges = [];
  for (const { parent, kids } of childRelations) {
    const last = kids.length - 1;
    kids.forEach((child, idx) => {
      edges.push(buildEdge(parent, child, idx, last, orientation));
    });
  }

  normaliseOrigin(nodes, edges, orientation);
  return { nodes, edges };
}

// In vertical orientation the depth axis runs horizontally instead. We
// fix the depth pitch off the widest node so columns don't overlap, then
// swap x ↔ y.
function transposeForVertical(nodes) {
  let maxW = 0;
  for (const n of nodes) if (n.width > maxW) maxW = n.width;
  const depthPitch = maxW + 70;
  for (const n of nodes) {
    const oldX = n.x;
    n.x = n.depth * depthPitch;
    n.y = oldX;
  }
}

function buildEdge(parent, child, idx, last, orientation) {
  if (orientation === 'vertical') {
    // The parent's right edge is only one node-box tall, so connect right-
    // centre to left-centre rather than fanning per key-range slot.
    return {
      parentId: parent.id,
      childId: child.id,
      px: parent.x + parent.width,
      py: parent.y + parent.height / 2,
      cx: child.x,
      cy: child.y + child.height / 2,
    };
  }
  // Horizontal: edges fan out along the parent's bottom edge. Leftmost
  // child anchors at the node's left edge, rightmost at its right edge,
  // and middle children at the boundary between adjacent key cells.
  let pxLocal;
  if (idx === 0) pxLocal = 0;
  else if (idx === last) pxLocal = parent.width;
  else pxLocal = NODE_PAD + parent.keyOffsets[idx];
  return {
    parentId: parent.id,
    childId: child.id,
    px: parent.x + pxLocal,
    py: parent.y + parent.height,
    cx: child.x + child.width / 2,
    cy: child.y,
  };
}

function normaliseOrigin(nodes, edges, orientation) {
  if (orientation === 'vertical') {
    let minY = Infinity;
    for (const n of nodes) if (n.y < minY) minY = n.y;
    if (minY !== 0) {
      for (const n of nodes) n.y -= minY;
      for (const e of edges) { e.py -= minY; e.cy -= minY; }
    }
  } else {
    let minX = Infinity;
    for (const n of nodes) if (n.x < minX) minX = n.x;
    if (minX !== 0) {
      for (const n of nodes) n.x -= minX;
      for (const e of edges) { e.px -= minX; e.cx -= minX; }
    }
  }
}
