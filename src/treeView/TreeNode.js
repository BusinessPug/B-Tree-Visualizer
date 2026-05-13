import React from 'react';
import { motion } from 'framer-motion';
import { NODE_PAD, KEY_FONT_PX } from './constants';

export default function TreeNode({
  node,
  activeNodeId,
  foundNodeId,
  deletedKeyIndex,
  focusColor,
  isNew,
  medianKeyIndex,
  theme,
}) {
  const { x, y, keys, width, height, id, keyWidths, keyOffsets } = node;
  const isActive = activeNodeId === id;
  const isFound = foundNodeId === id;
  const isFocus = !!focusColor;

  const borderCol = isFocus
    ? focusColor
    : isFound
      ? theme.accents.insert
      : isActive
        ? theme.accents.search
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
        const kx = NODE_PAD + keyOffsets[i];
        const kw = keyWidths[i];
        const isDel = isFound && deletedKeyIndex === i;
        const isMedian = medianKeyIndex === i;
        const fill = isDel
          ? theme.deleteKeyText
          : isMedian
            ? theme.medianKeyText
            : isActive
              ? theme.activeKeyText
              : theme.keyText;
        return (
          <g key={`${k}-${i}`}>
            {i > 0 && (
              <line
                x1={kx} y1={4} x2={kx} y2={height - 4}
                stroke={theme.keyDivider} strokeWidth={1}
              />
            )}
            {isMedian && (
              <motion.rect
                x={kx} y={2} width={kw} height={height - 4} rx={3}
                fill={theme.medianKeyBg}
                initial={{ opacity: 0.15 }}
                animate={{ opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              />
            )}
            {isDel && (
              <rect
                x={kx} y={2} width={kw} height={height - 4} rx={3}
                fill={theme.deleteKeyBg}
              />
            )}
            {isActive && !isDel && !isMedian && (
              <rect
                x={kx} y={2} width={kw} height={height - 4} rx={3}
                fill={theme.activeKeyBg}
              />
            )}
            <text
              x={kx + kw / 2} y={height / 2 + 1}
              textAnchor="middle" dominantBaseline="middle"
              fill={fill}
              fontSize={KEY_FONT_PX}
              fontFamily="'JetBrains Mono', 'Fira Code', monospace"
              fontWeight={(isActive || isDel || isMedian) ? 'bold' : 'normal'}
            >
              {k}
            </text>
          </g>
        );
      })}
    </motion.g>
  );
}
