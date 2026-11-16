// physics.js — the one collision helper every mover uses: a circle in XZ
// pushed out of AABB colliders. Shared so player and bots never drift apart.
export function collideCircle(pos, radius, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const b = colliders[i];
    if (b.max.y < 0.05 || b.min.y > 1.7) continue;
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      const px = Math.min(pos.x - b.min.x + radius, b.max.x - pos.x + radius);
      const pz = Math.min(pos.z - b.min.z + radius, b.max.z - pos.z + radius);
      if (px < pz) pos.x += pos.x - b.min.x < b.max.x - pos.x ? -px : px;
      else pos.z += pos.z - b.min.z < b.max.z - pos.z ? -pz : pz;
    }
  }
  pos.x = Math.max(-27.4, Math.min(27.4, pos.x));
  pos.z = Math.max(-19.4, Math.min(19.4, pos.z));
}

// Breadth-first route over the waypoint graph: returns an array of waypoint
// ids from `from` to `to` (excluding `from`), or [] when unreachable.
export function findRoute(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Map();
  const queue = [from];
  prev.set(from, null);
  while (queue.length > 0) {
    const cur = queue.shift();
    const node = waypoints.find((w) => w.id === cur);
    if (!node) continue;
    for (const next of node.links) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let at = cur;
        while (at !== null) {
          path.unshift(at);
          at = prev.get(at);
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return [];
}

export function nearestWaypoint(waypoints, x, z) {
  let best = waypoints[0];
  let bestD = Infinity;
  for (const w of waypoints) {
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best.id;
}
