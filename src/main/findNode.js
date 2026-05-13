// Walk a serialised snapshot tree looking for a node by id.
export default function findNode(snap, id) {
  if (!snap || !id) return null;
  if (snap.id === id) return snap;
  for (const c of snap.children || []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}
