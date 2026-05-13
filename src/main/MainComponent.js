import React, {
  useState, useCallback, useRef, useEffect, useMemo,
} from 'react';

import TreeView from '../treeView';
import { THEMES } from '../theme';
import { DATATYPES, DEFAULT_DATATYPE } from '../datatypes';

import Header from './Header';
import Controls from './Controls';
import OrderBar from './OrderBar';
import describeStage from './describeStage';
import useStagedReplay from './useStagedReplay';
import useRandomFill from './useRandomFill';
import {
  DEFAULT_MIN, DEFAULT_MAX, makeTree, validateOrder,
} from './treeConfig';

let animIdCounter = 0;

export default function MainComponent() {
  // Tree configuration
  const [datatypeKey, setDatatypeKey] = useState(DEFAULT_DATATYPE);
  const datatype = DATATYPES[datatypeKey];
  const [minKeys, setMinKeys] = useState(DEFAULT_MIN);
  const [maxKeys, setMaxKeys] = useState(DEFAULT_MAX);
  const [pendingMin, setPendingMin] = useState(String(DEFAULT_MIN));
  const [pendingMax, setPendingMax] = useState(String(DEFAULT_MAX));
  const isBinary = minKeys === 1 && maxKeys === 1;

  const treeRef = useRef(makeTree(DEFAULT_MIN, DEFAULT_MAX, datatype.compare));

  // Tree state
  const [snapshot, setSnapshot] = useState(() => treeRef.current.snapshot());
  const pushSnapshot = useCallback(() => {
    setSnapshot(treeRef.current.snapshot());
  }, []);

  // Operation state
  const [inputVal, setInputVal] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [logEntries, setLogEntries] = useState([]);
  const [walkAnim, setWalkAnim] = useState(null);
  const [stageInfo, setStageInfo] = useState(null);
  const [staging, setStaging] = useState(false);
  const [fillCount, setFillCount] = useState(20);
  // The fill-count input is a separate string so the user can backspace
  // it down to empty without it snapping back to a default mid-edit.
  const [fillCountInput, setFillCountInput] = useState('20');

  // UI state
  const [themeName, setThemeName] = useState('dark');
  const [orientation, setOrientation] = useState('horizontal');
  const [fitToCanvas, setFitToCanvas] = useState(false);
  const theme = THEMES[themeName];

  const busy = walkAnim !== null || staging;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeName);
  }, [themeName]);

  // Operation log

  const logIdRef = useRef(0);
  const addLog = useCallback((msg, kind = 'info', { silentStatus = false } = {}) => {
    setLogEntries((prev) => (
      [{ id: ++logIdRef.current, msg, kind }, ...prev].slice(0, 80)
    ));
    if (!silentStatus) setStatusMsg(msg);
  }, []);

  // Staged replay + bulk fill
  const { play: playStages, POST_WALK_HOLD_MS } = useStagedReplay({
    setSnapshot,
    pushSnapshot,
    setStageInfo,
    setStaging,
    setWalkAnim,
    addLog,
    describeStage,
  });

  const handleRandomFill = useRandomFill({
    treeRef, datatype, fillCount,
    pushSnapshot, addLog, setStaging, setStatusMsg,
  });

  // Order validation

  const orderValidation = useMemo(
    () => validateOrder(pendingMin, pendingMax),
    [pendingMin, pendingMax],
  );
  const orderDirty = orderValidation.ok && (
    orderValidation.min !== minKeys || orderValidation.max !== maxKeys
  );

  // Handlers

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

  // Switching the data type rebuilds the tree; existing keys would no
  // longer be comparable under the new ordering. The min/max bounds are
  // preserved so the user keeps their structural choice.
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

  // Typing min auto-fills max so the user does not have to do the
  // arithmetic; they can still override max manually (it will simply
  // fail validation if the ratio is wrong).
  const handleMinChange = (raw) => {
    setPendingMin(raw);
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1) setPendingMax(String(2 * n));
  };

  const parseInput = () => {
    const v = datatype.parse(inputVal);
    if (v === null) {
      setStatusMsg(`Please enter a valid ${datatype.label.toLowerCase()}.`);
      return null;
    }
    return v;
  };

  const handleInsert = () => {
    const v = parseInput();
    if (v === null) return;
    const { found } = treeRef.current.search(v);
    if (found) {
      setStatusMsg(`Key ${datatype.display(v)} already exists.`);
      return;
    }
    const rawPath = treeRef.current.insertPath(v);
    const steps = rawPath.map((s, i) => ({
      nodeId: s.nodeId,
      keys: s.keys,
      value: v,
      action: i === rawPath.length - 1 ? 'land' : 'traverse',
    }));
    setInputVal('');
    setWalkAnim({
      id: ++animIdCounter,
      operation: 'insert',
      steps,
      value: v,
      commitFn: () => treeRef.current.insert(v),
    });
  };

  const handleDelete = () => {
    const v = parseInput();
    if (v === null) return;
    const { found } = treeRef.current.search(v);
    if (!found) {
      setStatusMsg(`Key ${datatype.display(v)} not found.`);
      return;
    }
    const rawPath = treeRef.current.deletePath(v);
    const steps = rawPath.map((s) => ({ ...s, value: v }));
    setInputVal('');
    setWalkAnim({
      id: ++animIdCounter,
      operation: 'delete',
      steps,
      value: v,
      commitFn: () => treeRef.current.delete(v),
    });
  };

  const handleSearch = () => {
    const v = parseInput();
    if (v === null) return;
    const result = treeRef.current.search(v);
    const steps = result.path.map((s, i) => ({
      nodeId: s.nodeId,
      keys: s.keys,
      value: v,
      action: (result.found && i === result.path.length - 1) ? 'found' : 'traverse',
      keyIndex: s.keyIndex,
    }));
    setWalkAnim({
      id: ++animIdCounter,
      operation: 'search',
      steps,
      value: v,
      commitFn: () => [],
    });
    addLog(
      result.found
        ? `Found ${datatype.display(v)}`
        : `Key ${datatype.display(v)} not found`,
      'search',
    );
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

  const handleWalkDone = useCallback(() => {
    if (!walkAnim) return;
    const { commitFn, value, operation } = walkAnim;
    setTimeout(() => {
      const stages = commitFn();
      const shown = datatype.display(value);
      const msg = operation === 'insert' ? `Inserted ${shown}`
        : operation === 'delete' ? `Deleted ${shown}`
        : `Searched ${shown}`;
      if (operation === 'search') {
        addLog(msg, 'search');
        setWalkAnim(null);
        return;
      }
      playStages(stages, msg, operation);
    }, POST_WALK_HOLD_MS);
  }, [walkAnim, playStages, addLog, datatype, POST_WALK_HOLD_MS]);

  return (
    <div className="btv-root">
      <Header
        isBinary={isBinary}
        datatypeLabel={datatype.label}
        minKeys={minKeys}
        maxKeys={maxKeys}
        orientation={orientation}
        setOrientation={setOrientation}
        themeName={themeName}
        setThemeName={setThemeName}
        fitToCanvas={fitToCanvas}
        setFitToCanvas={setFitToCanvas}
        logEntries={logEntries}
        theme={theme}
      />

      <Controls
        datatypeKey={datatypeKey}
        onDatatypeChange={handleDatatypeChange}
        datatype={datatype}
        inputVal={inputVal}
        setInputVal={setInputVal}
        onInsert={handleInsert}
        onDelete={handleDelete}
        onSearch={handleSearch}
        onRandomFill={handleRandomFill}
        onClear={handleClear}
        fillCountInput={fillCountInput}
        setFillCountInput={setFillCountInput}
        fillCount={fillCount}
        setFillCount={setFillCount}
        busy={busy}
      />

      <OrderBar
        pendingMin={pendingMin}
        pendingMax={pendingMax}
        onMinChange={handleMinChange}
        onMaxChange={setPendingMax}
        onApply={handleApplyOrder}
        orderValidation={orderValidation}
        orderDirty={orderDirty}
        busy={busy}
      />

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
}
