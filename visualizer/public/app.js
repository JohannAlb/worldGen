// Client side of the visualizer: draws the world returned by the server and
// shows the path found by the student's BFS1 function (or the separate A*).
//
// Two render modes:
//   "dom"    – small worlds: one <div> per room, all room data sent up front.
//   "canvas" – big worlds: drawn on a <canvas>, room data fetched one room at a time on hover.

const $ = (id) => document.getElementById(id);

const stage = $("stage");
const gridWrap = $("gridWrap");
const grid = $("grid");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const overlay = $("overlay");

const ALGO_NAMES = { bfs: "BFS1", astar: "A*" };

let world = null;      // { id, name, width, height, roomCount, rooms (null for big worlds) }
let mode = "dom";
let cellSize = 0;      // CSS pixels per room
let pickNext = "start";
let pathIds = [];      // current path (room ids)

// dom mode
let cells = [];        // index = room id -> div
let roomsById = new Map();
let highlighted = [];  // cells currently marked hovered/exit

// canvas mode
let hoverId = null;
let hoverRoom = null;  // room data for hoverId once fetched
let hoverTimer = null;
let hoverAbort = null;

let searchAbort = null;

// ---------- layout: fit the whole grid inside the stage ----------
function fitGrid() {
  if (!world) return;
  const cs = getComputedStyle(stage);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  cellSize = Math.min(availW / world.width, availH / world.height);
  const w = cellSize * world.width;
  const h = cellSize * world.height;
  gridWrap.style.width = w + "px";
  gridWrap.style.height = h + "px";
  grid.classList.toggle("small", cellSize < 28);

  if (mode === "canvas") {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    draw();
  }
}
new ResizeObserver(fitGrid).observe(stage);

// Room position in the grid. addRooms2DWorld numbers rooms row by row,
// so id = y * width + x.
function cellCenter(id) {
  return [(id % world.width) + 0.5, Math.floor(id / world.width) + 0.5];
}

const startId = () => ($("start").value === "" ? null : Number($("start").value));
const goalId = () => ($("goal").value === "" ? null : Number($("goal").value));

// ---------- generate ----------
$("worldForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("worldError").textContent = "";
  const button = e.target.querySelector("button");
  button.disabled = true;
  button.textContent = "Generating…";
  const body = { width: $("width").value, height: $("height").value };
  try {
    const res = await fetch("/api/world", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderWorld(data);
  } catch (err) {
    $("worldError").textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "Generate";
  }
});

function renderWorld(data) {
  searchAbort?.abort();
  world = data;
  mode = data.rooms ? "dom" : "canvas";
  $("worldName").textContent =
    `${data.name} (${data.width}×${data.height}, ${data.roomCount.toLocaleString()} rooms)`;
  overlay.setAttribute("viewBox", `0 0 ${data.width} ${data.height}`);

  grid.hidden = mode !== "dom";
  canvas.hidden = mode !== "canvas";
  cells = [];
  roomsById = new Map();
  highlighted = [];
  hoverId = null;
  hoverRoom = null;

  if (mode === "dom") {
    roomsById = new Map(data.rooms.map((r) => [r.id, r]));
    grid.style.gridTemplateColumns = `repeat(${data.width}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${data.height}, 1fr)`;
    const frag = document.createDocumentFragment();
    for (const room of data.rooms) {
      const div = document.createElement("div");
      div.className = "cell";
      div.dataset.id = room.id;
      div.textContent = room.id;
      const [cx, cy] = cellCenter(room.id);
      div.style.gridColumn = cx + 0.5;
      div.style.gridRow = cy + 0.5;
      cells[room.id] = div;
      frag.appendChild(div);
    }
    grid.replaceChildren(frag);
  } else {
    grid.replaceChildren();
  }

  const maxId = data.roomCount - 1;
  $("start").max = maxId;
  $("goal").max = maxId;
  $("start").value = "";
  $("goal").value = "";
  pickNext = "start";
  clearPath();
  showRoom(null);
  fitGrid();
}

// ---------- canvas drawing (big worlds) ----------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw() {
  if (mode !== "canvas" || !world) return;
  const W = world.width, H = world.height;
  const px = canvas.width / W;            // device pixels per room
  const dpr = canvas.width / (cellSize * W);

  ctx.fillStyle = cssVar("--cell");
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grid lines only when rooms are big enough to see them
  if (cellSize >= 4) {
    ctx.strokeStyle = cssVar("--cell-line");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) {
      const p = Math.round(x * px) + 0.5;
      ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height);
    }
    for (let y = 0; y <= H; y++) {
      const p = Math.round(y * px) + 0.5;
      ctx.moveTo(0, p); ctx.lineTo(canvas.width, p);
    }
    ctx.stroke();
  }

  // a room as a filled square, or as a dot when rooms are too small to see
  const mark = (id, color, dotRadius) => {
    if (id === null || id < 0 || id >= world.roomCount) return;
    const x = id % W, y = Math.floor(id / W);
    ctx.fillStyle = color;
    if (cellSize >= 6 || !dotRadius) {
      ctx.fillRect(Math.floor(x * px), Math.floor(y * px), Math.max(1, Math.ceil(px)), Math.max(1, Math.ceil(px)));
    } else {
      ctx.beginPath();
      ctx.arc((x + 0.5) * px, (y + 0.5) * px, dotRadius * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const pathColor = cssVar("--path-cell");
  for (const id of pathIds) mark(id, pathColor, 0);

  if (hoverRoom && hoverRoom.id === hoverId) {
    const exitColor = cssVar("--exit");
    for (const exitId of hoverRoom.exits) mark(exitId, exitColor, 3);
  }
  mark(startId(), cssVar("--start"), 5);
  mark(goalId(), cssVar("--goal"), 5);
  if (hoverId !== null) mark(hoverId, cssVar("--hover"), 4);
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);

function canvasRoomAt(e) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(world.width - 1, Math.max(0, Math.floor((e.clientX - rect.left) / cellSize)));
  const y = Math.min(world.height - 1, Math.max(0, Math.floor((e.clientY - rect.top) / cellSize)));
  return y * world.width + x;
}

// ---------- hover: room info + exits ----------
function showRoom(room) {
  $("infoId").textContent = room ? room.id : "–";
  $("infoName").textContent = room ? room.name : "Hover a room";
  $("infoExits").textContent = room ? (room.exits.length ? room.exits.join(", ") : "none") : "–";
}

function clearHover() {
  for (const c of highlighted) c.classList.remove("hovered", "exit");
  highlighted = [];
}

grid.addEventListener("mouseover", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const room = roomsById.get(Number(cell.dataset.id));
  clearHover();

  cell.classList.add("hovered");
  highlighted.push(cell);
  for (const exitId of room.exits) {
    const exitCell = cells[exitId];
    if (exitCell) {
      exitCell.classList.add("exit");
      highlighted.push(exitCell);
    }
  }
  showRoom(room);
});

grid.addEventListener("mouseleave", clearHover);

canvas.addEventListener("mousemove", (e) => {
  const id = canvasRoomAt(e);
  if (id === hoverId) return;
  hoverId = id;
  hoverRoom = null;
  draw();

  // ask the server for this room's real data (short delay so fast mouse moves don't spam it)
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(async () => {
    hoverAbort?.abort();
    hoverAbort = new AbortController();
    try {
      const res = await fetch(`/api/world/${world.id}/room/${id}`, { signal: hoverAbort.signal });
      if (!res.ok) return;
      const room = await res.json();
      if (hoverId !== id) return;
      hoverRoom = room;
      showRoom(room);
      draw();
    } catch {
      // aborted by a newer hover
    }
  }, 40);
});

canvas.addEventListener("mouseleave", () => {
  clearTimeout(hoverTimer);
  hoverAbort?.abort();
  hoverId = null;
  hoverRoom = null;
  draw();
});

// ---------- click to choose start / goal ----------
function pickRoom(id) {
  if (pickNext === "start") {
    clearPath();
    $("start").value = id;
    $("goal").value = "";
    markEndpoints();
    pickNext = "goal";
  } else {
    $("goal").value = id;
    pickNext = "start";
    findPath();
  }
}

grid.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (cell) pickRoom(Number(cell.dataset.id));
});

canvas.addEventListener("click", (e) => pickRoom(canvasRoomAt(e)));

function markEndpoints() {
  if (mode === "canvas") return draw();
  for (const c of grid.querySelectorAll(".start, .goal")) c.classList.remove("start", "goal");
  const s = startId(), g = goalId();
  if (s !== null) cells[s]?.classList.add("start");
  if (g !== null) cells[g]?.classList.add("goal");
}

// ---------- path finding ----------
$("pathForm").addEventListener("submit", (e) => {
  e.preventDefault();
  pickNext = "start";
  findPath();
});

// Switching algorithm re-runs the search when start and goal are set.
for (const radio of document.querySelectorAll('input[name="algo"]')) {
  radio.addEventListener("change", () => {
    if (world && startId() !== null && goalId() !== null) findPath();
  });
}

const selectedAlgo = () => document.querySelector('input[name="algo"]:checked').value;

$("clearPath").addEventListener("click", () => {
  $("start").value = "";
  $("goal").value = "";
  pickNext = "start";
  clearPath();
});

function clearPath() {
  searchAbort?.abort();
  pathIds = [];
  for (const c of grid.querySelectorAll(".path, .start, .goal")) c.classList.remove("path", "start", "goal");
  overlay.replaceChildren();
  $("pathResult").replaceChildren();
  $("pathError").textContent = "";
  draw();
}

async function findPath() {
  if (!world) {
    $("pathError").textContent = "Generate a world first.";
    return;
  }
  const start = $("start").value;
  const goal = $("goal").value;
  const algo = selectedAlgo();
  clearPath();
  markEndpoints();

  // show elapsed time while waiting, so a slow BFS1 is visibly still running
  const t0 = Date.now();
  const tick = () => {
    $("pathResult").textContent = `Searching with ${ALGO_NAMES[algo]}… ${Math.floor((Date.now() - t0) / 1000)} s`;
  };
  tick();
  const ticker = setInterval(tick, 500);

  const controller = new AbortController();
  searchAbort = controller;
  try {
    const params = new URLSearchParams({ start, goal, algo });
    const res = await fetch(`/api/world/${world.id}/path?${params}`, { signal: controller.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    clearInterval(ticker);
    drawPath(data);
  } catch (err) {
    clearInterval(ticker);
    if (controller.signal.aborted) return; // replaced by a newer search or cleared
    $("pathResult").replaceChildren();
    $("pathError").textContent = err.message;
  } finally {
    if (searchAbort === controller) searchAbort = null;
  }
}

function drawPath({ path, ms, algo, expanded, note }) {
  const result = $("pathResult");
  result.replaceChildren();

  if (!path) {
    result.textContent = `${ALGO_NAMES[algo]} returned no path.`;
    return;
  }

  pathIds = path;
  if (mode === "dom") {
    for (const id of path) cells[id]?.classList.add("path");
  }
  markEndpoints();

  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", path.map((id) => cellCenter(id).join(",")).join(" "));
  overlay.replaceChildren(line);

  const summary = document.createElement("div");
  summary.textContent = `${ALGO_NAMES[algo]} · ${path.length} rooms, ${path.length - 1} steps · ${ms.toFixed(1)} ms`
    + (expanded !== undefined ? ` · ${expanded} rooms expanded` : "");
  const ids = document.createElement("div");
  ids.className = "ids";
  ids.textContent = path.join(" → ");
  result.append(summary, ids);
  if (note) {
    const n = document.createElement("div");
    n.className = "hint";
    n.textContent = note;
    result.append(n);
  }
}

// Generate a first world on load.
$("worldForm").requestSubmit();
