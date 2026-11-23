// A* path finding for the visualizer (AI-written, separate from the original code).
//
// It works directly on a World from ../worlds.js: rooms are looked up with
// world.roomWithID(id) and neighbours come only from room.exits. Nothing is
// precomputed; all bookkeeping is filled in while the search runs.
//
// How it works:
//   g(room) = number of steps from the start to this room (known so far)
//   h(room) = estimated steps from this room to the goal (Manhattan distance)
//   f(room) = g + h
// Each step takes the room with the lowest f out of the "open" list, and
// stops when that room is the goal. Every exit costs 1 step and the Manhattan
// distance never overestimates, so the path found is a shortest path.

// Room position in the grid. addRooms2DWorld numbers rooms row by row,
// so id = y * width + x. For a 1D world width = room count, so y is always 0.
function manhattan(aID, bID, width) {
  const ax = aID % width, ay = Math.floor(aID / width);
  const bx = bID % width, by = Math.floor(bID / width);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function aStar(world, startID, goalID, width) {
  const open = [startID];        // rooms found but not yet explored
  const closed = new Set();      // rooms already explored
  const gScore = new Map([[startID, 0]]);
  const cameFrom = new Map();    // room -> the room we reached it from
  let expanded = 0;

  const f = (id) => gScore.get(id) + manhattan(id, goalID, width);

  while (open.length > 0) {
    // pick the open room with the lowest f (on a tie, the one furthest from the start)
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i], b = open[bestIndex];
      if (f(a) < f(b) || (f(a) === f(b) && gScore.get(a) > gScore.get(b))) {
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0];

    if (current === goalID) {
      // walk back from the goal to the start
      const path = [current];
      while (cameFrom.has(path[0])) {
        path.unshift(cameFrom.get(path[0]));
      }
      return { path, expanded };
    }

    closed.add(current);
    expanded++;

    for (const exit of world.roomWithID(current).exits) {
      if (closed.has(exit)) continue;

      const newG = gScore.get(current) + 1;
      if (!gScore.has(exit) || newG < gScore.get(exit)) {
        gScore.set(exit, newG);
        cameFrom.set(exit, current);
        if (!open.includes(exit)) open.push(exit);
      }
    }
  }

  return { path: null, expanded }; // goal can't be reached
}
