// Kahn's algorithm checks the whole small graph, including indirect cycles.
export function hasDependencyCycle(edges) {
  const incoming = new Map(),
    outgoing = new Map();
  for (const { from, to } of edges) {
    if (!incoming.has(from)) incoming.set(from, 0);
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(to);
  }
  const ready = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index];
    visited++;
    for (const next of outgoing.get(id) ?? []) {
      incoming.set(next, incoming.get(next) - 1);
      if (incoming.get(next) === 0) ready.push(next);
    }
  }
  return visited !== incoming.size;
}
