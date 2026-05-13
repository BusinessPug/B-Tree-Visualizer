import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { BTree, BSTree } from './Tree';
import TreeView from './TreeView';
import OffCanvasRight from './OffCanvasRight';
import { THEMES } from './theme';
import { DATATYPES, DEFAULT_DATATYPE } from './datatypes';

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
  // B-tree parameters. We expose min/max keys per non-root node directly
  // to the user since they're more intuitive than CLRS's `t`. The class
  // invariant (max = 2*min, derived t = min + 1) is enforced by validation
  // below before constructing a new BTree. The special case min == max == 1
  // switches to a binary search tree (see BSTree in Tree.js) since a
  // B-tree degenerates at that ratio.
  const DEFAULT_MIN = 2;
  const DEFAULT_MAX = 4;
  const MIN_KEYS_FLOOR = 1;   // t >= 2 (or BST when min == max == 1)
  const MIN_KEYS_CEIL  = 16;  // t <= 17 (gives max=32) — UI sanity cap

  const [datatypeKey, setDatatypeKey] = useState(DEFAULT_DATATYPE);
  const datatype = DATATYPES[datatypeKey];
  const [minKeys, setMinKeys] = useState(DEFAULT_MIN);
  const [maxKeys, setMaxKeys] = useState(DEFAULT_MAX);
  const [pendingMin, setPendingMin] = useState(String(DEFAULT_MIN));
  const [pendingMax, setPendingMax] = useState(String(DEFAULT_MAX));
  const isBinary = minKeys === 1 && maxKeys === 1;
  // The BSTree / BTree share a public API, so the rest of the component
  // never branches on which one is active — only construction differs.
  const makeTree = useCallback((min, max, cmp) => (
    (min === 1 && max === 1)
      ? new BSTree(cmp)
      : new BTree(min + 1, cmp)
  ), []);
  const treeRef = useRef(makeTree(DEFAULT_MIN, DEFAULT_MAX, DATATYPES[DEFAULT_DATATYPE].compare));
  const [snapshot,   setSnapshot]   = useState(() => treeRef.current.snapshot());
  const [inputVal,   setInputVal]   = useState('');
  const [statusMsg,  setStatusMsg]  = useState('');
  const [logEntries, setLogEntries] = useState([]);
  const [walkAnim,   setWalkAnim]   = useState(null);
  const [stageInfo,  setStageInfo]  = useState(null);
  const [staging,    setStaging]    = useState(false);
  const [fillCount,  setFillCount]   = useState(20);
  // Separate string state for the controlled fill-count input so the user
  // can fully erase it (backspace down to empty) without it snapping back
  // to a default value mid-edit. `fillCount` is the validated numeric
  // value; `fillCountInput` is whatever's currently in the field.
  const [fillCountInput, setFillCountInput] = useState('20');
  const [themeName,    setThemeName]   = useState('dark');
  const [orientation,  setOrientation] = useState('horizontal');
  const [fitToCanvas,  setFitToCanvas] = useState(false);
  const theme = THEMES[themeName];
  const busy = walkAnim !== null || staging;

  // Mirror theme on <html> so CSS variables can react.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeName);
  }, [themeName]);

  // Validate the pending order inputs. Returns { ok, t, min, max, error }.
  // Rules: both inputs are positive integers; either min == max == 1
  // (binary search tree mode) or max == 2 * min (the B-tree invariant —
  // every internal node has exactly `keys + 1` children, and for the
  // bottom-up insert/delete to balance, the upper bound must be exactly
  // twice the lower bound); min is bounded for UI sanity.
  const validateOrder = (rawMin, rawMax) => {
    const min = Number.parseInt(rawMin, 10);
    const max = Number.parseInt(rawMax, 10);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { ok: false, error: 'Both fields must be integers.' };
    }
    if (min < MIN_KEYS_FLOOR) {
      return { ok: false, error: `Min keys must be >= ${MIN_KEYS_FLOOR}.` };
    }
    if (min > MIN_KEYS_CEIL) {
      return { ok: false, error: `Min keys must be <= ${MIN_KEYS_CEIL}.` };
    }
    if (min === 1 && max === 1) {
      // Binary search tree mode. t is unused by BSTree but we surface a
      // sentinel here so consumers don't read undefined.
      return { ok: true, t: null, min: 1, max: 1, binary: true };
    }
    if (max <= min) {
      return { ok: false, error: 'Max keys must be greater than min keys (or set both to 1 for a binary tree).' };
    }
    if (max !== 2 * min) {
      return { ok: false, error: `Max keys must equal 2 × min (= ${2 * min}).` };
    }
    return { ok: true, t: min + 1, min, max, binary: false };
  };

  const orderValidation = useMemo(
    () => validateOrder(pendingMin, pendingMax),
    [pendingMin, pendingMax],
  );
  const orderDirty = orderValidation.ok &&
    (orderValidation.min !== minKeys || orderValidation.max !== maxKeys);

  const handleApplyOrder = () => {
    if (!orderValidation.ok || !orderDirty) return;
    const { min, max } = orderValidation;
    treeRef.current = makeTree(min, max, datatype.compare);
    setMinKeys(min);
    setMaxKeys(max);
    pushSnapshot();
    setLogEntries([]);
    setWalkAnim(null);
    setStageInfo(null);
    setStaging(false);
    addLog(
      min === 1 && max === 1
        ? 'Binary tree mode: one key per node, two children.'
        : `Tree order set: min ${min}, max ${max} (overflow at ${max + 1})`,
      'info',
    );
  };

  // Switching the data type rebuilds the tree from scratch: the existing
  // keys would no longer be comparable under the new ordering. The order
  // (min/max) is preserved so the user keeps their structural choice.
  const handleDatatypeChange = (next) => {
    if (next === datatypeKey) return;
    setDatatypeKey(next);
    const cmp = DATATYPES[next].compare;
    treeRef.current = makeTree(minKeys, maxKeys, cmp);
    pushSnapshot();
    setInputVal('');
    setLogEntries([]);
    setWalkAnim(null);
    setStageInfo(null);
    setStaging(false);
    addLog(`Data type set to ${DATATYPES[next].label}. Tree cleared.`, 'info');
  };

  // Convenience: typing the min auto-fills max so the user doesn't have to
  // do the arithmetic themselves; they can still override max manually,
  // which will simply fail validation if the ratio is wrong.
  const handleMinChange = (raw) => {
    setPendingMin(raw);
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= MIN_KEYS_FLOOR) setPendingMax(String(2 * n));
  };

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
    const v = datatype.parse(inputVal);
    if (v === null) {
      setStatusMsg(`Please enter a valid ${datatype.label.toLowerCase()}.`);
      return null;
    }
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
      const shown = datatype.display(value);
      const msg =
        operation === 'insert' ? `Inserted ${shown}` :
        operation === 'delete' ? `Deleted ${shown}`  :
        `Searched ${shown}`;
      if (operation === 'search') {
        addLog(msg, 'search');
        setWalkAnim(null);
        return;
      }
      playStages(stages, msg, operation);
    }, POST_WALK_HOLD_MS);
  }, [walkAnim, playStages, addLog, datatype]);

  const handleInsert = () => {
    const v = parseInput();
    if (v === null) return;
    const { found } = treeRef.current.search(v);
    if (found) { setStatusMsg(`Key ${datatype.display(v)} already exists.`); return; }
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
    if (!found) { setStatusMsg(`Key ${datatype.display(v)} not found.`); return; }
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
    addLog(result.found ? `Found ${datatype.display(v)}` : `Key ${datatype.display(v)} not found`, 'search');
  };

  const handleClear = () => {
    treeRef.current = makeTree(minKeys, maxKeys, datatype.compare);
    pushSnapshot();
    setLogEntries([]);
    setStatusMsg('Tree cleared.');
    setWalkAnim(null);
    setStageInfo(null);
    setStaging(false);
  };

  // Random Fill runs in time-sliced chunks so even large counts (10k+) stay
  // responsive: each chunk does CHUNK_SIZE silent inserts (no stage
  // snapshots), then yields to the browser to paint a refreshed snapshot
  // before the next chunk. The uniqueness probe has a per-key retry cap so
  // a saturated small keyspace (e.g. char, ~94 values) terminates cleanly
  // instead of spinning forever.
  const fillingRef = useRef(false);
  const handleRandomFill = async () => {
    if (fillingRef.current) return;
    const requested = fillCount;
    if (!Number.isFinite(requested) || requested <= 0) {
      setStatusMsg('Enter a positive count for Random Fill.');
      return;
    }
    const keyspace = datatype.randomKeyspace ?? Infinity;
    const target = Math.min(requested, keyspace);
    if (target < requested) {
      addLog(
        `Capped to ${target} — ${datatype.label} keyspace only holds ${keyspace} distinct values.`,
        'info',
      );
    }
    fillingRef.current = true;
    setStaging(true);
    const CHUNK_SIZE = 500;
    const MAX_TRIES_PER_KEY = 32;
    let inserted = 0;
    let exhausted = false;
    try {
      while (inserted < target && !exhausted) {
        const stop = Math.min(inserted + CHUNK_SIZE, target);
        while (inserted < stop) {
          let placed = false;
          for (let tries = 0; tries < MAX_TRIES_PER_KEY; tries++) {
            const v = datatype.random();
            const { found } = treeRef.current.search(v);
            if (!found) {
              treeRef.current.insertSilent(v);
              inserted++;
              placed = true;
              break;
            }
          }
          if (!placed) { exhausted = true; break; }
        }
        pushSnapshot();
        // Yield so React/browser repaint the growing tree between chunks.
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 0));
      }
    } finally {
      fillingRef.current = false;
      setStaging(false);
    }
    addLog(
      exhausted
        ? `Inserted ${inserted} random keys (keyspace exhausted before ${target}).`
        : `Inserted ${inserted} random keys.`,
      'insert',
    );
  };

  return (
    <div className="btv-root">
      <header className="btv-header">
        <h1 className="btv-title">B-Tree Visualizer</h1>
        <span className="btv-subtitle">
          {isBinary
            ? `Binary Search Tree · ${datatype.label} keys · 1 key per node, 2 children`
            : `Order-${maxKeys + 1} B-Tree · ${datatype.label} keys · root: 1-${maxKeys} keys · other nodes: ${minKeys}-${maxKeys} keys`}
        </span>
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
        <label className="btv-datatype">
          <span className="btv-datatype-label">Type</span>
          <select
            className="btv-select"
            value={datatypeKey}
            onChange={e => handleDatatypeChange(e.target.value)}
            disabled={busy}
            title="Changing the data type clears the tree"
          >
            {Object.entries(DATATYPES).map(([k, d]) => (
              <option key={k} value={k}>{d.label}</option>
            ))}
          </select>
        </label>
        <input
          className="btv-input"
          type={datatype.inputType}
          step={datatype.inputStep}
          maxLength={datatype.maxLength}
          placeholder={datatype.placeholder}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !busy && handleInsert()}
        />
        <button className="btv-btn btv-btn-insert" onClick={handleInsert} disabled={busy}>Insert</button>
        <button className="btv-btn btv-btn-delete" onClick={handleDelete} disabled={busy}>Delete</button>
        <button className="btv-btn btv-btn-search" onClick={handleSearch} disabled={busy}>Search</button>
        <input className="btv-input btv-input-fillcount"
          type="number" min="1"
          value={fillCountInput}
          style={{ width: `${Math.max(8, fillCountInput.length || 1)}ch` }}
          onChange={e => {
            const raw = e.target.value;
            setFillCountInput(raw);
            // Update the validated count only when the user has typed
            // something that parses; empty / partial input leaves the
            // previous numeric value untouched so a Random Fill click
            // mid-edit still has a sensible target.
            const n = Number.parseInt(raw, 10);
            if (Number.isFinite(n) && n > 0) setFillCount(n);
          }}
          onBlur={() => {
            // Snap the displayed text back to the validated value on
            // blur, so a cleared field reads the last good count again.
            if (fillCountInput.trim() === '' || !Number.isFinite(Number.parseInt(fillCountInput, 10))) {
              setFillCountInput(String(fillCount));
            }
          }}
          disabled={busy}
        />
        <button className="btv-btn btv-btn-random" onClick={handleRandomFill} disabled={busy}>Random Fill</button>
        <button className="btv-btn btv-btn-clear"  onClick={handleClear}>Clear</button>
      </div>

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
            onChange={e => handleMinChange(e.target.value)}
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
            onChange={e => setPendingMax(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          className="btv-btn btv-btn-apply"
          onClick={handleApplyOrder}
          disabled={busy || !orderValidation.ok || !orderDirty}
          title={orderDirty ? 'Rebuild the tree with these bounds (clears current tree)' : 'No change'}
        >
          Apply
        </button>
        <span className="btv-order-hint">
          {orderValidation.ok
            ? (orderValidation.binary
                ? `Binary tree mode${orderDirty ? ' · applying clears the tree' : ' · active'}`
                : `Overflow at ${orderValidation.max + 1} keys${orderDirty ? ' · applying clears the tree' : ' · active'}`)
            : orderValidation.error}
        </span>
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
