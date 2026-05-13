import { useCallback, useRef } from 'react';

const POST_WALK_HOLD_MS = 600;
const STAGE_MS = 1500;

// Replay a sequence of structural stages with a delay between each.
// Returns a function that takes the stages array and the final
// summary message; the caller is expected to manage the busy flags
// (setStaging, setStageInfo, setWalkAnim) it passes in.
export default function useStagedReplay({
  setSnapshot,
  pushSnapshot,
  setStageInfo,
  setStaging,
  setWalkAnim,
  addLog,
  describeStage,
}) {
  const timeoutsRef = useRef([]);

  const clear = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const play = useCallback((stages, finalMsg, finalKind) => {
    clear();
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
        timeoutsRef.current.push(setTimeout(tick, STAGE_MS));
      } else {
        timeoutsRef.current.push(setTimeout(() => {
          setStageInfo(null);
          setStaging(false);
          setWalkAnim(null);
          addLog(finalMsg, finalKind);
        }, STAGE_MS));
      }
    };
    tick();
  }, [
    clear, setSnapshot, pushSnapshot, setStageInfo, setStaging, setWalkAnim,
    addLog, describeStage,
  ]);

  return { play, POST_WALK_HOLD_MS };
}
