# World Visualizer

A graphical front end for the world generator in the parent folder.
The world generation (`World`, `Room`, `placeNameGen`) and the path finding (`World.BFS1`)
are my own code in `../worlds.js` and `../name-gen.js`. This `visualizer/` folder was made
with AI help, as allowed by the assignment, and only *uses* that code.

## Run

Requires Node.js 22 or newer.

```bash
cd visualizer
npm install
npm start
```

Then open http://localhost:3000.

## Features

- Enter a width and height and generate a world. Leave height empty for a 1D "string" world.
  The grid is scaled to fit the screen.
- Hover a room to see its ID, name and exits. Its exits light up in blue.
- Type a start and goal ID, or click two rooms, to find a path. The path is shown as red rooms
  with a red line through them, together with the step count and the run time.
- Use the **BFS1 / A\*** toggle to pick the algorithm. Switching it re-runs the search, so the
  two are easy to compare. A\* also reports how many rooms it expanded.

## A\*

`astar.js` is an A\* implementation written by AI for the visualizer, kept separate from my
code. It reads the world through `world.roomWithID()` and each room's `exits`, with nothing
precomputed, and uses the Manhattan distance (worked out from the room ID and grid width) as
its heuristic.

## Notes

- The server checks input before calling `BFS1`: IDs must exist, start equal to goal returns
  just that room (BFS1 would loop forever on it), and worlds are limited to 100×100.
- The only change to the original code is that the test lines at the bottom of `worlds.js`
  are commented out, so they don't run when the server imports the file.
