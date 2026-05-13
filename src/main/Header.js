import React from 'react';
import OffCanvasRight from './OffCanvasRight';

// Top bar: title, summary subtitle and the three header toggles plus the
// operation-log launcher.
export default function Header({
  isBinary,
  datatypeLabel,
  minKeys,
  maxKeys,
  orientation,
  setOrientation,
  themeName,
  setThemeName,
  fitToCanvas,
  setFitToCanvas,
  logEntries,
  theme,
}) {
  const subtitle = isBinary
    ? `Binary Search Tree · ${datatypeLabel} keys · 1 key per node, 2 children`
    : `Order-${maxKeys + 1} B-Tree · ${datatypeLabel} keys · root: 1-${maxKeys} keys · other nodes: ${minKeys}-${maxKeys} keys`;

  return (
    <header className="btv-header">
      <h1 className="btv-title">B-Tree Visualizer</h1>
      <span className="btv-subtitle">{subtitle}</span>

      <div className="btv-header-right">
        <button
          className="btv-toggle"
          onClick={() => setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
          title={`Switch to ${orientation === 'horizontal' ? 'vertical' : 'horizontal'} layout`}
        >
          <span className="btv-toggle-icon">
            {orientation === 'horizontal' ? '⇳' : '⇻'}
          </span>
          {orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
        </button>

        <button
          className="btv-toggle"
          onClick={() => setThemeName((t) => (t === 'dark' ? 'light' : 'dark'))}
          title={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span className="btv-toggle-icon">{themeName === 'dark' ? '☼' : '☾'}</span>
          {themeName === 'dark' ? 'Light' : 'Dark'}
        </button>

        <button
          className={`btv-toggle${fitToCanvas ? ' btv-toggle--on' : ''}`}
          onClick={() => setFitToCanvas((f) => !f)}
          title={fitToCanvas ? 'Disable auto-fit' : 'Scale tree to canvas'}
        >
          <span className="btv-toggle-icon">⛶</span>
          Fit {fitToCanvas ? 'On' : 'Off'}
        </button>

        <OffCanvasRight logEntries={logEntries} theme={theme} />
      </div>
    </header>
  );
}
