import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { chipColors, kindColor } from './theme';

const KEY_W       = 44;
const KEY_H       = 36;
const NODE_PAD    = 8;
const LEVEL_GAP   = 90;            // horizontal-orientation level pitch padding
const SIBLING_GAP = 28;
const STEP_MS     = 720;
const MARGIN      = 20;
// Extra room at the leading edge of the canvas so the traversal chip
// (which hovers above the node in horizontal mode, or to the left of it
// in vertical mode) is not clipped behind the status / stage banner.
const TOP_MARGIN  = 72;
const LEFT_MARGIN = 96;             // used only in vertical orientation

const STAGE_CAPTION = {
  'leaf-insert':  'Inserted into leaf',
  overflow:       'Node overflowed — median (highlighted) will bubble up',
  split:          'Split: median promoted, right half becomes new sibling',
  'root-split':   'Root split — tree grew one level taller',
  'leaf-delete':  'Key removed from leaf',
  'replace-pred': 'Internal key replaced with predecessor',
  'replace-succ': 'Internal key replaced with successor',
  'borrow-left':  'Borrowed a key from left sibling via parent',
  'borrow-right': 'Borrowed a key from right sibling via parent',
  merge:          'Merged underflowing child with sibling through parent key',
  'merge-drop':   'Merged two minimum children, dropping the separator',
  'root-collapse':'Root collapsed — tree shrank one level',
};

// Layout: Reingold–Tilford with left/right contours.
//
// Reingold & Tilford's algorithm draws a tidy, symmetric tree in linear time
// by combining sibling subtrees one at a time and remembering the "shape"
// of what has been placed so far. The shape is captured by two contours:
//
//   leftContour[d]  = minimum x reached by the subtree at depth d
//   rightContour[d] = maximum x reached by the subtree at depth d
//
// To place sibling i next to the already-laid-out siblings 0..i-1, we walk
// the right contour of the previous block against the left contour of the
// new subtree, level by level, and find the smallest horizontal shift that
// keeps every level at least SIBLING_GAP apart. After shifting subtree i,
// its contours are merged into the running block. The parent is finally
// centred over the midpoint of its leftmost and rightmost children, and
// new outer contours are returned upwards.
//
// We always run the algorithm in its native horizontal orientation. For
// vertical layout we transpose coordinates at flatten time and override
// the depth axis with a fixed per-level pitch (because node widths along
// the depth axis vary and would otherwise overlap).

function nodeWidth(keys) { return keys.length * KEY_W + NODE_PAD * 2; }

function computeLayout(snap, depth = 0) {
  const w = nodeWidth(snap.keys);
  const y = depth * (KEY_H + NODE_PAD * 2 + LEVEL_GAP);
  const node = {
    id: snap.id, keys: snap.keys, isLeaf: snap.isLeaf,
    depth, x: 0, y, width: w, height: KEY_H + NODE_PAD * 2, children: [],
  };
  if (snap.isLeaf || !snap.children.length) {
    return { node, leftContour: [0], rightContour: [w] };
  }
  const subtrees = snap.children.map(c => computeLayout(c, depth + 1));
  for (let i = 1; i < subtrees.length; i++) {
    const prevRight = mergedRightContour(subtrees.slice(0, i));
    const curLeft   = subtrees[i].leftContour;
    const levels    = Math.min(prevRight.length, curLeft.length);
    let maxOverlap  = -Infinity;
    for (let l = 0; l < levels; l++) maxOverlap = Math.max(maxOverlap, prevRight[l] - curLeft[l]);
    shiftSubtree(subtrees[i], maxOverlap + SIBLING_GAP);
  }
  const lx = subtrees[0].node.x + subtrees[0].node.width / 2;
  const rx = subtrees[subtrees.length - 1].node.x + subtrees[subtrees.length - 1].node.width / 2;
  node.x = (lx + rx) / 2 - w / 2;
  node.children = subtrees.map(s => s.node);
  return {
    node,
    leftContour:  [node.x, ...buildMergedLeftContour(subtrees)],
    rightContour: [node.x + w, ...mergedRightContour(subtrees)],
  };
}

function shiftSubtree(st, dx) {
  shiftNode(st.node, dx);
  st.leftContour  = st.leftContour.map(v => v + dx);
  st.rightContour = st.rightContour.map(v => v + dx);
}
function shiftNode(n, dx) { n.x += dx; n.children.forEach(c => shiftNode(c, dx)); }

function mergedRightContour(subtrees) {
  const maxLen = Math.max(...subtrees.map(s => s.rightContour.length));
  return Array.from({ length: maxLen }, (_, l) => {
    let best = -Infinity;
    for (const st of subtrees) if (l < st.rightContour.length) best = Math.max(best, st.rightContour[l]);
    return best;
  });
}
function buildMergedLeftContour(subtrees) {
  const maxLen = Math.max(...subtrees.map(s => s.leftContour.length));
  return Array.from({ length: maxLen }, (_, l) => {
    let best = Infinity;
    for (const st of subtrees) if (l < st.leftContour.length) best = Math.min(best, st.leftContour[l]);
    return best;
  });
}

// Walk the computed-layout tree and produce a flat list of nodes + edges.
// In horizontal mode, edges fan out along the parent's bottom edge so each
// pointer encodes its key-range slot. In vertical mode, where the parent's
// right edge is short (KEY_H tall) we connect simply from parent's right-
// centre to child's left-centre — losing the per-slot fan-out, but keeping
// the picture readable.
function flatten(root, orientation) {
  const nodes = [];
  const collect = (n) => { nodes.push(n); n.children.forEach(collect); };
  collect(root);

  if (orientation === 'vertical') {
    const maxW = nodes.reduce((m, n) => Math.max(m, n.width), 0);
    const depthPitch = maxW + 70;
    // Transpose: new x = depth * pitch (fixed columns), new y = old x.
    nodes.forEach(n => {
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
          parentId: n.id, childId: c.id,
          px: n.x + n.width, py: n.y + n.height / 2,
          cx: c.x,           cy: c.y + c.height / 2,
        });
      } else {
        let pxLocal;
        if (idx === 0)         pxLocal = 0;
        else if (idx === last) pxLocal = n.width;
        else                   pxLocal = NODE_PAD + idx * KEY_W;
        edges.push({
          parentId: n.id, childId: c.id,
          px: n.x + pxLocal, py: n.y + n.height,
          cx: c.x + c.width / 2, cy: c.y,
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
      nodes.forEach(n => { n.y -= minY; });
      edges.forEach(e => { e.py -= minY; e.cy -= minY; });
    }
  } else {
    const minX = nodes.reduce((m, n) => Math.min(m, n.x), Infinity);
    if (minX !== 0) {
      nodes.forEach(n => { n.x -= minX; });
      edges.forEach(e => { e.px -= minX; e.cx -= minX; });
    }
  }
  return { nodes, edges };
}

// Rendering

function AnimEdge({ edge, lit, theme }) {
  const stroke = lit ? theme.edgeLit : theme.edge;
  return (
    <motion.line
      stroke={stroke}
      strokeWidth={lit ? 2.5 : 1.5}
      initial={{ x1: edge.px, y1: edge.py, x2: edge.cx, y2: edge.cy, opacity: 0 }}
      animate={{ x1: edge.px, y1: edge.py, x2: edge.cx, y2: edge.cy, opacity: 1, stroke }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 140, damping: 22 }}
    />
  );
}

function AnimNode({ node, activeNodeId, foundNodeId, deletedKeyIndex, focusColor, isNew, medianKeyIndex, theme }) {
  const { x, y, keys, width, height, id } = node;
  const isActive = activeNodeId === id;
  const isFound  = foundNodeId  === id;
  const isFocus  = !!focusColor;
  const borderCol = isFocus
    ? focusColor
    : isFound  ? theme.accents.insert
    : isActive ? theme.accents.search
    : theme.nodeBorder;
  const borderW = (isFocus || isFound || isActive) ? 2.5 : 1.5;

  return (
    <motion.g
      initial={isNew
        ? { x, y, opacity: 0, scale: 0.55 }
        : { x, y, opacity: 1, scale: 1 }}
      animate={{ x, y, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ type: 'spring', stiffness: isNew ? 110 : 180, damping: isNew ? 18 : 22 }}
    >
      <motion.rect
        x={0} y={0} width={width} height={height} rx={6}
        fill={theme.nodeBg}
        animate={{ stroke: borderCol, strokeWidth: borderW }}
        transition={{ duration: 0.25 }}
      />
      {keys.map((k, i) => {
        const kx = NODE_PAD + i * KEY_W;
        const isDel    = isFound && deletedKeyIndex === i;
        const isMedian = medianKeyIndex === i;
        return (
          <g key={k + '-' + i}>
            {i > 0 && <line x1={kx} y1={4} x2={kx} y2={height - 4} stroke={theme.keyDivider} strokeWidth={1} />}
            {isMedian && (
              <motion.rect
                x={kx} y={2} width={KEY_W} height={height - 4} rx={3}
                fill={theme.medianKeyBg}
                initial={{ opacity: 0.15 }}
                animate={{ opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              />
            )}
            {isDel && <rect x={kx} y={2} width={KEY_W} height={height - 4} rx={3} fill={theme.deleteKeyBg} />}
            {isActive && !isDel && !isMedian && <rect x={kx} y={2} width={KEY_W} height={height - 4} rx={3} fill={theme.activeKeyBg} />}
            <text
              x={kx + KEY_W / 2} y={height / 2 + 1}
              textAnchor="middle" dominantBaseline="middle"
              fill={isDel ? theme.deleteKeyText : isMedian ? theme.medianKeyText : isActive ? theme.activeKeyText : theme.keyText}
              fontSize={14} fontFamily="'JetBrains Mono', 'Fira Code', monospace"
              fontWeight={(isActive || isDel || isMedian) ? 'bold' : 'normal'}
            >{k}</text>
          </g>
        );
      })}
    </motion.g>
  );
}

// The traversal chip carries the value being inserted / deleted / searched.
// In horizontal mode it drops in from above the target node; in vertical
// mode it slides in from the left. Once structural staging begins the chip
// is faded/dismissed so it does not obscure the tree mutations.
const CHIP_W = 44;
const CHIP_H = 28;

function TraversalChip({ steps, nodeMap, operation, stepIdx, onTick, onDone, hide, orientation, theme }) {
  const colors = chipColors(theme, operation);

  useEffect(() => {
    if (stepIdx >= steps.length) { onDone(); return; }
    const t = setTimeout(() => onTick(), STEP_MS);
    return () => clearTimeout(t);
  }, [stepIdx, steps.length, onDone, onTick]);

  const idx = Math.min(stepIdx, steps.length - 1);
  const currentStep = steps[idx];
  const n = nodeMap[currentStep?.nodeId];
  if (!n) return null;

  let targetX, targetY, enterX, enterY, exitX, exitY;
  if (orientation === 'vertical') {
    targetX = n.x - CHIP_W - 14;
    targetY = n.y + n.height / 2 - CHIP_H / 2;
    enterX  = targetX - 70;
    enterY  = targetY;
    exitX   = targetX + 24;
    exitY   = targetY;
  } else {
    targetX = n.x + n.width / 2 - CHIP_W / 2;
    targetY = n.y - CHIP_H - 14;
    enterX  = targetX;
    enterY  = targetY - 70;
    exitX   = targetX;
    exitY   = targetY + 24;
  }

  return (
    <motion.g
      initial={{ x: enterX, y: enterY, opacity: 0, scale: 0.5 }}
      animate={{
        x: hide ? exitX : targetX,
        y: hide ? exitY : targetY,
        opacity: hide ? 0 : 1,
        scale: hide ? 0.6 : 1,
      }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      style={{ pointerEvents: 'none' }}
    >
      <rect
        x={0} y={0} width={CHIP_W} height={CHIP_H} rx={7}
        fill={colors.bg}
        stroke={theme.chipStroke}
        strokeWidth={1.5}
        filter={`drop-shadow(0 0 6px ${colors.bg})`}
      />
      <text
        x={CHIP_W / 2} y={CHIP_H / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={colors.fg}
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        fontWeight={800} fontSize={15}
      >
        {currentStep?.value ?? ''}
      </text>
    </motion.g>
  );
}

const TreeView = ({ treeSnapshot, walkAnim, stageInfo, onWalkDone, orientation = 'horizontal', theme, fitToCanvas = false }) => {
  const prevNodeIds = useRef(new Set());
  const wrapRef = useRef(null);
  const isVertical = orientation === 'vertical';

  // Track the wrap's available size so fit mode can size the SVG to the
  // pixels actually available between header/controls/status and the
  // viewport edge, rather than relying on percent-height resolving through
  // a flex ancestor chain (which is fragile across browsers).
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setWrapSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, edges, nodeMap, svgWidth, svgHeight, originX, originY } = useMemo(() => {
    if (!treeSnapshot) return { nodes: [], edges: [], nodeMap: {}, svgWidth: 200, svgHeight: 120, originX: MARGIN, originY: TOP_MARGIN };
    const { node: rootNode } = computeLayout(treeSnapshot);
    const { nodes: flat, edges: edgeList } = flatten(rootNode, orientation);
    const map = Object.fromEntries(flat.map(n => [n.id, n]));
    const maxX = flat.reduce((m, n) => Math.max(m, n.x + n.width), 0);
    const maxY = flat.reduce((m, n) => Math.max(m, n.y + n.height), 0);
    const ox = isVertical ? LEFT_MARGIN : MARGIN;
    const oy = isVertical ? MARGIN      : TOP_MARGIN;
    return {
      nodes: flat,
      edges: edgeList,
      nodeMap: map,
      svgWidth:  maxX + ox + 40,
      svgHeight: maxY + oy + 40,
      originX: ox,
      originY: oy,
    };
  }, [treeSnapshot, orientation, isVertical]);

  const newIds = useMemo(() => {
    const cur = new Set(nodes.map(n => n.id));
    const fresh = new Set([...cur].filter(id => !prevNodeIds.current.has(id)));
    prevNodeIds.current = cur;
    return fresh;
  }, [nodes]);

  const [chipStep, setChipStep] = useState(0);
  useEffect(() => { setChipStep(0); }, [walkAnim]);
  const handleChipTick = useCallback(() => setChipStep(s => s + 1), []);

  const activeNodeId  = walkAnim?.steps?.[chipStep]?.nodeId ?? null;
  const foundStep     = walkAnim?.steps?.find(s => s.action === 'found');
  const foundNodeId   = chipStep >= (walkAnim?.steps?.length ?? 0) && foundStep ? foundStep.nodeId : null;
  const deletedKeyIdx = foundStep?.keyIndex ?? null;

  const litEdgeKey = useMemo(() => {
    if (!walkAnim?.steps || chipStep < 1) return null;
    const prev = walkAnim.steps[chipStep - 1];
    const curr = walkAnim.steps[chipStep];
    if (!prev || !curr) return null;
    return prev.nodeId + '->' + curr.nodeId;
  }, [walkAnim, chipStep]);

  const focusColor = stageInfo ? kindColor(theme, stageInfo.kind) : null;
  const focusSet   = stageInfo ? new Set(stageInfo.focusIds) : null;
  const stageCaption = stageInfo ? (STAGE_CAPTION[stageInfo.kind] || stageInfo.kind) : null;
  const medianNodeId  = stageInfo?.kind === 'overflow' ? stageInfo.meta?.nodeId : null;
  const medianKeyIdx  = stageInfo?.kind === 'overflow' ? stageInfo.meta?.medianIndex : null;

  // Keep the active node (traversal chip target, or current structural focus
  // node) in view by scrolling whichever ancestor actually scrolls. When
  // fit-to-canvas is on the whole tree is already visible, so we skip it.
  const focusNodeId = activeNodeId || stageInfo?.focusIds?.[0] || null;
  useEffect(() => {
    if (!focusNodeId || fitToCanvas) return;
    const n = nodeMap[focusNodeId];
    const wrap = wrapRef.current;
    if (!n || !wrap) return;

    const findScroller = (el) => {
      let cur = el;
      while (cur && cur !== document.body) {
        const style = getComputedStyle(cur);
        const canScroll = /(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY);
        if (canScroll && (cur.scrollWidth > cur.clientWidth || cur.scrollHeight > cur.clientHeight)) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    };
    const scroller = findScroller(wrap) || findScroller(wrap.parentElement);
    if (!scroller) return;
    const svgEl = wrap.querySelector('svg');
    if (!svgEl) return;

    const svgRect = svgEl.getBoundingClientRect();
    const scRect  = scroller.getBoundingClientRect();
    const svgOriginX = (svgRect.left - scRect.left) + scroller.scrollLeft;
    const svgOriginY = (svgRect.top  - scRect.top)  + scroller.scrollTop;
    const nodeCenterX = svgOriginX + originX + n.x + n.width / 2;
    const nodeCenterY = svgOriginY + originY + n.y + n.height / 2;

    const targetLeft = Math.max(0, Math.min(
      scroller.scrollWidth  - scroller.clientWidth,
      nodeCenterX - scroller.clientWidth  / 2,
    ));
    const targetTop = Math.max(0, Math.min(
      scroller.scrollHeight - scroller.clientHeight,
      nodeCenterY - scroller.clientHeight / 2,
    ));
    scroller.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  }, [focusNodeId, nodeMap, originX, originY, fitToCanvas]);

  if (!treeSnapshot) return <div className="btv-empty"><span>Insert keys to build the B-Tree</span></div>;

  // In fit mode the SVG is sized to the wrap's measured client rect (so it
  // respects the space the toolbar / controls / status take), and uses a
  // viewBox covering the full layout extent so the tree scales uniformly
  // to fit. preserveAspectRatio='xMidYMid meet' guarantees no clipping.
  const viewBoxW = svgWidth;
  const viewBoxH = svgHeight;
  const wrapStyle = fitToCanvas
    ? { position: 'relative', overflow: 'hidden', width: '100%', height: '100%', minHeight: 0 }
    : { position: 'relative' };
  const fitW = Math.max(40, wrapSize.w);
  const fitH = Math.max(40, wrapSize.h);
  const svgSizeProps = fitToCanvas
    ? { width: fitW, height: fitH, viewBox: `0 0 ${viewBoxW} ${viewBoxH}`, preserveAspectRatio: 'xMidYMid meet' }
    : { width: svgWidth, height: svgHeight };

  return (
    <div className="btv-canvas-wrap" ref={wrapRef} style={wrapStyle}>
      {stageInfo && (
        <div
          style={{
            position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
            color: focusColor, background: theme.bannerBg,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontWeight: 700, fontSize: 13,
            padding: '6px 14px', borderRadius: 8, zIndex: 15,
            border: `1px solid ${focusColor}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            maxWidth: '90%', textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          <span style={{ letterSpacing: 0.5 }}>{stageInfo.kind}</span>
          <span style={{ color: theme.bannerCaption, fontWeight: 500, fontSize: 11 }}>{stageCaption}</span>
        </div>
      )}

      <svg {...svgSizeProps} style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
        <g transform={`translate(${originX}, ${originY})`}>
          <AnimatePresence>
            {edges.map(e => (
              <AnimEdge
                key={e.parentId + '->' + e.childId}
                edge={e}
                lit={litEdgeKey === e.parentId + '->' + e.childId}
                theme={theme}
              />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {nodes.map(n => (
              <AnimNode
                key={n.id}
                node={n}
                activeNodeId={activeNodeId}
                foundNodeId={foundNodeId}
                deletedKeyIndex={foundNodeId === n.id ? deletedKeyIdx : null}
                focusColor={focusSet?.has(n.id) ? focusColor : null}
                medianKeyIndex={medianNodeId === n.id ? medianKeyIdx : null}
                isNew={newIds.has(n.id)}
                theme={theme}
              />
            ))}
          </AnimatePresence>
          {walkAnim && (
            <TraversalChip
              key={walkAnim.id}
              steps={walkAnim.steps}
              nodeMap={nodeMap}
              operation={walkAnim.operation}
              stepIdx={chipStep}
              onTick={handleChipTick}
              onDone={onWalkDone}
              hide={!!stageInfo}
              orientation={orientation}
              theme={theme}
            />
          )}
        </g>
      </svg>
    </div>
  );
};

export default TreeView;
