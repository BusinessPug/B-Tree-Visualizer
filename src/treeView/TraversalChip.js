import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { chipColors } from '../theme';
import { CHIP_W, CHIP_H, STEP_MS } from './constants';

// The traversal chip carries the value being inserted / deleted / searched.
// In horizontal mode it drops in from above the target node; in vertical
// mode it slides in from the left. Once structural staging begins the chip
// is faded out so it does not obscure the tree mutations.
export default function TraversalChip({
  steps,
  nodeMap,
  operation,
  stepIdx,
  onTick,
  onDone,
  hide,
  orientation,
  theme,
}) {
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

  const target = targetPosition(n, orientation);

  return (
    <motion.g
      initial={{ x: target.enterX, y: target.enterY, opacity: 0, scale: 0.5 }}
      animate={{
        x: hide ? target.exitX : target.x,
        y: hide ? target.exitY : target.y,
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

function targetPosition(n, orientation) {
  if (orientation === 'vertical') {
    const x = n.x - CHIP_W - 14;
    const y = n.y + n.height / 2 - CHIP_H / 2;
    return { x, y, enterX: x - 70, enterY: y, exitX: x + 24, exitY: y };
  }
  const x = n.x + n.width / 2 - CHIP_W / 2;
  const y = n.y - CHIP_H - 14;
  return { x, y, enterX: x, enterY: y - 70, exitX: x, exitY: y + 24 };
}
