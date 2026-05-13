import { MIN_KEY_W, KEY_CHAR_W, KEY_H_PAD, NODE_PAD } from './constants';

// Width allotted to a single key cell. Keys can be integers, floats,
// strings or characters — their rendered text length varies, so a fixed
// width caused longer values to overflow the box. We size to the rendered
// string and floor at MIN_KEY_W for visual consistency.
export function keyWidth(k) {
  const len = String(k).length;
  return Math.max(MIN_KEY_W, len * KEY_CHAR_W + KEY_H_PAD);
}

// Per-key widths and the running offset where each key starts inside the
// node (measured from the node's left border, before NODE_PAD). The total
// inner content width is offsets[keys.length].
export function keyMetrics(keys) {
  const widths = keys.map(keyWidth);
  const offsets = [0];
  for (let i = 0; i < widths.length; i++) offsets.push(offsets[i] + widths[i]);
  return { widths, offsets, inner: offsets[widths.length] };
}

export function nodeWidth(metrics) {
  return metrics.inner + NODE_PAD * 2;
}
