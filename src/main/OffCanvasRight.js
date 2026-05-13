import React, { useState } from 'react';
import { kindColor } from '../theme';

// Slide-out panel listing every operation and its structural follow-up,
// colour-coded by kind. The footer carries the colour legend so users can
// map highlight colours back to operations.
export default function OffCanvasRight({ logEntries = [], theme }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btv-btn btv-btn-log" onClick={() => setOpen(true)}>
        Operation Log
      </button>

      {open && (
        <div
          className="btv-offcanvas-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Close panel"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(false)}
        />
      )}

      <div className={`btv-offcanvas ${open ? 'btv-offcanvas--open' : ''}`}>
        <div className="btv-offcanvas-header">
          <span>Operation Log</span>
          <button className="btv-offcanvas-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className="btv-offcanvas-body">
          {logEntries.length === 0 ? (
            <p className="btv-log-empty">No operations yet.</p>
          ) : (
            <ul className="btv-log-list">
              {logEntries.map((e) => (
                <LogItem key={e.id} entry={e} theme={theme} />
              ))}
            </ul>
          )}
        </div>

        <div className="btv-offcanvas-footer">
          <Legend theme={theme} />
        </div>
      </div>
    </>
  );
}

function LogItem({ entry, theme }) {
  const color = kindColor(theme, entry.kind);
  return (
    <li className="btv-log-item" style={{ borderLeftColor: color }}>
      <span className="btv-log-kind" style={{ color, borderColor: color }}>
        {entry.kind || 'info'}
      </span>
      <span className="btv-log-msg">{entry.msg}</span>
    </li>
  );
}

function Legend({ theme }) {
  const rows = [
    ['insert',       'Insert — walks down, splits on full nodes'],
    ['delete',       'Delete — borrows or merges siblings'],
    ['search',       'Search — traversal highlight'],
    ['overflow',     'Overflow — node reached max + 1 keys'],
    ['split',        'Split / root-split — median promoted'],
    ['borrow-left',  'Borrow — rich sibling lends a key'],
    ['merge',        'Merge / collapse — siblings combined'],
    ['replace-pred', 'Replace — internal key swapped with pred/succ'],
  ];
  return (
    <div className="btv-legend">
      {rows.map(([kind, text]) => (
        <LegendRow key={kind} color={kindColor(theme, kind)} text={text} />
      ))}
    </div>
  );
}

function LegendRow({ color, text }) {
  return (
    <div className="btv-legend-row">
      <span className="btv-legend-dot" style={{ background: color }} />
      <span>{text}</span>
    </div>
  );
}
