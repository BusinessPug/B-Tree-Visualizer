import React, { useState } from 'react';
import { kindColor } from './theme';

const OffCanvasRight = ({ logEntries = [], theme }) => {
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
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(false)}
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
              {logEntries.map(e => {
                const color = kindColor(theme, e.kind);
                return (
                  <li
                    key={e.id}
                    className="btv-log-item"
                    style={{ borderLeftColor: color }}
                  >
                    <span
                      className="btv-log-kind"
                      style={{ color, borderColor: color }}
                    >
                      {e.kind || 'info'}
                    </span>
                    <span className="btv-log-msg">{e.msg}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="btv-offcanvas-footer">
          <div className="btv-legend">
            <LegendRow color={kindColor(theme, 'insert')}       text="Insert — walks down, splits on full nodes" />
            <LegendRow color={kindColor(theme, 'delete')}       text="Delete — borrows or merges siblings" />
            <LegendRow color={kindColor(theme, 'search')}       text="Search — traversal highlight" />
            <LegendRow color={kindColor(theme, 'overflow')}     text="Overflow — node reached 5 keys" />
            <LegendRow color={kindColor(theme, 'split')}        text="Split / root-split — median promoted" />
            <LegendRow color={kindColor(theme, 'borrow-left')}  text="Borrow — rich sibling lends a key" />
            <LegendRow color={kindColor(theme, 'merge')}        text="Merge / collapse — siblings combined" />
            <LegendRow color={kindColor(theme, 'replace-pred')} text="Replace — internal key swapped with pred/succ" />
          </div>
        </div>
      </div>
    </>
  );
};

const LegendRow = ({ color, text }) => (
  <div className="btv-legend-row">
    <span className="btv-legend-dot" style={{ background: color }} />
    <span>{text}</span>
  </div>
);

export default OffCanvasRight;
