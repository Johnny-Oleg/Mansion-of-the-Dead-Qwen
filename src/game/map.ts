// MANSION OF THE DEAD — level data.
// 7 rooms carved out of a 44x34 tile grid; walls are derived automatically
// wherever floor meets void, then doorways are carved back through.

export const TILE = 32;
export const GW = 44;
export const GH = 34;

export interface RoomDef {
  id: number;
  name: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  wallTop: string;
  wallFace: string;
  wallTrim: string;
  floorA: string;
  floorB: string;
  safe?: boolean;
  calm?: boolean;
}

export const ROOMS: RoomDef[] = [
  {
    id: 0, name: "MAIN HALL", sub: "a sanctuary... for now",
    x: 17, y: 10, w: 11, h: 16,
    wallTop: "#6d2a30", wallFace: "#48191f", wallTrim: "#8a5a3a",
    floorA: "#87806f", floorB: "#948c7a",
    safe: true, calm: true,
  },
  {
    id: 1, name: "WEST CORRIDOR", sub: "something shuffles in the dark",
    x: 6, y: 17, w: 11, h: 2,
    wallTop: "#4c4436", wallFace: "#312b21", wallTrim: "#6a5a3a",
    floorA: "#6d5137", floorB: "#614830",
  },
  {
    id: 2, name: "EAST CORRIDOR", sub: "the air smells of copper",
    x: 27, y: 17, w: 11, h: 2,
    wallTop: "#4c4436", wallFace: "#312b21", wallTrim: "#6a5a3a",
    floorA: "#6d5137", floorB: "#614830",
  },
  {
    id: 3, name: "DINING ROOM", sub: "dinner has waited years for you",
    x: 4, y: 4, w: 12, h: 12,
    wallTop: "#57422c", wallFace: "#3a2b1d", wallTrim: "#7a5c34",
    floorA: "#5e4630", floorB: "#553f2b",
  },
  {
    id: 4, name: "LIBRARY", sub: "knowledge rots faster than flesh",
    x: 4, y: 20, w: 12, h: 12,
    wallTop: "#3c4454", wallFace: "#29303f", wallTrim: "#5a6a8a",
    floorA: "#4a3a52", floorB: "#423448",
  },
  {
    id: 5, name: "GUEST ROOM", sub: "east wing — the bed is still warm",
    x: 28, y: 4, w: 12, h: 12,
    wallTop: "#54404c", wallFace: "#392b35", wallTrim: "#7a5a6a",
    floorA: "#5a4a3a", floorB: "#514234",
  },
  {
    id: 6, name: "MASTER SUITE", sub: "something large breathes in here",
    x: 28, y: 20, w: 12, h: 12,
    wallTop: "#4c3838", wallFace: "#342627", wallTrim: "#6a4a4a",
    floorA: "#57453a", floorB: "#4e3d33",
  },
];

export interface Furn {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
  solid?: boolean;
}

export const FURN: Furn[] = [
  // dining room
  { x: 7, y: 8, w: 6, h: 2, kind: "table" },
  { x: 5, y: 4, w: 4, h: 1, kind: "sideboard" },
  { x: 6, y: 7, w: 8, h: 4, kind: "rug", solid: false },
  // library
  { x: 4, y: 22, w: 1, h: 7, kind: "shelf" },
  { x: 15, y: 22, w: 1, h: 7, kind: "shelf" },
  { x: 6, y: 20, w: 5, h: 1, kind: "shelf" },
  { x: 10, y: 23, w: 2, h: 1, kind: "desk" },
  { x: 7, y: 27, w: 3, h: 2, kind: "rug", solid: false },
  // guest room (east wing)
  { x: 29, y: 5, w: 2, h: 3, kind: "bed" },
  { x: 37, y: 4, w: 1, h: 2, kind: "wardrobe" },
  { x: 36, y: 13, w: 2, h: 1, kind: "table" },
  { x: 31, y: 8, w: 4, h: 4, kind: "rug", solid: false },
  // master suite
  { x: 36, y: 21, w: 2, h: 3, kind: "bed" },
  { x: 29, y: 29, w: 1, h: 1, kind: "crate" },
  { x: 28, y: 21, w: 1, h: 1, kind: "barrel" },
  { x: 30, y: 24, w: 4, h: 3, kind: "rug", solid: false },
  // main hall
  { x: 18, y: 11, w: 2, h: 1, kind: "tdesk" },
  { x: 21, y: 10, w: 3, h: 1, kind: "fireplace" },
  { x: 18, y: 21, w: 3, h: 1, kind: "sofa" },
  { x: 25, y: 20, w: 2, h: 2, kind: "piano" },
  { x: 20, y: 13, w: 1, h: 3, kind: "rail" },
  { x: 24, y: 13, w: 1, h: 3, kind: "rail" },
  { x: 20, y: 12, w: 5, h: 4, kind: "stairs", solid: false },
  { x: 20, y: 17, w: 6, h: 5, kind: "rug", solid: false },
  // corridors
  { x: 7, y: 17, w: 1, h: 1, kind: "crate" },
  { x: 30, y: 18, w: 1, h: 1, kind: "barrel" },
];

/** doorway tiles carved through walls: [dining, library, guestA, guestB] */
export const CARVE: Array<[number, number]> = [
  [8, 16], [9, 16],
  [8, 19], [9, 19],
  [32, 16], [33, 16],
  [32, 19], [33, 19],
];

/** locked front door (south wall of main hall) */
export const DOOR_TILES: Array<[number, number]> = [
  [21, 25], [22, 25],
];
/** wall tiles behind the door that disappear once it opens */
export const DOOR_GAP: Array<[number, number]> = [
  [21, 26], [22, 26],
];

export const ZOMBIE_SPAWNS: Array<[number, number]> = [
  [9, 7], [12, 11],
  [12, 18],
  [7, 26], [12, 28],
  [33, 9], [36, 12],
  [33, 17],
  [34, 24],
];

export const BRUTE_SPAWNS: Array<[number, number]> = [
  [31, 29],
  [35, 18],
];

export interface PickupDef {
  kind: "ammo" | "herb" | "fuse";
  x: number;
  y: number;
  amt: number;
}

export const PICKUP_DEFS: PickupDef[] = [
  { kind: "ammo", x: 5, y: 13, amt: 12 },
  { kind: "ammo", x: 13, y: 30, amt: 12 },
  { kind: "ammo", x: 38, y: 13, amt: 12 },
  { kind: "ammo", x: 37, y: 6, amt: 12 },
  { kind: "ammo", x: 28, y: 17, amt: 12 },
  { kind: "ammo", x: 20, y: 24, amt: 12 },
  { kind: "herb", x: 10, y: 18, amt: 35 },
  { kind: "herb", x: 5, y: 30, amt: 35 },
  { kind: "herb", x: 31, y: 6, amt: 35 },
  { kind: "herb", x: 38, y: 30, amt: 35 },
  { kind: "fuse", x: 7, y: 6, amt: 0 },
  { kind: "fuse", x: 10, y: 24, amt: 0 },
  { kind: "fuse", x: 32, y: 28, amt: 0 },
];

export interface Candle {
  x: number;
  y: number;
  r: number;
  flame: boolean;
  lamp?: boolean;
}

const C = (tx: number, ty: number, r: number, flame: boolean, lamp = false): Candle => ({
  x: tx * TILE, y: ty * TILE, r, flame, lamp,
});

export const CANDLES: Candle[] = [
  C(8.5, 8.7, 110, true),
  C(11.5, 8.7, 110, true),
  C(10.8, 23.4, 100, true),
  C(5.2, 24.5, 95, true),
  C(14.7, 27.5, 95, true),
  C(36.9, 13.4, 100, true),
  C(37.4, 24.6, 95, true),
  C(13.5, 17.5, 90, true),
  C(29.5, 17.5, 90, true),
  C(18.6, 11.4, 120, false, true),
  C(22.5, 10.9, 165, true),
];

export const CHANDELIER = { x: 22.5 * TILE, y: 19.5 * TILE, r: 250 };

export const TYPEWRITER = { x: 19 * TILE, y: 12 * TILE + 12 };

export const EXIT_RECT = { x: 21 * TILE, y: 25 * TILE + 18, w: 2 * TILE, h: 46 };

export const PLAYER_START = { x: 22 * TILE + 16, y: 23 * TILE + 16 };
