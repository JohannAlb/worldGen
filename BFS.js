import { Room, World } from "./worlds.js";

class FindPath{
  constructor(world) {
    this.world = world
  }

  findRoomWithID(id) {
    console.log(world.roomArray[0])
  }

  BFS(startID, goalID) {

  }
}

let world1 = new World([3, 3]);
world1.printRooms();
