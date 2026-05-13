import React from 'react';
import { MIN_KEYS_FLOOR, MIN_KEYS_CEIL } from './treeConfig';

// Tree-order configuration: min/max keys per node. The Apply button
// rebuilds the tree from scratch.
export default function OrderBar({
  pendingMin,
  pendingMax,
  onMinChange,
  onMaxChange,
  onApply,
  orderValidation,
  orderDirty,
  busy,
}) {
  const hint = orderValidation.ok
    ? orderValidation.binary
      ? `Binary tree mode${orderDirty ? ' · applying clears the tree' : ' · active'}`
      : `Overflow at ${orderValidation.max + 1} keys${orderDirty ? ' · applying clears the tree' : ' · active'}`
    : orderValidation.error;

  return (
    <div className="btv-order-bar">
      <span className="btv-order-label">Tree order</span>

      <label className="btv-order-field">
        <span>Min keys</span>
        <input
          className="btv-input btv-input-order"
          type="number"
          min={MIN_KEYS_FLOOR}
          max={MIN_KEYS_CEIL}
          value={pendingMin}
          onChange={(e) => onMinChange(e.target.value)}
          disabled={busy}
        />
      </label>

      <label className="btv-order-field">
        <span>Max keys</span>
        <input
          className="btv-input btv-input-order"
          type="number"
          min={2}
          max={MIN_KEYS_CEIL * 2}
          value={pendingMax}
          onChange={(e) => onMaxChange(e.target.value)}
          disabled={busy}
        />
      </label>

      <button
        className="btv-btn btv-btn-apply"
        onClick={onApply}
        disabled={busy || !orderValidation.ok || !orderDirty}
        title={orderDirty ? 'Rebuild the tree with these bounds (clears current tree)' : 'No change'}
      >
        Apply
      </button>

      <span className="btv-order-hint">{hint}</span>
    </div>
  );
}
