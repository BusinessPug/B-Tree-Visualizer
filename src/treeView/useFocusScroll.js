import { useEffect } from 'react';

// Scroll the nearest scrollable ancestor so that the currently focused
// node is centred. No-op when fit-to-canvas is on (whole tree visible).
export default function useFocusScroll({
  wrapRef,
  focusNodeId,
  nodeMap,
  originX,
  originY,
  enabled,
}) {
  useEffect(() => {
    if (!enabled || !focusNodeId) return;
    const n = nodeMap[focusNodeId];
    const wrap = wrapRef.current;
    if (!n || !wrap) return;

    const scroller = findScroller(wrap) || findScroller(wrap.parentElement);
    if (!scroller) return;
    const svgEl = wrap.querySelector('svg');
    if (!svgEl) return;

    const svgRect = svgEl.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    const svgOriginX = (svgRect.left - scRect.left) + scroller.scrollLeft;
    const svgOriginY = (svgRect.top - scRect.top) + scroller.scrollTop;
    const nodeCenterX = svgOriginX + originX + n.x + n.width / 2;
    const nodeCenterY = svgOriginY + originY + n.y + n.height / 2;

    const targetLeft = clamp(
      nodeCenterX - scroller.clientWidth / 2,
      0,
      scroller.scrollWidth - scroller.clientWidth,
    );
    const targetTop = clamp(
      nodeCenterY - scroller.clientHeight / 2,
      0,
      scroller.scrollHeight - scroller.clientHeight,
    );
    scroller.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  }, [focusNodeId, nodeMap, originX, originY, enabled, wrapRef]);
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function findScroller(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    const style = getComputedStyle(cur);
    const canScroll = /(auto|scroll)/.test(
      style.overflow + style.overflowX + style.overflowY,
    );
    if (canScroll && (cur.scrollWidth > cur.clientWidth || cur.scrollHeight > cur.clientHeight)) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}
