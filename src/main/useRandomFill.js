import { useCallback, useRef } from 'react';

const CHUNK_SIZE = 500;
const MAX_TRIES_PER_KEY = 32;

// Random Fill runs in time-sliced chunks so even large counts (10k+) stay
// responsive: each chunk does CHUNK_SIZE silent inserts (no stage
// snapshots), then yields to the browser to paint a refreshed snapshot
// before the next chunk. The uniqueness probe has a per-key retry cap so
// a saturated small keyspace (e.g. char, ~94 values) terminates cleanly
// instead of spinning forever.
export default function useRandomFill({
  treeRef,
  datatype,
  fillCount,
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
    treeRef, datatype, fillCount,
    pushSnapshot, addLog, setStaging, setStatusMsg,
  ]);
}
