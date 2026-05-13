import React, { useState, useCallback, useRef, useEffect } from 'react';
import { BTree } from './Tree';
import TreeView from './TreeView';
import OffCanvasRight from './OffCanvasRight';
import { THEMES } from './theme';

const POST_WALK_HOLD_MS = 600;
const STAGE_MS          = 1500;
let animIdCounter = 0;

// Walk the snapshot tree looking for a node by id.
function findNode(snap, id) {
  if (!snap || !id) return null;
  if (snap.id === id) return snap;
  for (const c of snap.children || []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

const fmtKeys = (keys) => keys?.length ? `[${keys.join(', ')}]` : '[]';

// Produce a human-readable explanation for a structural stage so the
// operation log records *why* a split / merge / borrow occurred, not just
// that one happened.
function describeStage(stage) {
  const { kind, snapshot: snap, focusIds = [], meta } = stage;
  switch (kind) {
    case 'leaf-insert':
    case 'leaf-delete':
      // The headline "Inserted X" / "Deleted X" already covers these.
      return null;
    case 'overflow': {
      const n = findNode(snap, meta?.nodeId);
      if (!n) return 'Node overflowed (5 keys).';
      const median = n.keys[meta.medianIndex];
      return `Overflow ${fmtKeys(n.keys)} — reached 5 keys (max 4); median ${median} will be promoted.`;
    }
    case 'split': {
      const left  = findNode(snap, meta?.leftId);
      const right = findNode(snap, meta?.rightId);
      if (!left || !right) return 'Split: median promoted, right half became new sibling.';
      return `Split → left ${fmtKeys(left.keys)} · median promoted to parent · right ${fmtKeys(right.keys)}.`;
    }
    case 'root-split': {
      const newRoot = snap;
      const left  = newRoot.children?.[0];
      const right = newRoot.children?.[1];
      return `Root split — tree grew one level. New root ${fmtKeys(newRoot.keys)} over ${fmtKeys(left?.keys || [])} and ${fmtKeys(right?.keys || [])}.`;
    }
    case 'borrow-left': {
      // focusIds = [parent, leftSibling, child]
      const child = findNode(snap, focusIds[2]);
      const sib   = findNode(snap, focusIds[1]);
      return `Borrow from left sibling: child became ${fmtKeys(child?.keys || [])}, sibling now ${fmtKeys(sib?.keys || [])} — child was under minimum (2 keys).`;
    }
    case 'borrow-right': {
      const child = findNode(snap, focusIds[2]);
      const sib   = findNode(snap, focusIds[1]);
      return `Borrow from right sibling: child became ${fmtKeys(child?.keys || [])}, sibling now ${fmtKeys(sib?.keys || [])} — child was under minimum (2 keys).`;
    }
    case 'merge': {
      // focusIds = [parent, mergedChild]
      const merged = findNode(snap, focusIds[1]);
      return `Merge — both siblings at minimum, pulled separator down. Merged node now ${fmtKeys(merged?.keys || [])}.`;
    }
    case 'merge-drop': {
      // focusIds = [parent, mergedChild] (separator was the deleted key)
      const merged = findNode(snap, focusIds[1]);
      return `Merged two minimum children, dropping the separator (the deleted key). Merged node now ${fmtKeys(merged?.keys || [])}.`;
    }
    case 'replace-pred': {
      // focusIds = [internalNode, leftChild]
      const lc = findNode(snap, focusIds[1]);
      return `Internal key replaced by in-order predecessor from left subtree ${fmtKeys(lc?.keys || [])}; now recursing to remove it from the leaf.`;
    }
    case 'replace-succ': {
      const rc = findNode(snap, focusIds[1]);
      return `Internal key replaced by in-order successor from right subtree ${fmtKeys(rc?.keys || [])}; now recursing to remove it from the leaf.`;
    }
    case 'root-collapse':
      return `Root collapsed — only child promoted to root ${fmtKeys(snap.keys)}. Tree shrank one level.`;
    default:
      return null;
  }
}

const MainComponent = () => {
  const treeRef = useRef(new BTree());
  const [snapshot,   setSnapshot]   = useState(() => treeRef.current.snapshot());
  const [inputVal,   setInputVal]   = useState('');
  const [statusMsg,  setStatusMsg]  = useState('');
  const [logEntries, setLogEntries] = useState([]);
  const [walkAnim,   setWalkAnim]   = useState(null);
  const [stageInfo,  setStageInfo]  = useState(null);
  const [staging,    setStaging]    = useState(false);
  const [fillCount,  setFillCount]   = useState(20);
  const [themeName,    setThemeName]   = useState('dark');
  const [orientation,  setOrientation] = useState('horizontal');
  const [fitToCanvas,  setFitToCanvas] = useState(false);
  const theme = THEMES[themeName];
  const busy = walkAnim !== null || staging;

  // Mirror theme on <html> so CSS variables can react.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeName);
  }, [themeName]);

  const pushSnapshot = useCallback(() => setSnapshot(treeRef.current.snapshot()), []);

  // Each log entry carries a `kind` so the off-canvas panel can colour-code
  // by operation / structural event. `setStatusMsg` only fires for entries
  // we want to surface as the headline status under the controls.
  const logIdRef = useRef(0);
  const addLog = useCallback((msg, kind = 'info', { silentStatus = false } = {}) => {
    setLogEntries(prev => [{ id: ++logIdRef.current, msg, kind }, ...prev].slice(0, 80));
    if (!silentStatus) setStatusMsg(msg);
  }, []);

  const parseInput = () => {
    const v = Number.parseInt(inputVal, 10);
    if (Number.isNaN(v)) { setStatusMsg('Please enter a valid integer.'); return null; }
    return v;
  };

  // Walk the chip along `walkAnim.steps`; when finished, run `commitFn` to
  // get the array of intermediate snapshots produced by the operation and
  // replay them one by one so splits and merges become visible.
  const playStages = useCallback((stages, finalMsg, finalKind) => {
    if (!stages || stages.length === 0) {
      pushSnapshot();
      addLog(finalMsg, finalKind);
      setStageInfo(null);
      setStaging(false);
      setWalkAnim(null);
      return;
    }
    setStaging(true);
    let i = 0;
    const tick = () => {
      const stage = stages[i];
      setSnapshot(stage.snapshot);
      setStageInfo({ kind: stage.kind, focusIds: stage.focusIds, meta: stage.meta });
      const detail = describeStage(stage);
      if (detail) addLog(detail, stage.kind, { silentStatus: true });
      i++;
      if (i < stages.length) {
        setTimeout(tick, STAGE_MS);
      } else {
        setTimeout(() => {
          setStageInfo(null);
          setStaging(false);
          setWalkAnim(null);
          addLog(finalMsg, finalKind);
        }, STAGE_MS);
      }
    };
    tick();
  }, [pushSnapshot, addLog]);

  const handleWalkDone = useCallback(() => {
    if (!walkAnim) return;
    const { commitFn, value, operation } = walkAnim;
    setTimeout(() => {
      const stages = commitFn();
      const msg =
        operation === 'insert' ? `Inserted ${value}` :
        operation === 'delete' ? `Deleted ${value}`  :
        `Searched ${value}`;
      if (operation === 'search') {
        addLog(msg, 'search');
        setWalkAnim(null);
        return;
      }
      playStages(stages, msg, operation);
    }, POST_WALK_HOLD_MS);
  }, [walkAnim, playStages, addLog]);

  const handleInsert = () => {
    const v = parseInput();
    if (v === null) return;
    const { found } = treeRef.current.search(v);
    if (found) { setStatusMsg(`Key ${v} already exists.`); return; }
    const rawPath = treeRef.current.insertPath(v);
    const steps = rawPath.map((s, i) => ({
      nodeId: s.nodeId, keys: s.keys, value: v,
      action: i === rawPath.length - 1 ? 'land' : 'traverse',
    }));
    setInputVal('');
    setWalkAnim({
      id: ++animIdCounter, operation: 'insert', steps, value: v,
      commitFn: () => treeRef.current.insert(v),
    });
  };

  const handleDelete = () => {
    const v = parseInput();
    if (v === null) return;
    const { found } = treeRef.current.search(v);
    if (!found) { setStatusMsg(`Key ${v} not found.`); return; }
    const rawPath = treeRef.current.deletePath(v);
    const steps = rawPath.map(s => ({ ...s, value: v }));
    setInputVal('');
    setWalkAnim({
      id: ++animIdCounter, operation: 'delete', steps, value: v,
      commitFn: () => treeRef.current.delete(v),
    });
  };

  const handleSearch = () => {
    const v = parseInput();
    if (v === null) return;
    const result = treeRef.current.search(v);
    const steps = result.path.map((s, i) => ({
      nodeId: s.nodeId, keys: s.keys, value: v,
      action: (result.found && i === result.path.length - 1) ? 'found' : 'traverse',
      keyIndex: s.keyIndex,
    }));
    setWalkAnim({
      id: ++animIdCounter, operation: 'search', steps, value: v,
      commitFn: () => [],
    });
    addLog(result.found ? `Found ${v}` : `Key ${v} not found`, 'search');
  };

  const handleClear = () => {
    treeRef.current = new BTree();
    pushSnapshot();
    setLogEntries([]);
    setStatusMsg('Tree cleared.');
    setWalkAnim(null);
    setStageInfo(null);
    setStaging(false);
  };

  const handleRandomFill = () => {
    let inserted = 0;
    while (inserted < fillCount) {
      const v = Math.floor(Math.random() * 20000) + 1;
      const { found } = treeRef.current.search(v);
      if (!found) { treeRef.current.insert(v); inserted++; }
    }
    pushSnapshot();
    addLog(`Inserted ${fillCount} random keys`, 'insert');
  };

  return (
    <div className="btv-root">
      <header className="btv-header">
        <h1 className="btv-title">B-Tree Visualizer</h1>
        <span className="btv-subtitle">Order-5 B-Tree · root: 1-4 keys · other nodes: 2-4 keys</span>
        <div className="btv-header-right">
          <button
            className="btv-toggle"
            onClick={() => setOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal')}
            title={`Switch to ${orientation === 'horizontal' ? 'vertical' : 'horizontal'} layout`}
          >
            <span className="btv-toggle-icon">{orientation === 'horizontal' ? '⇳' : '⇻'}</span>
            {orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
          </button>
          <button
            className="btv-toggle"
            onClick={() => setThemeName(t => t === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span className="btv-toggle-icon">{themeName === 'dark' ? '☼' : '☾'}</span>
            {themeName === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            className={`btv-toggle${fitToCanvas ? ' btv-toggle--on' : ''}`}
            onClick={() => setFitToCanvas(f => !f)}
            title={fitToCanvas ? 'Disable auto-fit' : 'Scale tree to canvas'}
          >
            <span className="btv-toggle-icon">⛶</span>
            Fit {fitToCanvas ? 'On' : 'Off'}
          </button>
          <OffCanvasRight logEntries={logEntries} theme={theme} />
        </div>
      </header>

      <div className="btv-controls">
        <input
          className="btv-input"
          type="number"
          placeholder="Enter integer key"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !busy && handleInsert()}
        />
        <button className="btv-btn btv-btn-insert" onClick={handleInsert} disabled={busy}>Insert</button>
        <button className="btv-btn btv-btn-delete" onClick={handleDelete} disabled={busy}>Delete</button>
        <button className="btv-btn btv-btn-search" onClick={handleSearch} disabled={busy}>Search</button>
        <input className="btv-input btv-input-fillcount"
          type="number" min="1" max="10000"
          value={fillCount}
          defaultValue={20}
          style={{ width: `${Math.max(8, String(fillCount).length)}ch` }}
          onChange={e => setFillCount(Number.parseInt(e.target.value, 10) || 20)}
          disabled={busy}
        />
        <button className="btv-btn btv-btn-random" onClick={handleRandomFill} disabled={busy}>Random Fill</button>
        <button className="btv-btn btv-btn-clear"  onClick={handleClear}>Clear</button>
      </div>

      {statusMsg && <div className="btv-status">{statusMsg}</div>}

      <div className="btv-canvas">
        <TreeView
          treeSnapshot={snapshot}
          walkAnim={walkAnim}
          stageInfo={stageInfo}
          onWalkDone={handleWalkDone}
          orientation={orientation}
          theme={theme}
          fitToCanvas={fitToCanvas}
        />
      </div>
    </div>
  );
};

export default MainComponent;
