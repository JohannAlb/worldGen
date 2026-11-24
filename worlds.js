import { placeNameGen } from "./name-gen.js";

let worldCounter = 0;

export class Room {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.exits = [];
  }
}

export class World {
  constructor(sizeArray) {
    // name, dimensions, size[]
    this.id = worldCounter++;
    this.name = placeNameGen();

    this.roomCounter = 0;
    this.roomArray = [];

    if (sizeArray) {
      switch (sizeArray.length) {
        case 1:
          this.addRoomsStringWorld(sizeArray[0]);
          break;
        case 2:
          this.addRooms2DWorld(sizeArray[0], sizeArray[1]);
          break;
        default:
          console.log("invalid dimensions amount: " + sizeArray.length);
      }
    }
  }

  addRoomsStringWorld(amount) {
    for (let i = 0; i < amount; i++) {
      this.roomArray.push(new Room(this.roomCounter++, placeNameGen()));
    }

    this.roomArray.forEach((room) => {
      if (room.id > 0) {
        room.exits = [room.id - 1];
      }
      if (room.id < this.roomArray.length - 1) {
        room.exits.push(room.id + 1);
      }
    });
  }

  addRooms2DWorld(xRes, yRes) {
    for (let y = 0; y < yRes; y++) {
      for (let x = 0; x < xRes; x++) {
        let tempRoom = new Room(this.roomCounter++, placeNameGen());

        if (y > 0) {
          tempRoom.exits = [tempRoom.id - xRes];
        }
        if (y < yRes - 1) {
          tempRoom.exits.push(tempRoom.id + xRes);
        }
        if (x > 0) {
          tempRoom.exits.push(tempRoom.id - 1);
        }
        if (x < xRes - 1) {
          tempRoom.exits.push(tempRoom.id + 1);
        }

        this.roomArray.push(tempRoom);
      }
    }
  }

  generateTreeWorld(depth) {
    let totalNodes = 2 ** (depth + 1) - 1;
    let numberArray = [];
    for (let i = 1; i <= totalNodes; i++) {
      numberArray.push(i);
    }
    const randomIndexOfAnArrayWithAllNumbersUpTillTotalAmountOfNodesExceptTheAlreadyDistrubtedOnesButDifferent =
      Math.floor(Math.random() * numberArray.length);

    this.roomArray.push(
      new Room(
        this.roomCounter++,
        numberArray[
          randomIndexOfAnArrayWithAllNumbersUpTillTotalAmountOfNodesExceptTheAlreadyDistrubtedOnesButDifferent
        ],
      ),
    );

    numberArray.splice(
      randomIndexOfAnArrayWithAllNumbersUpTillTotalAmountOfNodesExceptTheAlreadyDistrubtedOnesButDifferent,
      1,
    );

    for (let i = 0; i < depth; i++) {
      console.log("running depth level: ", i + 1);
      this.roomArray.forEach((node) => {
        if (node.exits.length <= 1) {
          const n = 2; // cahnge to random for random tree
          for (let j = 0; j < n; j++) {
            const randomIndexOfAnArrayWithAllNumbersUpTillTotalAmountOfNodesExceptTheAlreadyDistrubtedOnes =
              Math.floor(Math.random() * numberArray.length);

            const tempRoom = new Room(
              this.roomCounter++,
              numberArray[
                randomIndexOfAnArrayWithAllNumbersUpTillTotalAmountOfNodesExceptTheAlreadyDistrubtedOnes
              ],
            ); // change data to random ditribution
            node.exits.push(tempRoom.id);
            this.roomArray.push(tempRoom);

            numberArray.splice(
              randomIndexOfAnArrayWithAllNumbersUpTillTotalAmountOfNodesExceptTheAlreadyDistrubtedOnes,
              1,
            );
          }
        }
      });
    }
  }

  ASortingAlgorithmThatFindsANodeWithASpecificValueUsingBreadthFirstSearch(
    goal,
  ) {
    let pathArray = [[0]];
    let done = false;
    let solution = null;

    if (this.roomWithID(0).name == goal) {
      return [0];
    }

    while (!done) {
      const currValidPathLength = pathArray.at(-1).length; // legth of valid paths
      pathArray.forEach((path) => {
        if (path.length == currValidPathLength) {
          this.roomWithID(path.at(-1)).exits.forEach((exit) => {
            const currPath = [...path, exit];
            if (this.roomWithID(exit).name == goal) {
              solution = currPath;
              done = true;
            }
            pathArray.push(currPath);
          });
        } else {
          // ill just ahve a memory leak, its fine
        }
      });
    }

    return solution;
  }

  ASortingAlgorithmThatFindsANodeWithASpecificValueUsingDepthFirstSearch() {
    let unexplored = [0]
    while (unexplored.length > 0) {
      this.roomWithID(unexplored[0]).exits.forEach((exit) => {
        unexplored.push(exit) // i need to path
      })
    }
  }

  printRooms() {
    console.log('\n=== Printing Contents of World: "' + this.name + '" ===');
    for (let i = 0; i < this.roomArray.length; i++) {
      console.log(this.roomArray[i]);
    }
  }

  roomWithID(id) {
    return this.roomArray.find((room) => room.id == id);

    // let correctRoom = null;
    // this.roomArray.forEach((room) => {
    //   if (room.id == id) {
    //     correctRoom = room;
    //   }
    // });
    // if (correctRoom != null) {
    //   return room;
    // }
  }

  BFS1(startID, goalID) {
    let pathArray = [[startID]];
    let done = false;
    let solution = null;

    while (!done) {
      const currValidPathLength = pathArray.at(-1).length; // legth of valid paths
      pathArray.forEach((path) => {
        if (path.length == currValidPathLength) {
          this.roomWithID(path.at(-1)).exits.forEach((exit) => {
            const currPath = [...path, exit];
            if (exit == goalID) {
              solution = currPath;
              done = true;
            }
            // for each last entry in every path
            let pathIsRedundant = false;
            pathArray.forEach((path) => {
              if (exit == path.at(-1)) {
                pathIsRedundant = true;
              }
            });
            if (!pathIsRedundant) {
              pathArray.push(currPath);
            }
          });
        }
      });
    }

    return solution;

    // for each current exit:
    // * check if its the goal
    // * if true: done
    // * else: move on
    // * check all previous rooms to make sure youre on the shortest path
    // * if true: add current exit and its path to the array
    // * else: move on to next exit
    // repeat for next round of exits which is every exit to every room that is at the end of any path with equal legth to the last one explored
  }
}

// let world1 = new World([5]);
// world1.printRooms();

// let world2 = new World([10, 10]);
// world2.printRooms();
// console.log(world2.roomWithID(1));
// console.log(world2.BFS1(0, 10*10-1));

let treeword = new World();
treeword.generateTreeWorld(15);
// treeword.printRooms();
console.log(
  "path to goal: ",
  treeword.ASortingAlgorithmThatFindsANodeWithASpecificValueUsingBreadthFirstSearch(
    1,
  ),
);
