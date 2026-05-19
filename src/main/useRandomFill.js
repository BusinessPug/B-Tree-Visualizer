import { useCallback, useRef } from 'react';

const CHUNK_SIZE = 500;
const MAX_TRIES_PER_KEY = 32;

// Random Fill runs in time-sliced chunks so even large counts (10k+) stay
// responsive: each chunk does CHUNK_SIZE silent inserts (no stage
// snapshots), then yields to the browser to paint a refreshed snapshot
// before the next chunk.
//
// Uniqueness is enforced via a `Set` populated from the existing tree at
// the start of the fill; subsequent candidates are checked in O(1) rather
// than walking the tree on every attempt. The set survives only for the
// duration of one fill; the next fill rebuilds it from the snapshot.
export default function useRandomFill({
  treeRef,
  datatype,
  fillCount,
  fillStart,
  fillEnd,
  pushSnapshot,
  addLog,
  setStaging,
  setStatusMsg,
}) {
  const fillingRef = useRef(false);

  return useCallback(async () => {
    if (fillingRef.current) return;

    const requested = fillCount;
    if (!Number.isFinite(requested) || requested <= 0) {
      setStatusMsg('Enter a positive count for Random Fill.');
      return;
    }

    // Resolve the active range (if the datatype supports one). Empty /
    // null inputs fall back to the datatype-provided defaults.
    const rangeCfg = datatype.randomRange;
    let start = null;
    let end = null;
    if (rangeCfg) {
      start = Number.isFinite(fillStart) ? fillStart : rangeCfg.defaultStart;
      end = Number.isFinite(fillEnd) ? fillEnd : rangeCfg.defaultEnd;
      if (rangeCfg.kind === 'integer' && start > end) {
        [start, end] = [end, start];
      }
    }

    const rangeKeyspace = rangeCfg && datatype.randomKeyspaceForRange
      ? datatype.randomKeyspaceForRange(start, end)
      : Infinity;
    const keyspace = Math.min(
      datatype.randomKeyspace ?? Infinity,
      rangeKeyspace,
    );
    const target = Math.min(requested, keyspace);
    if (target < requested) {
      addLog(
        `Capped to ${target} — ${datatype.label} keyspace only holds ${keyspace} distinct values.`,
        'info',
      );
    }

    const sample = rangeCfg
      ? () => datatype.random(start, end)
      : () => datatype.random();

    fillingRef.current = true;
    setStaging(true);
    const seen = collectKeys(treeRef.current.snapshot());
    let inserted = 0;
    let exhausted = false;

    try {
      while (inserted < target && !exhausted) {
        const stop = Math.min(inserted + CHUNK_SIZE, target);
        while (inserted < stop) {
          let placed = false;
          for (let tries = 0; tries < MAX_TRIES_PER_KEY; tries++) {
            const v = sample();
            if (!seen.has(v)) {
              treeRef.current.insertSilent(v);
              seen.add(v);
              inserted++;
              placed = true;
              break;
            }
          }
          if (!placed) { exhausted = true; break; }
        }
        pushSnapshot();
        // Yield so React / the browser can repaint between chunks.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 0));
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
  }, [
    treeRef, datatype, fillCount, fillStart, fillEnd,
    pushSnapshot, addLog, setStaging, setStatusMsg,
  ]);
}

function collectKeys(snap) {
  const out = new Set();
  const walk = (n) => {
    if (!n) return;
    for (const k of n.keys) out.add(k);
    if (n.children) for (const c of n.children) walk(c);
  };
  walk(snap);
  return out;
}
