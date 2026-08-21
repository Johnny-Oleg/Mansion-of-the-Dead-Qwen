// Pixel-art sprite factory: sprites are authored as character matrices
// and rasterized once to offscreen canvases at 3x scale.

export interface SpriteSet {
  player: HTMLCanvasElement[];
  playerFlash: HTMLCanvasElement[];
  zombie: HTMLCanvasElement[];
  zombieFlash: HTMLCanvasElement[];
  brute: HTMLCanvasElement[];
  bruteFlash: HTMLCanvasElement[];
}

const LEGS_A = ["..PPPPPPPP..", "..PPP..PPP..", "..PPP..PPP..", "..BBB..BBB.."];
const LEGS_B = ["..PPPPPPPP..", "..PPP..PPP..", ".PPP....PPP.", ".BBB....BBB."];

const PLAYER_BODY = [
  "....HHHH....",
  "...HHHHHH...",
  "...HSSSSH...",
  "...SSSSSS...",
  "....SSSS....",
  "..VVVVVVVV..",
  ".SVVVVVVVVS.",
  ".SVVVVVVVVS.",
  "..VVVVVVVV..",
  "..TTTTTTTT..",
];

const ZOMBIE_BODY = [
  "...ZZZZZZ...",
  "..ZZZZZZZZ..",
  "..ZEZZZZEZ..",
  "..ZZZMMZZZ..",
  "...ZZZZZZ...",
  ".ZZ.TTTT.ZZ.",
  ".ZZ.TrTT.ZZ.",
  "..Z.TTTT.Z..",
  "...TTTTTT...",
  "...PPPPPP...",
];

type Palette = Record<string, string>;

const PLAYER_PAL: Palette = {
  H: "#5d4027",
  S: "#e0b184",
  V: "#5e6e46",
  T: "#8a7a52",
  P: "#3a4358",
  B: "#241c14",
};
const ZOMBIE_PAL: Palette = {
  Z: "#87a06b",
  E: "#3a1010",
  M: "#5d7548",
  T: "#6b5b49",
  r: "#7a1f1f",
  P: "#414650",
  B: "#1f1a14",
};
const BRUTE_PAL: Palette = {
  Z: "#9aa35f",
  E: "#7a1010",
  M: "#6d7544",
  T: "#4c4438",
  r: "#8a1616",
  P: "#33363e",
  B: "#15110d",
};

function raster(rows: string[], pal: Palette, scale = 3): HTMLCanvasElement {
  const w = rows[0].length;
  const h = rows.length;
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const col = pal[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

function white(rows: string[], scale = 3): HTMLCanvasElement {
  const pal: Palette = {};
  "HSTVBZEMrP".split("").forEach((k) => (pal[k] = "#ffffff"));
  return raster(rows, pal, scale);
}

export function buildSprites(): SpriteSet {
  const playerRowsA = [...PLAYER_BODY, ...LEGS_A];
  const playerRowsB = [...PLAYER_BODY, ...LEGS_B];
  const zombieRowsA = [...ZOMBIE_BODY, ...LEGS_A];
  const zombieRowsB = [...ZOMBIE_BODY, ...LEGS_B];
  return {
    player: [raster(playerRowsA, PLAYER_PAL), raster(playerRowsB, PLAYER_PAL)],
    playerFlash: [white(playerRowsA), white(playerRowsB)],
    zombie: [raster(zombieRowsA, ZOMBIE_PAL), raster(zombieRowsB, ZOMBIE_PAL)],
    zombieFlash: [white(zombieRowsA), white(zombieRowsB)],
    brute: [raster(zombieRowsA, BRUTE_PAL), raster(zombieRowsB, BRUTE_PAL)],
    bruteFlash: [white(zombieRowsA), white(zombieRowsB)],
  };
}
