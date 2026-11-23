// Client side of the visualizer: draws the world returned by the server and
// shows the path that the student's BFS1 function finds.

const $ = (id) => document.getElementById(id);

const stage = $("stage");
const gridWrap = $("gridWrap");
const grid = $("grid");
const overlay = $("overlay");

let world = null;      // { id, name, width, height, rooms }
let cells = [];        // index = room id -> div
let roomsById = new Map();
let highlighted = [];  // cells currently marked hovered/exit
let pickNext = "start";

// ---------- layout: fit the whole grid inside the stage ----------
function fitGrid() {
  if (!world) return;
  const cs = getComputedStyle(stage);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const cellSize = Math.min(availW / world.width, availH / world.height);
  gridWrap.style.width = cellSize * world.width + "px";
  gridWrap.style.height = cellSize * world.height + "px";
  grid.classList.toggle("small", cellSize < 28);
}
new ResizeObserver(fitGrid).observe(stage);

// Room position in the grid. addRooms2DWorld numbers rooms row by row,
// so id = y * width + x.
function cellCenter(id) {
  return [(id % world.width) + 0.5, Math.floor(id / world.width) + 0.5];
}

// ---------- generate ----------
$("worldForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("worldError").textContent = "";
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
  }
});

function renderWorld(data) {
  world = data;
  roomsById = new Map(data.rooms.map((r) => [r.id, r]));
  $("worldName").textContent = `${data.name} (${data.width}×${data.height}, ${data.rooms.length} rooms)`;

  grid.style.gridTemplateColumns = `repeat(${data.width}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${data.height}, 1fr)`;
  overlay.setAttribute("viewBox", `0 0 ${data.width} ${data.height}`);

  const frag = document.createDocumentFragment();
  cells = [];
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

  const maxId = data.rooms.length - 1;
  $("start").max = maxId;
  $("goal").max = maxId;
  $("start").value = "";
  $("goal").value = "";
  pickNext = "start";
  clearPath();
  clearHover();
  $("infoId").textContent = "–";
  $("infoName").textContent = "Hover a room";
  $("infoExits").textContent = "–";
  fitGrid();
}

// ---------- hover: room info + exits ----------
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

  $("infoId").textContent = room.id;
  $("infoName").textContent = room.name;
  $("infoExits").textContent = room.exits.length ? room.exits.join(", ") : "none";
});

grid.addEventListener("mouseleave", clearHover);

// ---------- click to choose start / goal ----------
grid.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  if (pickNext === "start") {
    clearPath();
    $("start").value = cell.dataset.id;
    $("goal").value = "";
    markEndpoints();
    pickNext = "goal";
  } else {
    $("goal").value = cell.dataset.id;
    pickNext = "start";
    findPath();
  }
});

function markEndpoints() {
  for (const c of grid.querySelectorAll(".start, .goal")) c.classList.remove("start", "goal");
  const s = cells[Number($("start").value)];
  const g = cells[Number($("goal").value)];
  if ($("start").value !== "" && s) s.classList.add("start");
  if ($("goal").value !== "" && g) g.classList.add("goal");
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
    if (world && $("start").value !== "" && $("goal").value !== "") findPath();
  });
}

const ALGO_NAMES = { bfs: "BFS1", astar: "A*" };
const selectedAlgo = () => document.querySelector('input[name="algo"]:checked').value;

$("clearPath").addEventListener("click", () => {
  $("start").value = "";
  $("goal").value = "";
  pickNext = "start";
  clearPath();
});

function clearPath() {
  for (const c of grid.querySelectorAll(".path, .start, .goal")) c.classList.remove("path", "start", "goal");
  overlay.replaceChildren();
  $("pathResult").replaceChildren();
  $("pathError").textContent = "";
}

async function findPath() {
  if (!world) {
    $("pathError").textContent = "Generate a world first.";
    return;
  }
  const start = $("start").value;
  const goal = $("goal").value;
  clearPath();
  markEndpoints();
  $("pathResult").textContent = "Searching…";

  try {
    const params = new URLSearchParams({ start, goal, algo: selectedAlgo() });
    const res = await fetch(`/api/world/${world.id}/path?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    drawPath(data);
  } catch (err) {
    $("pathResult").replaceChildren();
    $("pathError").textContent = err.message;
  }
}

function drawPath({ path, ms, algo, expanded, note }) {
  const result = $("pathResult");
  result.replaceChildren();

  if (!path) {
    result.textContent = `${ALGO_NAMES[algo]} returned no path.`;
    return;
  }

  for (const id of path) cells[id]?.classList.add("path");
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
