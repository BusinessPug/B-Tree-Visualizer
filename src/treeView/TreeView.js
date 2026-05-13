import React, { useMemo, useRef, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';

import { kindColor } from '../theme';
import { MARGIN, TOP_MARGIN, LEFT_MARGIN } from './constants';
import { computeLayout, flatten } from './layout';
import { STAGE_CAPTION } from './stageCaptions';
import TreeEdge from './TreeEdge';
import TreeNode from './TreeNode';
import TraversalChip from './TraversalChip';
import StageBanner from './StageBanner';
import useWrapSize from './useWrapSize';
import useFocusScroll from './useFocusScroll';

export default function TreeView({
  treeSnapshot,
  walkAnim,
  stageInfo,
  onWalkDone,
  orientation = 'horizontal',
  theme,
  fitToCanvas = false,
}) {
  const prevNodeIds = useRef(new Set());
  const wrapRef = useRef(null);
  const isVertical = orientation === 'vertical';
  const wrapSize = useWrapSize(wrapRef);

  const { nodes, edges, nodeMap, svgWidth, svgHeight, originX, originY } = useMemo(() => {
    if (!treeSnapshot) {
      return {
        nodes: [], edges: [], nodeMap: {},
        svgWidth: 200, svgHeight: 120,
        originX: MARGIN, originY: TOP_MARGIN,
      };
    }
    const { node: rootNode } = computeLayout(treeSnapshot);
    const { nodes: flat, edges: edgeList } = flatten(rootNode, orientation);
    const map = Object.fromEntries(flat.map((n) => [n.id, n]));
    const maxX = flat.reduce((m, n) => Math.max(m, n.x + n.width), 0);
    const maxY = flat.reduce((m, n) => Math.max(m, n.y + n.height), 0);
    const ox = isVertical ? LEFT_MARGIN : MARGIN;
    const oy = isVertical ? MARGIN : TOP_MARGIN;
    return {
      nodes: flat,
      edges: edgeList,
      nodeMap: map,
      svgWidth: maxX + ox + 40,
      svgHeight: maxY + oy + 40,
      originX: ox,
      originY: oy,
    };
  }, [treeSnapshot, orientation, isVertical]);

  const newIds = useMemo(() => {
    const cur = new Set(nodes.map((n) => n.id));
    const fresh = new Set([...cur].filter((id) => !prevNodeIds.current.has(id)));
    prevNodeIds.current = cur;
    return fresh;
  }, [nodes]);

  const [chipStep, setChipStep] = useState(0);
  React.useEffect(() => { setChipStep(0); }, [walkAnim]);
  const handleChipTick = useCallback(() => setChipStep((s) => s + 1), []);

  const activeNodeId = walkAnim?.steps?.[chipStep]?.nodeId ?? null;
  const foundStep = walkAnim?.steps?.find((s) => s.action === 'found');
  const foundNodeId = chipStep >= (walkAnim?.steps?.length ?? 0) && foundStep
    ? foundStep.nodeId
    : null;
  const deletedKeyIdx = foundStep?.keyIndex ?? null;

  const litEdgeKey = useMemo(() => {
    if (!walkAnim?.steps || chipStep < 1) return null;
    const prev = walkAnim.steps[chipStep - 1];
    const curr = walkAnim.steps[chipStep];
    if (!prev || !curr) return null;
    return `${prev.nodeId}->${curr.nodeId}`;
  }, [walkAnim, chipStep]);

  const focusColor = stageInfo ? kindColor(theme, stageInfo.kind) : null;
  const focusSet = stageInfo ? new Set(stageInfo.focusIds) : null;
  const stageCaption = stageInfo ? (STAGE_CAPTION[stageInfo.kind] || stageInfo.kind) : null;
  const medianNodeId = stageInfo?.kind === 'overflow' ? stageInfo.meta?.nodeId : null;
  const medianKeyIdx = stageInfo?.kind === 'overflow' ? stageInfo.meta?.medianIndex : null;

  // Centre the active node (traversal target or structural focus) in the
  // scrollable wrap. Skipped when fit-to-canvas is on.
  const focusNodeId = activeNodeId || stageInfo?.focusIds?.[0] || null;
  useFocusScroll({
    wrapRef, focusNodeId, nodeMap, originX, originY,
    enabled: !fitToCanvas,
  });

  if (!treeSnapshot) {
    return (
      <div className="btv-empty">
        <span>Insert keys to build the B-Tree</span>
      </div>
    );
  }

  // In fit mode the SVG is sized to the wrap's measured client rect (so
  // it respects the space the toolbar / controls / status take) and uses
  // a viewBox covering the full layout extent so the tree scales
  // uniformly. preserveAspectRatio='xMidYMid meet' guarantees no clipping.
  const fitW = Math.max(40, wrapSize.w);
  const fitH = Math.max(40, wrapSize.h);
  const wrapStyle = fitToCanvas
    ? { position: 'relative', overflow: 'hidden', width: '100%', height: '100%', minHeight: 0 }
    : { position: 'relative' };
  const svgSizeProps = fitToCanvas
    ? {
        width: fitW,
        height: fitH,
        viewBox: `0 0 ${svgWidth} ${svgHeight}`,
        preserveAspectRatio: 'xMidYMid meet',
      }
    : { width: svgWidth, height: svgHeight };

  return (
    <div className="btv-canvas-wrap" ref={wrapRef} style={wrapStyle}>
      {stageInfo && (
        <StageBanner
          kind={stageInfo.kind}
          caption={stageCaption}
          color={focusColor}
          theme={theme}
        />
      )}

      <svg {...svgSizeProps} style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
        <g transform={`translate(${originX}, ${originY})`}>
          <AnimatePresence>
            {edges.map((e) => (
              <TreeEdge
                key={`${e.parentId}->${e.childId}`}
                edge={e}
                lit={litEdgeKey === `${e.parentId}->${e.childId}`}
                theme={theme}
              />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {nodes.map((n) => (
              <TreeNode
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
}
