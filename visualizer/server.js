// Visualizer server. Uses the World class (and its BFS1 method) from ../worlds.js unchanged.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { World } from "../worlds.js";
import { aStar } from "./astar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_SIDE = 100; // BFS1 is roughly O(n^2) and blocks the server, so keep worlds reasonable
const MAX_STORED_WORLDS = 20;

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
  if (worlds.size > MAX_STORED_WORLDS) {
    worlds.delete(worlds.keys().next().value); // drop the oldest
  }

  res.json({
    id: world.id,
    name: world.name,
    width,
    height,
    dimensions: hasHeight ? 2 : 1,
    rooms: world.roomArray,
  });
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

  const t0 = performance.now();
  if (algo === "astar") {
    const { path, expanded } = aStar(world, start, goal, width);
    const ms = performance.now() - t0;
    return res.json({ path, ms, algo, expanded });
  }
  const path = world.BFS1(start, goal);
  const ms = performance.now() - t0;
  res.json({ path, ms, algo });
});

app.listen(PORT, () => {
  console.log(`World visualizer running at http://localhost:${PORT}`);
});
