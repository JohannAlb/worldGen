// Runs one path search off the main server thread, so the server can stop it
// if it takes too long. The original BFS1 from ../worlds.js is used unchanged.
import { parentPort, workerData } from "node:worker_threads";
import { World } from "../worlds.js";
import { aStar } from "./astar.js";

const { rooms, width, algo, start, goal } = workerData;

// Rebuild a World around the copied rooms without calling the constructor
// (that would generate a brand new world). BFS1 and roomWithID only use roomArray.
const world = Object.assign(Object.create(World.prototype), { roomArray: rooms });

const t0 = performance.now();
if (algo === "astar") {
  const { path, expanded } = aStar(world, start, goal, width);
  parentPort.postMessage({ path, expanded, ms: performance.now() - t0 });
} else {
  const path = world.BFS1(start, goal);
  parentPort.postMessage({ path, ms: performance.now() - t0 });
}
