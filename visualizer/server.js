// Visualizer server. Uses the World class (and its BFS1 method) from ../worlds.js unchanged.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { World } from "../worlds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_SIDE = 1000;
// A 1000x1000 world uses roughly 330 MB, so stored worlds are limited by total room count.
const MAX_STORED_ROOMS = 2_000_000;
// Bigger worlds are not sent to the browser in one go; it asks for single rooms on hover.
const INLINE_ROOM_LIMIT = 40_000;
// Path finding runs in a worker thread and is stopped after this long (BFS1 is ~O(n^2)).
const PATH_TIMEOUT_MS = 30_000;

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Generated worlds kept in memory so path finding runs on the exact same world that is drawn.
// Stored as { world, width } so A* knows the grid width for its heuristic.
const worlds = new Map();
const ALGORITHMS = ["bfs", "astar"];

function parseSide(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SIDE ? n : null;
}

app.get("/", (req, res) => {
  res.render("index", { maxSide: MAX_SIDE });
});

app.post("/api/world", (req, res) => {
  const width = parseSide(req.body.width);
  const hasHeight = req.body.height !== undefined && req.body.height !== null && req.body.height !== "";
  const height = hasHeight ? parseSide(req.body.height) : 1;

  if (width === null || height === null) {
    return res.status(400).json({ error: `Width and height must be whole numbers from 1 to ${MAX_SIDE}.` });
  }

  // 1 dimension -> "string world", 2 dimensions -> 2D grid world
  const world = new World(hasHeight ? [width, height] : [width]);

  worlds.set(world.id, { world, width });
  let storedRooms = 0;
  for (const entry of worlds.values()) storedRooms += entry.world.roomArray.length;
  for (const [id, entry] of worlds) {
    if (storedRooms <= MAX_STORED_ROOMS || id === world.id) break;
    storedRooms -= entry.world.roomArray.length;
    worlds.delete(id); // drop the oldest
  }

  const roomCount = world.roomArray.length;
  res.json({
    id: world.id,
    name: world.name,
    width,
    height,
    dimensions: hasHeight ? 2 : 1,
    roomCount,
    rooms: roomCount <= INLINE_ROOM_LIMIT ? world.roomArray : null,
  });
});

// Single room lookup (used for hover info on big worlds).
app.get("/api/world/:id/room/:roomId", (req, res) => {
  const entry = worlds.get(Number(req.params.id));
  if (!entry) {
    return res.status(404).json({ error: "World not found (it may have expired). Generate a new one." });
  }
  const room = entry.world.roomWithID(Number(req.params.roomId));
  if (!room) {
    return res.status(404).json({ error: "Room not found." });
  }
  res.json(room);
});

app.get("/api/world/:id/path", (req, res) => {
  const entry = worlds.get(Number(req.params.id));
  if (!entry) {
    return res.status(404).json({ error: "World not found (it may have expired). Generate a new one." });
  }

  const { world, width } = entry;

  const algo = req.query.algo ?? "bfs";
  if (!ALGORITHMS.includes(algo)) {
    return res.status(400).json({ error: `Unknown algorithm "${algo}". Use bfs or astar.` });
  }

  const start = Number(req.query.start);
  const goal = Number(req.query.goal);
  const isRoom = (id) => Number.isInteger(id) && world.roomWithID(id) !== undefined;

  if (!isRoom(start) || !isRoom(goal)) {
    return res.status(400).json({ error: `Start and goal must be room IDs from 0 to ${world.roomArray.length - 1}.` });
  }

  // BFS1 never finishes when start === goal, so answer that case here.
  if (start === goal) {
    return res.json({ path: [start], ms: 0, algo, note: "Start and goal are the same room." });
  }

  // Run the search in a worker thread so a slow search can't freeze the server.
  const worker = new Worker(new URL("./pathWorker.js", import.meta.url), {
    workerData: { rooms: world.roomArray, width, algo, start, goal },
  });
  let finished = false;
  const finish = () => {
    finished = true;
    clearTimeout(timer);
    worker.terminate();
  };

  const timer = setTimeout(() => {
    if (finished) return;
    finish();
    const name = algo === "astar" ? "A*" : "BFS1";
    res.status(408).json({
      error: `${name} was stopped after ${PATH_TIMEOUT_MS / 1000} s, too slow for this world size.`
        + (algo === "bfs" ? " Try A*." : ""),
    });
  }, PATH_TIMEOUT_MS);

  worker.on("message", (result) => {
    if (finished) return;
    finish();
    res.json({ ...result, algo });
  });
  worker.on("error", (err) => {
    if (finished) return;
    finish();
    res.status(500).json({ error: `Path finding failed: ${err.message}` });
  });
  // Client went away (e.g. it started a new search): stop the work.
  res.on("close", () => {
    if (!finished) finish();
  });
});

app.listen(PORT, () => {
  console.log(`World visualizer running at http://localhost:${PORT}`);
});
