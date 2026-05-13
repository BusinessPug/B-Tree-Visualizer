import React from 'react';
import { motion } from 'framer-motion';

export default function TreeEdge({ edge, lit, theme }) {
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
