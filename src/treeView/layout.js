// Reingold–Tilford tidy-tree layout with left/right contours.
//
// The algorithm draws a symmetric tree in linear time by combining
// sibling subtrees one at a time and remembering the "shape" of what has
// been placed so far. The shape is captured by two contours:
//
//   leftContour[d]  = minimum x reached by the subtree at depth d
//   rightContour[d] = maximum x reached by the subtree at depth d
//
// To place sibling i next to siblings 0..i-1 we walk the right contour
// of the previous block against the left contour of the new subtree, find
// the smallest horizontal shift that keeps every level at least
// SIBLING_GAP apart, then merge the contours upward. The parent is finally
// centred over the midpoint of its leftmost and rightmost children.
//
// We always run the algorithm in its native horizontal orientation. For
// vertical layout, `flatten` transposes coordinates and uses a fixed
// per-level pitch (varying widths along the depth axis would otherwise
// overlap).

import { KEY_H, NODE_PAD, LEVEL_GAP, SIBLING_GAP } from './constants';
import { keyMetrics, nodeWidth } from './keyMetrics';

export function computeLayout(snap, depth = 0) {
  const metrics = keyMetrics(snap.keys);
  const w = nodeWidth(metrics);
  const y = depth * (KEY_H + NODE_PAD * 2 + LEVEL_GAP);
  const node = {
    id: snap.id,
    keys: snap.keys,
    isLeaf: snap.isLeaf,
    depth,
    x: 0,
    y,
    width: w,
    height: KEY_H + NODE_PAD * 2,
    children: [],
    keyWidths: metrics.widths,
    keyOffsets: metrics.offsets,
  };

  if (snap.isLeaf || !snap.children.length) {
    return { node, leftContour: [0], rightContour: [w] };
  }

  const subtrees = snap.children.map((c) => computeLayout(c, depth + 1));
  for (let i = 1; i < subtrees.length; i++) {
    const prevRight = mergedRightContour(subtrees.slice(0, i));
    const curLeft = subtrees[i].leftContour;
    const levels = Math.min(prevRight.length, curLeft.length);
    let maxOverlap = -Infinity;
    for (let l = 0; l < levels; l++) {
      maxOverlap = Math.max(maxOverlap, prevRight[l] - curLeft[l]);
    }
    shiftSubtree(subtrees[i], maxOverlap + SIBLING_GAP);
  }

  const lx = subtrees[0].node.x + subtrees[0].node.width / 2;
  const rightmost = subtrees[subtrees.length - 1].node;
  const rx = rightmost.x + rightmost.width / 2;
  node.x = (lx + rx) / 2 - w / 2;
  node.children = subtrees.map((s) => s.node);

  return {
    node,
    leftContour: [node.x, ...buildMergedLeftContour(subtrees)],
    rightContour: [node.x + w, ...mergedRightContour(subtrees)],
  };
}

function shiftSubtree(st, dx) {
  shiftNode(st.node, dx);
  st.leftContour = st.leftContour.map((v) => v + dx);
  st.rightContour = st.rightContour.map((v) => v + dx);
}

function shiftNode(n, dx) {
  n.x += dx;
  n.children.forEach((c) => shiftNode(c, dx));
}

function mergedRightContour(subtrees) {
  const maxLen = Math.max(...subtrees.map((s) => s.rightContour.length));
  return Array.from({ length: maxLen }, (_, l) => {
    let best = -Infinity;
    for (const st of subtrees) {
      if (l < st.rightContour.length) best = Math.max(best, st.rightContour[l]);
    }
    return best;
  });
}

function buildMergedLeftContour(subtrees) {
  const maxLen = Math.max(...subtrees.map((s) => s.leftContour.length));
  return Array.from({ length: maxLen }, (_, l) => {
    let best = Infinity;
    for (const st of subtrees) {
      if (l < st.leftContour.length) best = Math.min(best, st.leftContour[l]);
    }
    return best;
  });
}

// Walk the computed-layout tree and produce a flat list of nodes + edges.
// In horizontal mode, edges fan out along the parent's bottom edge so
// each pointer encodes its key-range slot. In vertical mode, where the
// parent's right edge is only KEY_H tall, we connect simply from parent's
// right-centre to child's left-centre.
export function flatten(root, orientation) {
  const nodes = [];
  const collect = (n) => { nodes.push(n); n.children.forEach(collect); };
  collect(root);

  if (orientation === 'vertical') {
    const maxW = nodes.reduce((m, n) => Math.max(m, n.width), 0);
    const depthPitch = maxW + 70;
    // Transpose: new x = depth * pitch (fixed columns), new y = old x.
    nodes.forEach((n) => {
      const oldX = n.x;
      n.x = n.depth * depthPitch;
      n.y = oldX;
    });
  }

  const edges = [];
  const visit = (n) => {
    const last = n.children.length - 1;
    n.children.forEach((c, idx) => {
      if (orientation === 'vertical') {
        edges.push({
          parentId: n.id,
          childId: c.id,
          px: n.x + n.width,
          py: n.y + n.height / 2,
          cx: c.x,
          cy: c.y + c.height / 2,
        });
      } else {
        // Edges fan out along the parent's bottom edge: leftmost child
        // anchors at the node's left edge, rightmost at its right edge,
        // and middle children at the boundary between adjacent key cells.
        let pxLocal;
        if (idx === 0) pxLocal = 0;
        else if (idx === last) pxLocal = n.width;
        else pxLocal = NODE_PAD + n.keyOffsets[idx];
        edges.push({
          parentId: n.id,
          childId: c.id,
          px: n.x + pxLocal,
          py: n.y + n.height,
          cx: c.x + c.width / 2,
          cy: c.y,
        });
      }
      visit(c);
    });
  };
  visit(root);

  // Normalise so the leading sibling axis sits at 0.
  if (orientation === 'vertical') {
    const minY = nodes.reduce((m, n) => Math.min(m, n.y), Infinity);
    if (minY !== 0) {
      nodes.forEach((n) => { n.y -= minY; });
      edges.forEach((e) => { e.py -= minY; e.cy -= minY; });
    }
  } else {
    const minX = nodes.reduce((m, n) => Math.min(m, n.x), Infinity);
    if (minX !== 0) {
      nodes.forEach((n) => { n.x -= minX; });
      edges.forEach((e) => { e.px -= minX; e.cx -= minX; });
    }
  }

  return { nodes, edges };
}
