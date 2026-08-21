// MANSION OF THE DEAD — game engine.
// Canvas world + painter-sorted 2.5D rendering, dynamic darkness,
// twin-stick auto-aim combat, zombie AI, fuses/door objective, typewriter saves.

import { AudioSys } from "./audio";
import { buildSprites, type SpriteSet } from "./sprites";
import {
  TILE, GW, GH, ROOMS, FURN, CARVE, DOOR_TILES, DOOR_GAP,
  ZOMBIE_SPAWNS, BRUTE_SPAWNS, PICKUP_DEFS, CANDLES, CHANDELIER,
  TYPEWRITER, EXIT_RECT, PLAYER_START, type Furn,
} from "./map";

export const VIEW_W = 960;
export const VIEW_H = 540;

export type Screen = "title" | "playing" | "paused" | "dying" | "dead" | "victory";

export interface InteractInfo {
  label: string;
  progress: number | null;
  locked?: string;
}
export interface HudData {
  hp: number; mag: number; reserve: number; reloading: boolean; reloadP: number;
  fuses: number; saves: number; kills: number; time: number;
  roomId: number; visited: number[]; muted: boolean; px: number; py: number;
  doorOpen: boolean; hasSave: boolean; interact: InteractInfo | null; lowAmmo: boolean;
}
export interface ToastMsg { title: string; body: string; key: number }
export interface BannerMsg { name: string; sub: string; key: number }
export interface RankResult {
  rank: "S" | "A" | "B" | "C";
  score: number; time: number; kills: number; saves: number; herbs: number; damage: number;
}
export interface EngineCallbacks {
  onScreen: (s: Screen) => void;
  onHud: (h: HudData) => void;
  onBanner: (b: BannerMsg) => void;
  onToast: (t: ToastMsg) => void;
  onResult: (r: RankResult) => void;
}

// ---------- internal types ----------
type ZState = "idle" | "alert" | "chase" | "windup" | "charge" | "stun" | "dead";
interface Zombie {
  id: number; x: number; y: number; r: number;
  hp: number; maxHp: number; brute: boolean;
  state: ZState; t: number; anim: number; moving: boolean;
  homeX: number; homeY: number; wx: number; wy: number; wt: number;
  atkCd: number; moanT: number; flash: number; kvx: number; kvy: number;
  chargeDir: number; chargeT: number; deathT: number;
}
interface Pickup {
  kind: "ammo" | "herb" | "fuse"; x: number; y: number; amt: number;
  taken: boolean; fuseIdx: number;
}
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; color: string; kind: "blood" | "spark" | "shell" | "dust";
}
interface Decal { x: number; y: number; r: number; shade: number; seed: number }
interface Tracer { x0: number; y0: number; x1: number; y1: number; t: number }
interface Flash { x: number; y: number; r: number; t: number; max: number }
interface Snapshot {
  hp: number; mag: number; reserve: number; fuses: boolean[];
  x: number; y: number; saves: number; herbs: number;
}

const idx = (x: number, y: number) => y * GW + x;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const hash2 = (x: number, y: number) => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) % 1000;
};
const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

const HALL = ROOMS[0];
const inHall = (x: number, y: number) => {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return tx >= HALL.x && tx < HALL.x + HALL.w && ty >= HALL.y && ty < HALL.y + HALL.h;
};

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dark: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private cbs: EngineCallbacks;
  private audio = new AudioSys();
  private sprites: SpriteSet;

  private solid = new Uint8Array(GW * GH);
  private floorRoom = new Int8Array(GW * GH);
  private wallRoom = new Int8Array(GW * GH);

  state: Screen = "title";
  private keys = new Set<string>();
  private mouse = { x: VIEW_W / 2, y: VIEW_H / 3, down: false };
  private padMove = { x: 0, y: 0 };
  private padAim = { a: 0, active: false };
  private padFire = false;
  private padRun = false;
  private padPrev: boolean[] = [];
  private padInteractEdge = false;
  private padReloadEdge = false;
  private padPauseEdge = false;
  private vibrateNext = 0;

  private player = {
    x: PLAYER_START.x, y: PLAYER_START.y, r: 10,
    hp: 100, mag: 12, reserve: 12, aim: -Math.PI / 2,
    fireCd: 0, reloading: false, reloadT: 0,
    iframes: 0, flashRed: 0, stepAcc: 0, animT: 0, moving: false, run: false,
  };
  private zombies: Zombie[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private decals: Decal[] = [];
  private tracers: Tracer[] = [];
  private flashes: Flash[] = [];

  private cam = { x: 0, y: 0 };
  private shake = 0;
  private view = { x: 0, y: 0 };
  private clock = 0;
  private runTime = 0;
  private stats = { saves: 0, kills: 0, herbs: 0, damage: 0 };
  private fuseFlags = [false, false, false];
  private doorOpen = false;
  private doorChannel = 0;
  private ratchetT = 0;
  private snapshot: Snapshot | null = null;
  private visited = new Set<number>([0]);
  private curRoom = 0;
  private msgKey = 1;
  private dieT = 0;
  private attractIdx = 0;
  private attractT = 0;
  private creakT = 8;
  private heartT = 0;
  private hudT = 0;
  private raf = 0;
  private lastT = 0;
  private destroyed = false;
  private interact: InteractInfo | null = null;

  private detach: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, cbs: EngineCallbacks) {
    this.canvas = canvas;
    this.cbs = cbs;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.dark = document.createElement("canvas");
    this.dark.width = VIEW_W;
    this.dark.height = VIEW_H;
    this.dctx = this.dark.getContext("2d")!;
    this.sprites = buildSprites();
    this.buildGrid();
    this.resetWorld();
    this.bind();
    this.cam.x = this.player.x - VIEW_W / 2;
    this.cam.y = this.player.y - VIEW_H / 2;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------- setup ----------------
  private buildGrid() {
    this.solid.fill(1);
    this.floorRoom.fill(-1);
    for (const r of ROOMS) {
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          this.solid[idx(x, y)] = 0;
          this.floorRoom[idx(x, y)] = r.id;
        }
    }
    for (const [x, y] of CARVE) {
      this.solid[idx(x, y)] = 0;
      this.floorRoom[idx(x, y)] = -2; // threshold — corridor floor
    }
    for (const f of FURN) {
      if (f.solid === false) continue;
      for (let y = f.y; y < f.y + f.h; y++)
        for (let x = f.x; x < f.x + f.w; x++) this.solid[idx(x, y)] = 2;
    }
    for (const [x, y] of DOOR_TILES) this.solid[idx(x, y)] = 3;
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (this.solid[idx(x, y)] === 0) continue;
        let wr = -1;
        const n: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of n) {
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          if (this.solid[idx(nx, ny)] === 0) {
            wr = this.floorRoom[idx(nx, ny)];
            break;
          }
        }
        this.wallRoom[idx(x, y)] = wr;
      }
  }

  private resetWorld() {
    for (const [x, y] of DOOR_TILES) this.solid[idx(x, y)] = 3;
    this.doorOpen = false;
    this.doorChannel = 0;
    this.zombies = [];
    let id = 0;
    const mk = (tx: number, ty: number, brute: boolean): Zombie => ({
      id: id++, x: tx * TILE + 16, y: ty * TILE + 16, r: brute ? 15 : 10,
      hp: brute ? 16 : 3, maxHp: brute ? 16 : 3, brute,
      state: "idle", t: 0, anim: Math.random() * 10, moving: false,
      homeX: tx * TILE + 16, homeY: ty * TILE + 16,
      wx: tx * TILE + 16, wy: ty * TILE + 16, wt: rnd(1, 4),
      atkCd: 0, moanT: rnd(2, 8), flash: 0, kvx: 0, kvy: 0,
      chargeDir: 0, chargeT: rnd(2, 4), deathT: 0,
    });
    for (const [x, y] of ZOMBIE_SPAWNS) this.zombies.push(mk(x, y, false));
    for (const [x, y] of BRUTE_SPAWNS) this.zombies.push(mk(x, y, true));
    this.pickups = PICKUP_DEFS.map((p, i) => ({
      kind: p.kind, x: p.x * TILE + 16, y: p.y * TILE + 16, amt: p.amt,
      taken: false, fuseIdx: p.kind === "fuse" ? i - 10 : -1,
    }));
    // fix fuse indices (fuses are the last 3 defs)
    let fi = 0;
    for (const p of this.pickups) if (p.kind === "fuse") p.fuseIdx = fi++;
    this.particles = [];
    this.decals = [];
    this.tracers = [];
    this.flashes = [];
  }

  newRun() {
    this.resetWorld();
    const p = this.player;
    p.x = PLAYER_START.x; p.y = PLAYER_START.y;
    p.hp = 100; p.mag = 12; p.reserve = 12;
    p.fireCd = 0; p.reloading = false; p.iframes = 0; p.flashRed = 0;
    this.runTime = 0;
    this.stats = { saves: 0, kills: 0, herbs: 0, damage: 0 };
    this.fuseFlags = [false, false, false];
    this.snapshot = null;
    this.visited = new Set([0]);
    this.curRoom = 0;
    this.cam.x = p.x - VIEW_W / 2;
    this.cam.y = p.y - VIEW_H / 2;
    this.setScreen("playing");
    this.audio.setMode("calm");
    this.cbs.onBanner({ name: HALL.name, sub: HALL.sub, key: this.msgKey++ });
    this.emitHud();
  }

  startFromTitle() {
    this.audio.unlock();
    this.audio.uiSelect();
    this.newRun();
  }

  continueRun() {
    const s = this.snapshot;
    if (!s) {
      this.newRun();
      return;
    }
    this.audio.unlock();
    const p = this.player;
    p.hp = s.hp; p.mag = s.mag; p.reserve = s.reserve;
    p.x = s.x; p.y = s.y;
    p.iframes = 1.2; p.flashRed = 0; p.reloading = false;
    this.fuseFlags = [...s.fuses];
    this.stats.herbs = s.herbs;
    this.doorChannel = 0;
    for (const z of this.zombies) {
      if (z.state === "dead") continue;
      z.state = "idle";
      z.kvx = 0; z.kvy = 0;
      z.x = z.homeX; z.y = z.homeY;
    }
    this.cam.x = p.x - VIEW_W / 2;
    this.cam.y = p.y - VIEW_H / 2;
    this.setScreen("playing");
    const room = ROOMS[this.curRoom];
    this.audio.setMode(room.calm ? "calm" : "dread");
    this.cbs.onBanner({ name: room.name, sub: "the ink remembers you", key: this.msgKey++ });
  }

  quitToTitle() {
    this.resetWorld();
    this.player.x = PLAYER_START.x;
    this.player.y = PLAYER_START.y;
    this.attractIdx = 0;
    this.attractT = 0;
    this.setScreen("title");
    this.audio.setMode("title");
  }

  togglePause() {
    if (this.state === "playing") {
      this.setScreen("paused");
      this.audio.uiMove();
    } else if (this.state === "paused") {
      this.setScreen("playing");
      this.audio.uiMove();
    }
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.emitHud();
  }

  private setScreen(s: Screen) {
    this.state = s;
    this.cbs.onScreen(s);
  }

  private toast(title: string, body: string) {
    this.cbs.onToast({ title, body, key: this.msgKey++ });
  }

  // ---------------- input ----------------
  private bind() {
    const kd = (e: KeyboardEvent) => {
      this.audio.unlock();
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === "escape" || k === "p") this.togglePause();
      if (k === "m") this.toggleMute();
      if (k === "enter") {
        if (this.state === "title") this.startFromTitle();
        else if (this.state === "dead") this.continueRun();
        else if (this.state === "paused") this.togglePause();
        else if (this.state === "victory") this.quitToTitle();
      }
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const mm = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * VIEW_W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * VIEW_H;
    };
    const md = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.audio.unlock();
      if (this.state === "title") this.startFromTitle();
      this.mouse.down = true;
    };
    const mu = () => (this.mouse.down = false);
    const cm = (e: Event) => e.preventDefault();
    const blur = () => {
      if (this.state === "playing") this.setScreen("paused");
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("blur", blur);
    this.canvas.addEventListener("mousedown", md);
    this.canvas.addEventListener("contextmenu", cm);
    this.detach.push(() => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("blur", blur);
      this.canvas.removeEventListener("mousedown", md);
      this.canvas.removeEventListener("contextmenu", cm);
    });
  }

  private pollGamepad() {
    this.padInteractEdge = false;
    this.padReloadEdge = false;
    this.padPauseEdge = false;
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : null;
    if (!pads) return;
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const dz = (v: number) => (Math.abs(v) < 0.22 ? 0 : v);
    this.padMove.x = dz(gp.axes[0] ?? 0);
    this.padMove.y = dz(gp.axes[1] ?? 0);
    const ax = dz(gp.axes[2] ?? 0), ay = dz(gp.axes[3] ?? 0);
    if (Math.hypot(ax, ay) > 0.35) {
      this.padAim.a = Math.atan2(ay, ax);
      this.padAim.active = true;
    } else this.padAim.active = false;
    this.padFire = (gp.buttons[7]?.value ?? 0) > 0.3;
    this.padRun = (gp.buttons[6]?.value ?? 0) > 0.3;
    const pressed = (i: number) => !!gp!.buttons[i]?.pressed;
    const prev = this.padPrev;
    if (pressed(0) && !prev[0]) this.padInteractEdge = true;
    if (pressed(2) && !prev[2]) this.padReloadEdge = true;
    if (pressed(9) && !prev[9]) this.padPauseEdge = true;
    if (this.padPauseEdge) {
      this.audio.unlock();
      this.togglePause();
    }
    this.padPrev = gp.buttons.map((b) => b.pressed);
  }

  private rumble(strong: number, ms: number) {
    if (performance.now() < this.vibrateNext) return;
    this.vibrateNext = performance.now() + 220;
    try {
      const pads = navigator.getGamepads?.();
      const gp = pads?.[0] as (Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<void> } }) | null;
      void gp?.vibrationActuator?.playEffect("dual-rumble", {
        duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6,
      });
    } catch { /* unsupported */ }
  }

  // ---------------- main loop ----------------
  private loop = (t: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.033, (t - this.lastT) / 1000);
    this.lastT = t;
    this.clock += dt;
    this.pollGamepad();
    if (this.state === "playing") this.update(dt);
    else if (this.state === "dying") this.updateDying(dt);
    else if (this.state === "title") this.updateAttract(dt);
    this.draw();
    this.hudT -= dt;
    if (this.hudT <= 0 && (this.state === "playing" || this.state === "paused" || this.state === "dying")) {
      this.hudT = 0.15;
      this.emitHud();
    }
    this.audio.tick(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  private updateAttract(dt: number) {
    const waypoints = [HALL, ROOMS[3], ROOMS[4], ROOMS[6], ROOMS[2], ROOMS[5]];
    this.attractT -= dt;
    if (this.attractT <= 0) {
      this.attractT = 6.5;
      this.attractIdx = (this.attractIdx + 1) % waypoints.length;
    }
    const wp = waypoints[this.attractIdx];
    const tx = clamp((wp.x + wp.w / 2) * TILE - VIEW_W / 2, 0, GW * TILE - VIEW_W);
    const ty = clamp((wp.y + wp.h / 2) * TILE - VIEW_H / 2, 0, GH * TILE - VIEW_H);
    this.cam.x += (tx - this.cam.x) * Math.min(1, 0.35 * dt);
    this.cam.y += (ty - this.cam.y) * Math.min(1, 0.35 * dt);
    for (const z of this.zombies) this.updateZombie(z, dt, false);
    this.updateFx(dt);
  }

  private updateDying(dt: number) {
    this.dieT -= dt;
    this.shake *= Math.exp(-6 * dt);
    for (const z of this.zombies) if (z.state !== "dead") { z.state = "idle"; z.wt = 99; }
    this.updateFx(dt);
    if (this.dieT <= 0) {
      this.setScreen("dead");
      this.emitHud();
    }
  }

  // ---------------- update ----------------
  private update(dt: number) {
    const p = this.player;
    this.runTime += dt;
    p.fireCd -= dt;
    p.iframes -= dt;
    p.flashRed = Math.max(0, p.flashRed - dt * 1.4);

    if (p.reloading) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const take = Math.min(12 - p.mag, p.reserve);
        p.mag += take;
        p.reserve -= take;
        p.reloading = false;
        this.audio.reloadEnd();
      }
    }

    // movement
    let mx = 0, my = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) my -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) my += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) mx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) mx += 1;
    mx += this.padMove.x;
    my += this.padMove.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.run = this.keys.has("shift") || this.padRun;
    const spd = p.run ? 152 : 96;
    p.moving = ml > 0.05;
    if (p.moving) {
      this.tryMove(p, mx * spd * dt, my * spd * dt);
      p.stepAcc += ml * spd * dt;
      p.animT += dt * (p.run ? 1.6 : 1);
      if (p.stepAcc > 30) {
        p.stepAcc = 0;
        this.audio.footstep();
      }
    }

    // aim
    if (this.padAim.active) p.aim = this.padAim.a;
    else {
      const psx = p.x - this.view.x, psy = p.y - this.view.y;
      p.aim = Math.atan2(this.mouse.y - psy, this.mouse.x - psx);
    }

    // fire
    const trigger = this.mouse.down || this.padFire;
    if (trigger && p.fireCd <= 0 && !p.reloading) {
      if (p.mag > 0) this.shoot();
      else {
        this.audio.dryFire();
        p.fireCd = 0.3;
        this.startReload();
      }
    }
    if ((this.keys.has("r") || this.padReloadEdge) && !p.reloading) this.startReload();

    this.updatePickups();
    for (const z of this.zombies) this.updateZombie(z, dt, true);
    this.updateInteract(dt);
    this.updateFx(dt);

    // room tracking
    const room = this.roomAt(p.x, p.y);
    if (room >= 0 && room !== this.curRoom) {
      this.curRoom = room;
      this.visited.add(room);
      const r = ROOMS[room];
      this.cbs.onBanner({ name: r.name, sub: r.sub, key: this.msgKey++ });
      this.audio.setMode(r.calm ? "calm" : "dread");
    }

    // ambience
    this.creakT -= dt;
    if (this.creakT <= 0) {
      this.creakT = rnd(9, 22);
      this.audio.creak();
    }
    if (p.hp <= 35 && p.hp > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = p.hp <= 18 ? 0.6 : 0.92;
        this.audio.heartbeat();
        this.shake = Math.max(this.shake, 1.2);
      }
    }

    // camera
    const tx = clamp(p.x + Math.cos(p.aim) * 46 - VIEW_W / 2, 0, GW * TILE - VIEW_W);
    const ty = clamp(p.y + Math.sin(p.aim) * 36 - VIEW_H / 2 - 10, 0, GH * TILE - VIEW_H);
    this.cam.x += (tx - this.cam.x) * Math.min(1, 6 * dt);
    this.cam.y += (ty - this.cam.y) * Math.min(1, 6 * dt);
    this.shake *= Math.exp(-7 * dt);

    // victory
    if (
      this.doorOpen &&
      p.y > EXIT_RECT.y &&
      p.x > EXIT_RECT.x &&
      p.x < EXIT_RECT.x + EXIT_RECT.w
    ) this.doVictory();
  }

  private roomAt(x: number, y: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (const r of ROOMS)
      if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r.id;
    return -1;
  }

  private collides(x: number, y: number, r: number) {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return true;
        if (this.solid[idx(tx, ty)] > 0) return true;
      }
    return false;
  }

  private tryMove(e: { x: number; y: number }, dx: number, dy: number) {
    const r = (e as { r?: number }).r ?? 10;
    if (dx !== 0 && !this.collides(e.x + dx, e.y, r)) e.x += dx;
    if (dy !== 0 && !this.collides(e.x, e.y + dy, r)) e.y += dy;
  }

  private los(x0: number, y0: number, x1: number, y1: number) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.floor(d / 10));
    for (let i = 1; i < steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      if (this.solid[idx(Math.floor(x / TILE), Math.floor(y / TILE))] > 0) return false;
    }
    return true;
  }

  private shakeBy(v: number) {
    this.shake = Math.min(14, Math.max(this.shake, v));
  }

  // ---------------- combat ----------------
  private shoot() {
    const p = this.player;
    p.mag--;
    p.fireCd = 0.26;
    const tipX = p.x + Math.cos(p.aim) * 20;
    const tipY = p.y - 6 + Math.sin(p.aim) * 20;
    this.flashes.push({ x: tipX, y: tipY, r: 160, t: 0.07, max: 0.07 });
    this.audio.shot();
    this.shakeBy(1.6);
    this.rumble(0.3, 90);
    // shell casing
    const ea = p.aim + Math.PI / 2;
    this.particles.push({
      x: tipX, y: tipY, vx: Math.cos(ea) * 70, vy: Math.sin(ea) * 70,
      life: 0.5, max: 0.5, size: 3, color: "#c9a24a", kind: "shell",
    });

    // auto-aim: nearest zombie in range, in cone, with line of sight
    let target: Zombie | null = null;
    let best = 250;
    for (const z of this.zombies) {
      if (z.state === "dead") continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < best) {
        const a = Math.atan2(z.y - p.y, z.x - p.x);
        if (angDiff(a, p.aim) < 1.15 && this.los(tipX, tipY, z.x, z.y - 8)) {
          best = d;
          target = z;
        }
      }
    }
    if (target) {
      this.tracers.push({ x0: tipX, y0: tipY, x1: target.x, y1: target.y - 10, t: 0.08 });
      this.hitZombie(target, Math.atan2(target.y - p.y, target.x - p.x));
    } else {
      // miss tracer — ray until wall
      let ex = tipX, ey = tipY;
      const cx = Math.cos(p.aim), cy = Math.sin(p.aim);
      for (let i = 0; i < 26; i++) {
        ex += cx * 10;
        ey += cy * 10;
        const tx = Math.floor(ex / TILE), ty = Math.floor(ey / TILE);
        if (tx < 0 || ty < 0 || tx >= GW || ty >= GH || this.solid[idx(tx, ty)] > 0) break;
      }
      this.tracers.push({ x0: tipX, y0: tipY, x1: ex, y1: ey, t: 0.07 });
    }
    // gunfire noise wakes the mansion
    for (const z of this.zombies) {
      if (z.state === "dead") continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < 430 && z.state !== "chase") {
        z.state = z.brute ? "chase" : "alert";
        z.t = 0.5;
      }
    }
  }

  private hitZombie(z: Zombie, ang: number) {
    z.hp -= 1;
    z.flash = 0.13;
    const kb = z.brute ? 22 : 78;
    z.kvx += Math.cos(ang) * kb;
    z.kvy += Math.sin(ang) * kb;
    if (z.state === "idle" || z.state === "alert") {
      z.state = "chase";
    }
    this.audio.zHit();
    this.blood(z.x, z.y - 8, 5, false);
    if (z.hp <= 0) this.killZombie(z);
  }

  private killZombie(z: Zombie) {
    z.state = "dead";
    z.deathT = 0;
    this.stats.kills++;
    this.blood(z.x, z.y, z.brute ? 14 : 8, true);
    this.audio.zDie();
    this.shakeBy(z.brute ? 6 : 2.4);
    this.rumble(z.brute ? 0.8 : 0.4, 160);
    const roll = Math.random();
    if (z.brute) {
      this.pickups.push({ kind: "ammo", x: z.x, y: z.y + 14, amt: 12, taken: false, fuseIdx: -1 });
      this.toast("BRUTE DOWN", "IT DROPPED HANDGUN ROUNDS ×12");
    } else if (roll < 0.3) {
      this.pickups.push({ kind: "ammo", x: z.x, y: z.y + 12, amt: 6, taken: false, fuseIdx: -1 });
    }
  }

  private blood(x: number, y: number, n: number, pool: boolean) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(20, 90);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(0.25, 0.5), max: 0.5,
        size: rnd(2, 4), color: Math.random() < 0.5 ? "#8a1616" : "#5d0e0e", kind: "blood",
      });
    }
    if (pool) {
      this.decals.push({ x, y: y + 4, r: rnd(13, 20), shade: rnd(0.5, 0.8), seed: (Math.random() * 1000) | 0 });
      if (this.decals.length > 320) this.decals.shift();
    } else if (Math.random() < 0.5) {
      this.decals.push({ x: x + rnd(-6, 6), y: y + rnd(-4, 8), r: rnd(3, 6), shade: rnd(0.3, 0.55), seed: (Math.random() * 1000) | 0 });
      if (this.decals.length > 320) this.decals.shift();
    }
  }

  private damagePlayer(amt: number, sx: number, sy: number) {
    const p = this.player;
    if (this.state !== "playing" || p.iframes > 0) return;
    p.hp = Math.max(0, p.hp - amt);
    this.stats.damage += amt;
    p.flashRed = 0.6;
    p.iframes = 0.85;
    const a = Math.atan2(p.y - sy, p.x - sx);
    this.tryMove(p, Math.cos(a) * 26, Math.sin(a) * 26);
    this.audio.hurt();
    this.shakeBy(7);
    this.rumble(0.9, 200);
    this.blood(p.x, p.y, 4, false);
    this.emitHud();
    if (p.hp <= 0) {
      this.dieT = 1.7;
      this.audio.deathSting();
      this.shakeBy(11);
      this.setScreen("dying");
    }
  }

  private startReload() {
    const p = this.player;
    if (p.reloading || p.mag >= 12 || p.reserve <= 0) return;
    p.reloading = true;
    p.reloadT = 1.5;
    this.audio.reloadStart();
  }

  // ---------------- zombies ----------------
  private updateZombie(z: Zombie, dt: number, playerActive: boolean) {
    z.anim += dt;
    z.flash = Math.max(0, z.flash - dt);
    z.atkCd -= dt;
    z.moanT -= dt;
    if (z.state === "dead") {
      z.deathT += dt;
      return;
    }
    if (z.kvx !== 0 || z.kvy !== 0) {
      this.tryMove(z, z.kvx * dt, z.kvy * dt);
      const dmp = Math.exp(-9 * dt);
      z.kvx *= dmp;
      z.kvy *= dmp;
      if (Math.abs(z.kvx) < 2) z.kvx = 0;
      if (Math.abs(z.kvy) < 2) z.kvy = 0;
    }
    const p = this.player;
    const dist = Math.hypot(p.x - z.x, p.y - z.y);
    const angP = Math.atan2(p.y - z.y, p.x - z.x);
    z.moving = false;

    switch (z.state) {
      case "idle": {
        z.wt -= dt;
        if (z.wt <= 0) {
          z.wt = rnd(2, 5);
          z.wx = z.homeX + rnd(-44, 44);
          z.wy = z.homeY + rnd(-44, 44);
        }
        const wd = Math.hypot(z.wx - z.x, z.wy - z.y);
        if (wd > 6) {
          const s = 13 * dt;
          this.tryMove(z, ((z.wx - z.x) / wd) * s, ((z.wy - z.y) / wd) * s);
          z.moving = true;
        }
        if (playerActive && dist < 150 && this.los(z.x, z.y, p.x, p.y)) {
          z.state = "alert";
          z.t = 0.55;
          this.audio.moan(z.brute ? 0.55 : rnd(0.85, 1.2));
        }
        break;
      }
      case "alert": {
        z.t -= dt;
        if (z.t <= 0) z.state = "chase";
        break;
      }
      case "chase": {
        if (playerActive && dist < 32 && z.atkCd <= 0) {
          z.state = "windup";
          z.t = 0.42;
          break;
        }
        const s = (z.brute ? 52 : 30) * dt;
        const wob = Math.sin(z.anim * 2.2 + z.id) * 0.3;
        const nx = z.x + Math.cos(angP + wob) * s;
        const ny = z.y + Math.sin(angP + wob) * s;
        if (inHall(nx, ny) && !inHall(z.x, z.y)) {
          // the hall is sanctified ground — they will not cross
          if (z.moanT <= 0) {
            this.audio.moan(z.brute ? 0.55 : 1);
            z.moanT = rnd(2.5, 4.5);
          }
        } else {
          this.tryMove(z, Math.cos(angP + wob) * s, Math.sin(angP + wob) * s);
          z.moving = true;
        }
        if (z.brute) {
          z.chargeT -= dt;
          if (z.chargeT <= 0 && playerActive && dist > 120 && dist < 300 && this.los(z.x, z.y, p.x, p.y)) {
            z.state = "charge";
            z.chargeDir = angP;
            z.t = 0.55;
            z.chargeT = rnd(5, 7);
            this.audio.bruteRoar();
            this.shakeBy(3.5);
          }
        }
        break;
      }
      case "windup": {
        z.t -= dt;
        if (z.t <= 0) {
          z.state = "chase";
          z.atkCd = 1.15;
          if (playerActive && dist < 48) {
            this.damagePlayer(z.brute ? 22 : 12, z.x, z.y);
            for (let i = 0; i < 4; i++)
              this.particles.push({
                x: p.x + rnd(-8, 8), y: p.y + rnd(-8, 8), vx: rnd(-30, 30), vy: rnd(-30, 30),
                life: 0.3, max: 0.3, size: 3, color: "#c93a3a", kind: "blood",
              });
          }
        }
        break;
      }
      case "charge": {
        z.t -= dt;
        const s = 190 * dt;
        const ox = z.x, oy = z.y;
        const cnx = z.x + Math.cos(z.chargeDir) * s;
        const cny = z.y + Math.sin(z.chargeDir) * s;
        if (inHall(cnx, cny) && !inHall(z.x, z.y)) {
          // even in fury they will not cross the hall threshold
          z.state = "stun";
          z.t = 0.95;
          this.audio.stomp();
          break;
        }
        this.tryMove(z, cnx - z.x, cny - z.y);
        const moved = Math.hypot(z.x - ox, z.y - oy);
        z.moving = true;
        if (moved < s * 0.35) {
          z.state = "stun";
          z.t = 0.95;
          this.audio.stomp();
          this.shakeBy(6);
          for (let i = 0; i < 6; i++)
            this.particles.push({
              x: z.x + rnd(-14, 14), y: z.y + rnd(-6, 14), vx: rnd(-40, 40), vy: rnd(-50, -10),
              life: 0.5, max: 0.5, size: 3, color: "#6a6157", kind: "dust",
            });
        } else if (playerActive && dist < 36) {
          this.damagePlayer(26, z.x, z.y);
          z.state = "chase";
        } else if (z.t <= 0) z.state = "chase";
        break;
      }
      case "stun": {
        z.t -= dt;
        if (z.t <= 0) z.state = "chase";
        break;
      }
    }

    // separation
    for (const o of this.zombies) {
      if (o === z || o.state === "dead") continue;
      const d = Math.hypot(o.x - z.x, o.y - z.y);
      const min = z.r + o.r + 2;
      if (d > 0.01 && d < min) {
        const push = ((min - d) / d) * 0.5;
        z.x -= (o.x - z.x) * push;
        z.y -= (o.y - z.y) * push;
      }
    }

    if (playerActive && z.moanT <= 0 && dist < 330 && z.state !== "idle") {
      this.audio.moan(z.brute ? 0.55 : rnd(0.8, 1.25));
      z.moanT = rnd(4, 9);
    }
  }

  // ---------------- pickups & interact ----------------
  private updatePickups() {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d > 22) continue;
      if (pk.kind === "ammo") {
        pk.taken = true;
        p.reserve += pk.amt;
        this.audio.pickup();
        this.toast("YOU GOT", `HANDGUN ROUNDS ×${pk.amt}`);
      } else if (pk.kind === "herb") {
        if (p.hp >= 100) continue; // save it for when it matters
        pk.taken = true;
        p.hp = Math.min(100, p.hp + pk.amt);
        this.stats.herbs++;
        this.audio.herb();
        this.toast("YOU GOT", "GREEN HERB — CONDITION RESTORED");
      } else {
        pk.taken = true;
        this.fuseFlags[pk.fuseIdx] = true;
        const n = this.fuseFlags.filter(Boolean).length;
        this.audio.fuse();
        this.shakeBy(2);
        if (n === 3) this.toast("ALL FUSES FOUND", "UNLOCK THE FRONT DOOR — MAIN HALL, SOUTH");
        else this.toast("YOU GOT", `ELECTRICAL FUSE (${n}/3)`);
      }
      this.emitHud();
    }
  }

  private updateInteract(dt: number) {
    const p = this.player;
    const eHeld = this.keys.has("e") || !!this.padInteractHeld();
    const eEdge = this.keys.has("e") || this.padInteractEdge;
    this.interact = null;

    const doorCX = 22 * TILE, doorCY = 25 * TILE + 10;
    const doorD = Math.hypot(doorCX - p.x, doorCY - p.y);
    const twD = Math.hypot(TYPEWRITER.x - p.x, TYPEWRITER.y - p.y);

    if (!this.doorOpen && doorD < 74) {
      const n = this.fuseFlags.filter(Boolean).length;
      if (n < 3) {
        this.interact = { label: "FRONT DOOR — SEALED", progress: null, locked: `REQUIRES FUSES ${n}/3` };
        this.doorChannel = 0;
      } else {
        this.interact = { label: "INSERT FUSES", progress: eHeld ? this.doorChannel / 2.2 : null };
        if (eHeld) {
          this.doorChannel += dt;
          this.ratchetT -= dt;
          if (this.ratchetT <= 0) {
            this.ratchetT = 0.2;
            this.audio.ratchet();
          }
          if (this.doorChannel >= 2.2) this.openDoor();
        } else this.doorChannel = Math.max(0, this.doorChannel - dt * 2);
      }
    } else if (twD < 50) {
      this.interact = { label: "TYPEWRITTER — SAVE", progress: null };
      if (eEdge && !this.typedOnce) {
        this.typedOnce = true;
        this.saveGame();
      }
      if (!eHeld) this.typedOnce = false;
    } else {
      this.doorChannel = Math.max(0, this.doorChannel - dt * 2);
    }
  }

  private typedOnce = false;
  private padInteractHeld() {
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : null;
    const gp = pads?.[0];
    return gp ? !!gp.buttons[0]?.pressed : false;
  }

  private openDoor() {
    this.doorOpen = true;
    for (const [x, y] of DOOR_TILES) this.solid[idx(x, y)] = 0;
    this.audio.doorUnlock();
    this.shakeBy(9);
    this.rumble(1, 400);
    for (let i = 0; i < 14; i++)
      this.particles.push({
        x: 22 * TILE + rnd(-30, 30), y: 25 * TILE + rnd(-20, 30),
        vx: rnd(-50, 50), vy: rnd(-70, -10),
        life: rnd(0.4, 1), max: 1, size: 3, color: "#8a8172", kind: "dust",
      });
    this.toast("THE SEAL BREAKS", "ESCAPE THROUGH THE FRONT DOOR");
  }

  private saveGame() {
    const p = this.player;
    this.stats.saves++;
    this.snapshot = {
      hp: p.hp, mag: p.mag, reserve: p.reserve, fuses: [...this.fuseFlags],
      x: p.x, y: p.y, saves: this.stats.saves, herbs: this.stats.herbs,
    };
    this.audio.save();
    this.toast("PROGRESS SAVED", `INK RIBBON USED — SAVE #${this.stats.saves}`);
    this.emitHud();
  }

  private doVictory() {
    const time = this.runTime;
    const score = Math.max(
      0,
      Math.round(12000 - time * 14 - this.stats.saves * 450 + this.stats.kills * 110 - this.stats.damage * 12)
    );
    const rank: RankResult["rank"] = score >= 9000 ? "S" : score >= 7200 ? "A" : score >= 5200 ? "B" : "C";
    this.audio.victory();
    this.audio.setMode("calm");
    this.cbs.onResult({
      rank, score, time, kills: this.stats.kills,
      saves: this.stats.saves, herbs: this.stats.herbs, damage: this.stats.damage,
    });
    this.setScreen("victory");
  }

  // ---------------- fx ----------------
  private updateFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      const drag = pt.kind === "blood" ? 0.9 : 0.96;
      pt.vx *= Math.pow(drag, dt * 60 * 0.16);
      pt.vy *= Math.pow(drag, dt * 60 * 0.16);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].t -= dt;
      if (this.tracers[i].t <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t -= dt;
      if (this.flashes[i].t <= 0) this.flashes.splice(i, 1);
    }
  }

  private emitHud() {
    const p = this.player;
    this.cbs.onHud({
      hp: p.hp, mag: p.mag, reserve: p.reserve,
      reloading: p.reloading,
      reloadP: p.reloading ? 1 - p.reloadT / 1.5 : 0,
      fuses: this.fuseFlags.filter(Boolean).length,
      saves: this.stats.saves, kills: this.stats.kills, time: this.runTime,
      roomId: this.curRoom, visited: [...this.visited],
      muted: this.audio.muted, px: p.x, py: p.y,
      doorOpen: this.doorOpen, hasSave: !!this.snapshot,
      interact: this.interact, lowAmmo: p.mag <= 3,
    });
  }

  // ---------------- draw ----------------
  private draw() {
    const c = this.ctx;
    const shx = (Math.random() - 0.5) * 2 * this.shake;
    const shy = (Math.random() - 0.5) * 2 * this.shake;
    this.view.x = Math.round(this.cam.x + shx);
    this.view.y = Math.round(this.cam.y + shy);

    c.fillStyle = "#040306";
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.save();
    c.translate(-this.view.x, -this.view.y);

    const tx0 = Math.max(0, Math.floor(this.view.x / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(this.view.y / TILE) - 2);
    const tx1 = Math.min(GW - 1, Math.ceil((this.view.x + VIEW_W) / TILE) + 1);
    const ty1 = Math.min(GH - 1, Math.ceil((this.view.y + VIEW_H) / TILE) + 1);

    this.drawFloors(c, tx0, ty0, tx1, ty1);
    this.drawDecals(c);
    this.drawDecor(c);

    type D = { y: number; f: () => void };
    const list: D[] = [];
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const s = this.solid[idx(tx, ty)];
        if (s === 1) {
          list.push({ y: (ty + 1) * TILE, f: () => this.drawWallTile(c, tx, ty) });
        } else if (s === 3) {
          if (tx === DOOR_TILES[0][0] && ty === DOOR_TILES[0][1])
            list.push({ y: (ty + 1) * TILE, f: () => this.drawDoor(c) });
        }
      }
    for (const f of FURN) {
      if (f.solid === false) continue;
      if (f.x + f.w < tx0 || f.x > tx1 || f.y + f.h < ty0 || f.y > ty1) continue;
      list.push({ y: (f.y + f.h) * TILE, f: () => this.drawFurn(c, f) });
    }
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      if (pk.x < this.view.x - 40 || pk.x > this.view.x + VIEW_W + 40) continue;
      list.push({ y: pk.y + 8, f: () => this.drawPickup(c, pk) });
    }
    for (const z of this.zombies) {
      if (z.x < this.view.x - 60 || z.x > this.view.x + VIEW_W + 60) continue;
      if (z.y < this.view.y - 80 || z.y > this.view.y + VIEW_H + 80) continue;
      list.push({ y: z.y, f: () => this.drawZombie(c, z) });
    }
    if (this.state !== "title") list.push({ y: this.player.y, f: () => this.drawPlayer(c) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.f();

    this.drawParticlesWorld(c);
    this.drawChandelierBody(c);
    c.restore();

    this.drawDarkness();
    this.drawLitOverlay(c);
    this.drawPostVignettes(c);
  }

  private drawFloors(c: CanvasRenderingContext2D, tx0: number, ty0: number, tx1: number, ty1: number) {
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const fr = this.floorRoom[idx(tx, ty)];
        if (fr === -1) continue;
        const room = fr >= 0 ? ROOMS[fr] : ROOMS[1];
        const x = tx * TILE, y = ty * TILE;
        c.fillStyle = (tx + ty) % 2 === 0 ? room.floorA : room.floorB;
        c.fillRect(x, y, TILE, TILE);
        const h = hash2(tx, ty);
        if (h % 29 === 0) {
          c.fillStyle = "rgba(0,0,0,0.14)";
          c.fillRect(x + (h % 24), y + ((h * 7) % 24), 3, 2);
        }
        if (fr === 0) {
          c.fillStyle = "rgba(0,0,0,0.12)";
          c.fillRect(x, y, TILE, 1);
          c.fillRect(x, y, 1, TILE);
        }
        // wall cast shadow onto floor
        if (ty + 1 < GH && this.solid[idx(tx, ty + 1)] > 0 && this.solid[idx(tx, ty)] === 0) {
          c.fillStyle = "rgba(0,0,0,0.22)";
          c.fillRect(x, y + TILE - 8, TILE, 8);
        }
        if (tx + 1 < GW && this.solid[idx(tx + 1, ty)] > 0 && this.solid[idx(tx, ty)] === 0) {
          c.fillStyle = "rgba(0,0,0,0.12)";
          c.fillRect(x + TILE - 5, y, 5, TILE);
        }
      }
    // moonlight spilling through the opened front door
    if (this.doorOpen) {
      const g = c.createLinearGradient(0, 25 * TILE, 0, 23 * TILE);
      g.addColorStop(0, "rgba(122,154,204,0.22)");
      g.addColorStop(1, "rgba(122,154,204,0)");
      c.fillStyle = g;
      c.fillRect(21 * TILE, 23 * TILE, 2 * TILE, 2 * TILE);
    }
  }

  private drawDecals(c: CanvasRenderingContext2D) {
    for (const d of this.decals) {
      if (d.x < this.view.x - 40 || d.x > this.view.x + VIEW_W + 40) continue;
      if (d.y < this.view.y - 40 || d.y > this.view.y + VIEW_H + 40) continue;
      c.fillStyle = `rgba(93,10,10,${d.shade * 0.55})`;
      c.beginPath();
      c.ellipse(d.x, d.y, d.r, d.r * 0.72, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(60,6,6,${d.shade * 0.7})`;
      const s = d.seed;
      for (let i = 0; i < 3; i++) {
        const a = ((s * (i + 3)) % 628) / 100;
        const rr = d.r * (0.5 + ((s * (i + 7)) % 60) / 100);
        c.beginPath();
        c.arc(d.x + Math.cos(a) * rr * 0.7, d.y + Math.sin(a) * rr * 0.5, d.r * 0.22, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  private drawDecor(c: CanvasRenderingContext2D) {
    for (const f of FURN) {
      if (f.solid !== false) continue;
      const x = f.x * TILE, y = f.y * TILE, W = f.w * TILE, H = f.h * TILE;
      if (x + W < this.view.x - 40 || x > this.view.x + VIEW_W + 40) continue;
      if (f.kind === "rug") {
        c.fillStyle = "rgba(110,32,38,0.82)";
        c.fillRect(x + 3, y + 3, W - 6, H - 6);
        c.strokeStyle = "#8a5a3a";
        c.lineWidth = 2;
        c.strokeRect(x + 6, y + 6, W - 12, H - 12);
        c.fillStyle = "rgba(216,180,90,0.25)";
        const cx = x + W / 2, cy = y + H / 2;
        c.save();
        c.translate(cx, cy);
        c.rotate(Math.PI / 4);
        const s = Math.min(W, H) * 0.18;
        c.fillRect(-s, -s, s * 2, s * 2);
        c.restore();
      } else if (f.kind === "stairs") {
        // grand staircase climbing north
        const steps = 7;
        for (let i = 0; i < steps; i++) {
          const sy = y + H - ((i + 1) * H) / steps;
          c.fillStyle = i % 2 === 0 ? "#6a5a44" : "#5d4e3a";
          c.fillRect(x + 6, sy, W - 12, H / steps);
          c.fillStyle = "rgba(0,0,0,0.25)";
          c.fillRect(x + 6, sy + H / steps - 2, W - 12, 2);
        }
        c.fillStyle = "#6e2228";
        c.fillRect(x + W / 2 - 12, y, 24, H);
        c.fillStyle = "rgba(216,180,90,0.35)";
        c.fillRect(x + W / 2 - 12, y, 2, H);
        c.fillRect(x + W / 2 + 10, y, 2, H);
        // dark landing at the top — the upper floor is lost
        const g = c.createLinearGradient(0, y, 0, y + 26);
        g.addColorStop(0, "rgba(2,2,6,0.9)");
        g.addColorStop(1, "rgba(2,2,6,0)");
        c.fillStyle = g;
        c.fillRect(x + 6, y, W - 12, 26);
      }
    }
  }

  private drawWallTile(c: CanvasRenderingContext2D, tx: number, ty: number) {
    const wr = this.wallRoom[idx(tx, ty)];
    if (this.doorOpen) {
      for (const [gx, gy] of DOOR_GAP) if (tx === gx && ty === gy) return;
    }
    const x = tx * TILE, y = ty * TILE;
    if (wr === -1) {
      c.fillStyle = "#14101c";
      c.fillRect(x, y - 12, TILE, 44);
      c.fillStyle = "#1d1728";
      c.fillRect(x, y - 20, TILE, 8);
      return;
    }
    const room = wr >= 0 ? ROOMS[wr] : ROOMS[1];
    // top face
    c.fillStyle = room.wallTop;
    c.fillRect(x, y - 20, TILE, 9);
    // front face
    c.fillStyle = room.wallFace;
    c.fillRect(x, y - 11, TILE, 43);
    // damask stripes
    c.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i < 4; i++) c.fillRect(x + i * 8 + 3, y - 11, 3, 43);
    // dado trim + baseboard
    c.fillStyle = room.wallTrim;
    c.fillRect(x, y + 16, TILE, 3);
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.fillRect(x, y + 28, TILE, 4);
    c.fillStyle = "rgba(255,230,180,0.14)";
    c.fillRect(x, y - 11, TILE, 2);
  }

  private drawDoor(c: CanvasRenderingContext2D) {
    const x = 21 * TILE, y = 25 * TILE;
    // frame
    c.fillStyle = "#2a1c12";
    c.fillRect(x - 4, y - 30, 2 * TILE + 8, 62);
    if (!this.doorOpen) {
      for (let i = 0; i < 2; i++) {
        const dx = x + 2 + i * 31;
        c.fillStyle = "#4c3018";
        c.fillRect(dx, y - 26, 29, 56);
        c.fillStyle = "rgba(0,0,0,0.3)";
        for (let pl = 0; pl < 3; pl++) c.fillRect(dx + 4 + pl * 9, y - 22, 2, 48);
        c.fillStyle = "#3a3a42";
        c.fillRect(dx, y - 18, 29, 4);
        c.fillRect(dx, y + 8, 29, 4);
      }
      c.fillStyle = "#d8b45a";
      c.fillRect(x + 26, y, 4, 4);
      c.fillRect(x + 34, y, 4, 4);
      // sealed glow
      const pulse = 0.5 + Math.sin(this.clock * 2.4) * 0.3;
      c.fillStyle = `rgba(193,39,45,${0.25 + pulse * 0.2})`;
      c.fillRect(x + 28, y - 8, 8, 8);
      c.fillStyle = "rgba(193,39,45,0.12)";
      c.fillRect(x - 4, y - 30, 2 * TILE + 8, 62);
    } else {
      c.fillStyle = "#050308";
      c.fillRect(x + 2, y - 26, 2 * TILE - 4, 56);
      // doors swung open
      c.fillStyle = "#3a2414";
      c.fillRect(x - 2, y - 26, 8, 56);
      c.fillRect(x + 2 * TILE - 6, y - 26, 8, 56);
      const g = c.createLinearGradient(0, y + 30, 0, y - 26);
      g.addColorStop(0, "rgba(122,154,204,0.3)");
      g.addColorStop(1, "rgba(122,154,204,0.02)");
      c.fillStyle = g;
      c.fillRect(x + 2, y - 26, 2 * TILE - 4, 56);
    }
  }

  private block(
    c: CanvasRenderingContext2D, f: Furn, th: number, top: string, front: string
  ) {
    const x = f.x * TILE, y = f.y * TILE, W = f.w * TILE, H = f.h * TILE;
    c.fillStyle = front;
    c.fillRect(x, y - th + 10, W, H + th - 10);
    c.fillStyle = top;
    c.fillRect(x, y - th, W, 11);
    c.fillStyle = "rgba(255,255,255,0.1)";
    c.fillRect(x, y - th, W, 2);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.fillRect(x, y + H - 3, W, 3);
  }

  private drawFurn(c: CanvasRenderingContext2D, f: Furn) {
    const x = f.x * TILE, y = f.y * TILE, W = f.w * TILE, H = f.h * TILE;
    switch (f.kind) {
      case "table": {
        this.block(c, f, 15, "#7a5a38", "#4c3822");
        c.fillStyle = "rgba(0,0,0,0.18)";
        for (let i = 1; i < f.w; i++) c.fillRect(x + i * TILE, y - 15, 1, 10);
        c.fillStyle = "#6e2228";
        c.fillRect(x + 8, y - 13, W - 16, 7);
        c.fillStyle = "#9a9aa2";
        for (let i = 0; i < f.w; i++) c.fillRect(x + 14 + i * TILE, y - 12, 4, 3);
        break;
      }
      case "shelf": {
        this.block(c, f, 36, "#2a1e14", "#3a2a1c");
        const pal = ["#8a3a2a", "#3a5a8a", "#6a7a3a", "#7a5a8a", "#8a6a3a", "#5a3a2a"];
        const vertical = f.h > f.w;
        const rows = vertical ? Math.max(2, Math.floor((H - 8) / 24)) : 3;
        const gap = vertical ? 24 : 16;
        for (let r = 0; r < rows; r++) {
          const bandTop = y - 24 + r * gap;
          for (let bx = 0; bx < Math.floor(W / 6); bx++) {
            const hh = hash2(f.x * 31 + bx * 7, f.y * 17 + r * 13);
            c.fillStyle = pal[hh % pal.length];
            const bh = 9 + (hh % 4);
            c.fillRect(x + 3 + bx * 6, bandTop + 14 - bh, 4, bh);
          }
          c.fillStyle = "#241a10";
          c.fillRect(x + 2, bandTop + 14, W - 4, 3);
          c.fillStyle = "rgba(255,230,180,0.06)";
          c.fillRect(x + 2, bandTop + 14, W - 4, 1);
        }
        break;
      }
      case "bed": {
        this.block(c, f, 13, "#8a8276", "#4c3822");
        c.fillStyle = "#6e2a2e";
        c.fillRect(x + 3, y - 13 + Math.floor(H * 0.35), W - 6, H - Math.floor(H * 0.35) + 8);
        c.fillStyle = "#c9c0aa";
        c.fillRect(x + 6, y - 11, W - 12, 8);
        c.fillStyle = "rgba(0,0,0,0.2)";
        c.fillRect(x + 3, y - 13 + Math.floor(H * 0.35), W - 6, 2);
        break;
      }
      case "sideboard": {
        this.block(c, f, 19, "#6a4c2c", "#4a341e");
        c.fillStyle = "#3a2a18";
        for (let i = 0; i < f.w; i++) c.fillRect(x + i * TILE + 6, y + 2, 20, 14);
        c.fillStyle = "#d8b45a";
        for (let i = 0; i < f.w; i++) c.fillRect(x + i * TILE + 14, y + 8, 3, 3);
        c.fillStyle = "#9a9aa2";
        c.beginPath();
        c.arc(x + 24, y - 14, 7, Math.PI, 0);
        c.fill();
        c.beginPath();
        c.arc(x + W - 28, y - 14, 5, Math.PI, 0);
        c.fill();
        break;
      }
      case "desk": {
        this.block(c, f, 17, "#6a4c2c", "#4a341e");
        c.fillStyle = "#d8d0b8";
        c.fillRect(x + 12, y - 14, 14, 9);
        c.fillRect(x + 30, y - 12, 10, 7);
        c.fillStyle = "#1a1a22";
        c.fillRect(x + W - 18, y - 13, 5, 5);
        break;
      }
      case "tdesk": {
        this.block(c, f, 17, "#6a4c2c", "#4a341e");
        // typewriter
        c.fillStyle = "#26262e";
        c.fillRect(x + 18, y - 26, 28, 12);
        c.fillStyle = "#3a3a44";
        c.fillRect(x + 20, y - 30, 24, 5);
        c.fillStyle = "#d8d0b8";
        c.fillRect(x + 24, y - 36, 16, 7);
        c.fillStyle = "#8a8a94";
        for (let i = 0; i < 5; i++) c.fillRect(x + 21 + i * 5, y - 18, 3, 2);
        // lamp
        c.fillStyle = "#3a3020";
        c.fillRect(x + 2, y - 30, 3, 14);
        c.fillStyle = "#d8a03d";
        c.fillRect(x - 2, y - 36, 11, 7);
        break;
      }
      case "wardrobe": {
        this.block(c, f, 42, "#3a2818", "#4c3420");
        c.fillStyle = "rgba(0,0,0,0.3)";
        c.fillRect(x + TILE / 2 - 1, y - 34, 2, H + 24);
        c.fillStyle = "#d8b45a";
        c.fillRect(x + 10, y - 12, 3, 6);
        c.fillRect(x + 19, y - 12, 3, 6);
        break;
      }
      case "crate": {
        this.block(c, f, 13, "#7a6238", "#5a4626");
        c.strokeStyle = "rgba(0,0,0,0.35)";
        c.lineWidth = 2;
        c.strokeRect(x + 3, y - 10, W - 6, H + 6);
        c.beginPath();
        c.moveTo(x + 3, y - 10);
        c.lineTo(x + W - 3, y + H - 4);
        c.moveTo(x + W - 3, y - 10);
        c.lineTo(x + 3, y + H - 4);
        c.stroke();
        break;
      }
      case "barrel": {
        c.fillStyle = "#5a4226";
        c.fillRect(x + 3, y - 16, TILE - 6, H + 12);
        c.fillStyle = "#6d5232";
        c.beginPath();
        c.ellipse(x + TILE / 2, y - 14, TILE / 2 - 3, 7, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#3a3a42";
        c.fillRect(x + 3, y - 8, TILE - 6, 3);
        c.fillRect(x + 3, y + 4, TILE - 6, 3);
        break;
      }
      case "sofa": {
        this.block(c, f, 15, "#7e3238", "#5e2228");
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.fillRect(x + W / 3, y - 12, 2, H + 6);
        c.fillRect(x + (2 * W) / 3, y - 12, 2, H + 6);
        c.fillStyle = "#8e4248";
        c.fillRect(x + 2, y - 22, W - 4, 9);
        break;
      }
      case "piano": {
        this.block(c, f, 20, "#17131a", "#241c26");
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.fillRect(x + 4, y - 18, W - 8, 2);
        c.fillStyle = "#d8d0b8";
        c.fillRect(x + 4, y + H - 14, W - 8, 6);
        c.fillStyle = "#17131a";
        for (let i = 0; i < 8; i++) c.fillRect(x + 7 + i * 7, y + H - 14, 3, 3);
        c.fillStyle = "#d8d0b8";
        c.fillRect(x + 10, y - 16, 16, 10);
        break;
      }
      case "rail": {
        c.fillStyle = "#5a4226";
        for (let i = 0; i < 4; i++) c.fillRect(x + 4 + i * 8, y - 18, 3, H + 14);
        c.fillStyle = "#7a5c38";
        c.fillRect(x, y - 22, TILE, 4);
        c.fillStyle = "rgba(255,230,180,0.15)";
        c.fillRect(x, y - 22, TILE, 1);
        break;
      }
      case "fireplace": {
        this.block(c, f, 22, "#57534c", "#454038");
        c.fillStyle = "#2c2824";
        c.fillRect(x + 18, y - 8, W - 36, H + 2);
        c.fillStyle = "#1a1512";
        c.fillRect(x + 24, y - 2, W - 48, H - 4);
        c.fillStyle = "#d8b45a";
        c.fillRect(x + 10, y - 19, 8, 4);
        c.fillRect(x + W - 18, y - 19, 8, 4);
        break;
      }
    }
  }

  private drawPickup(c: CanvasRenderingContext2D, pk: Pickup) {
    const bob = Math.sin(this.clock * 3 + pk.fuseIdx + pk.x) * 2;
    const x = pk.x, y = pk.y + bob;
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(x, pk.y + 7, 9, 4, 0, 0, Math.PI * 2);
    c.fill();
    if (pk.kind === "ammo") {
      c.fillStyle = "#5e6e46";
      c.fillRect(x - 7, y - 5, 14, 10);
      c.fillStyle = "#4a5836";
      c.fillRect(x - 7, y - 5, 14, 3);
      c.fillStyle = "#c9a24a";
      c.fillRect(x - 4, y, 3, 3);
      c.fillRect(x + 1, y, 3, 3);
    } else if (pk.kind === "herb") {
      c.fillStyle = "#2e6e38";
      c.fillRect(x - 2, y - 2, 4, 8);
      c.fillStyle = "#4fae5a";
      c.fillRect(x - 7, y - 6, 6, 5);
      c.fillRect(x + 1, y - 6, 6, 5);
      c.fillRect(x - 4, y - 10, 8, 5);
      c.fillStyle = "#7fd488";
      c.fillRect(x - 2, y - 8, 2, 2);
      c.fillRect(x + 2, y - 5, 2, 2);
    } else {
      c.fillStyle = "#d8d0b8";
      c.fillRect(x - 4, y - 8, 8, 14);
      c.fillStyle = "#c9a24a";
      c.fillRect(x - 4, y - 8, 8, 3);
      c.fillRect(x - 4, y + 3, 8, 3);
      c.fillRect(x - 2, y - 11, 1, 3);
      c.fillRect(x + 1, y - 11, 1, 3);
      const sp = (Math.sin(this.clock * 5 + pk.x) + 1) / 2;
      c.fillStyle = `rgba(255,233,160,${0.4 + sp * 0.5})`;
      c.fillRect(x - 1, y - 14, 2, 2);
    }
  }

  private drawZombie(c: CanvasRenderingContext2D, z: Zombie) {
    const set = z.brute ? this.sprites.brute : this.sprites.zombie;
    const flashSet = z.brute ? this.sprites.bruteFlash : this.sprites.zombieFlash;
    // shadow
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.ellipse(z.x, z.y + 2, z.brute ? 20 : 12, z.brute ? 8 : 5, 0, 0, Math.PI * 2);
    c.fill();
    if (z.state === "dead") {
      const spr = set[0];
      c.globalAlpha = 0.9;
      c.drawImage(spr, z.x - 20, z.y - 13, 40, 16);
      c.globalAlpha = 1;
      return;
    }
    const frame = z.moving ? Math.floor(z.anim * 5) % 2 : 0;
    const scale = z.brute ? 1.7 : 1;
    const sw = 36 * scale, sh = 42 * scale;
    let ox = 0, oy = 0;
    if (z.state === "windup") {
      const a = Math.atan2(this.player.y - z.y, this.player.x - z.x);
      ox = Math.cos(a) * 5;
      oy = Math.sin(a) * 5;
    }
    if (z.state === "stun") oy = Math.sin(this.clock * 30) * 2;
    const spr = z.flash > 0 ? flashSet[frame] : set[frame];
    c.drawImage(spr, z.x - sw / 2 + ox, z.y - sh + 4 + oy, sw, sh);
    if (z.flash > 0 && Math.random() < 0.5) c.drawImage(set[frame], z.x - sw / 2 + ox, z.y - sh + 4 + oy, sw, sh);
    // arms reaching during windup
    if (z.state === "windup" || z.state === "charge") {
      const a = z.state === "charge" ? z.chargeDir : Math.atan2(this.player.y - z.y, this.player.x - z.x);
      c.fillStyle = z.brute ? "#9aa35f" : "#87a06b";
      for (const off of [-6, 6]) {
        c.fillRect(
          z.x + Math.cos(a) * 16 * scale - Math.sin(a) * off - 3,
          z.y - 12 + Math.sin(a) * 16 * scale + Math.cos(a) * off - 3,
          6, 6
        );
      }
    }
    // brute eyes
    if (z.brute) {
      c.fillStyle = "#d2372b";
      c.fillRect(z.x - 6 + ox, z.y - sh + 12, 3, 3);
      c.fillRect(z.x + 3 + ox, z.y - sh + 12, 3, 3);
    }
    // hp pips for damaged zombies
    if (z.hp < z.maxHp && z.hp > 0) {
      c.fillStyle = "rgba(0,0,0,0.5)";
      c.fillRect(z.x - 12, z.y - sh - 6, 24, 3);
      c.fillStyle = z.brute ? "#d2372b" : "#7fa06a";
      c.fillRect(z.x - 12, z.y - sh - 6, 24 * (z.hp / z.maxHp), 3);
    }
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const p = this.player;
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.beginPath();
    c.ellipse(p.x, p.y + 2, 12, 5, 0, 0, Math.PI * 2);
    c.fill();
    const frame = p.moving ? Math.floor(p.animT * 8) % 2 : 0;
    const blink = p.iframes > 0 && Math.sin(this.clock * 40) > 0.2;
    const spr = blink ? this.sprites.playerFlash[frame] : this.sprites.player[frame];
    c.drawImage(spr, p.x - 18, p.y - 40, 36, 42);
    // pistol — quantized to 16 directions for stable pixels
    const qa = Math.round(p.aim / (Math.PI / 8)) * (Math.PI / 8);
    const gx = p.x + Math.cos(qa) * 13;
    const gy = p.y - 12 + Math.sin(qa) * 13;
    c.save();
    c.translate(gx, gy);
    c.rotate(qa);
    c.fillStyle = "#e0b184";
    c.fillRect(-2, -2, 5, 5);
    c.fillStyle = p.reloading ? "#6a6a74" : "#3a3a44";
    c.fillRect(2, -2, 12, 4);
    c.fillStyle = "#24242c";
    c.fillRect(11, -1, 4, 2);
    c.restore();
    if (p.reloading) {
      const pr = 1 - p.reloadT / 1.5;
      c.fillStyle = "rgba(0,0,0,0.6)";
      c.fillRect(p.x - 14, p.y - 52, 28, 4);
      c.fillStyle = "#d8b45a";
      c.fillRect(p.x - 14, p.y - 52, 28 * pr, 4);
    }
  }

  private drawParticlesWorld(c: CanvasRenderingContext2D) {
    for (const pt of this.particles) {
      if (pt.kind === "spark") continue;
      c.globalAlpha = Math.max(0, pt.life / pt.max);
      c.fillStyle = pt.color;
      c.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    c.globalAlpha = 1;
  }

  private drawChandelierBody(c: CanvasRenderingContext2D) {
    const x = CHANDELIER.x + Math.sin(this.clock * 0.9) * 3;
    const y = CHANDELIER.y;
    if (x < this.view.x - 80 || x > this.view.x + VIEW_W + 80) return;
    c.strokeStyle = "#8a6d3b";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y - 60);
    c.lineTo(x, y - 34);
    c.stroke();
    c.fillStyle = "#d8b45a";
    c.fillRect(x - 3, y - 36, 6, 6);
    c.strokeStyle = "#d8b45a";
    c.beginPath();
    c.moveTo(x - 26, y - 24);
    c.quadraticCurveTo(x, y - 40, x + 26, y - 24);
    c.stroke();
    for (const off of [-26, -13, 0, 13, 26]) {
      c.fillStyle = "#c9c0aa";
      c.fillRect(x + off - 2, y - 28, 4, 6);
    }
  }

  // ---------------- darkness & light ----------------
  private drawDarkness() {
    const d = this.dctx;
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, VIEW_W, VIEW_H);
    const base =
      this.state === "title" ? 0.93 : 0.885 + Math.sin(this.clock * 11) * 0.008;
    d.fillStyle = `rgba(4,6,16,${base})`;
    d.fillRect(0, 0, VIEW_W, VIEW_H);
    d.globalCompositeOperation = "destination-out";
    const hole = (wx: number, wy: number, r: number, s: number) => {
      const x = wx - this.view.x, y = wy - this.view.y;
      if (x < -r || y < -r || x > VIEW_W + r || y > VIEW_H + r) return;
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${s})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = g;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (this.state !== "title") {
      const p = this.player;
      hole(p.x, p.y, 85, 0.85);
      const fx = p.x + Math.cos(p.aim) * 100;
      const fy = p.y + Math.sin(p.aim) * 100;
      const flick = 0.9 + Math.sin(this.clock * 17) * 0.06;
      hole(p.x + Math.cos(p.aim) * 45, p.y + Math.sin(p.aim) * 45, 95 * flick, 0.9);
      hole(fx, fy, 125 * flick, 0.92);
    }
    CANDLES.forEach((cd, i) => {
      const fl = 0.82 + 0.18 * Math.sin(this.clock * 8.3 + i * 2.1) * Math.sin(this.clock * 3.7 + i);
      hole(cd.x, cd.y, cd.r * fl, 0.88);
    });
    hole(CHANDELIER.x, CHANDELIER.y - 26, CHANDELIER.r, 0.8);
    for (const fl of this.flashes) hole(fl.x, fl.y, fl.r * (0.4 + fl.t / fl.max), 0.95);
    if (this.doorOpen) hole(22 * TILE, 26 * TILE, 100, 0.5);
    this.ctx.drawImage(this.dark, 0, 0);
  }

  private drawLitOverlay(c: CanvasRenderingContext2D) {
    // warm glows + self-lit things drawn on top of darkness
    c.save();
    c.globalCompositeOperation = "lighter";
    const glow = (wx: number, wy: number, r: number, col: string) => {
      const x = wx - this.view.x, y = wy - this.view.y;
      if (x < -r || y < -r || x > VIEW_W + r || y > VIEW_H + r) return;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    CANDLES.forEach((cd, i) => {
      const fl = 0.7 + 0.3 * Math.sin(this.clock * 8.3 + i * 2.1);
      glow(cd.x, cd.y, cd.r * 0.55 * fl, "rgba(232,163,61,0.07)");
    });
    glow(CHANDELIER.x, CHANDELIER.y - 26, 150, "rgba(232,180,90,0.06)");
    for (const fl of this.flashes) glow(fl.x, fl.y, fl.r, "rgba(255,210,120,0.25)");
    // tracers
    for (const t of this.tracers) {
      const a = Math.max(0, t.t / 0.08);
      c.strokeStyle = `rgba(255,214,130,${a * 0.9})`;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(t.x0 - this.view.x, t.y0 - this.view.y);
      c.lineTo(t.x1 - this.view.x, t.y1 - this.view.y);
      c.stroke();
      c.strokeStyle = `rgba(255,255,240,${a * 0.7})`;
      c.lineWidth = 1;
      c.stroke();
    }
    // sparks
    for (const pt of this.particles) {
      if (pt.kind !== "spark") continue;
      c.globalAlpha = Math.max(0, pt.life / pt.max);
      c.fillStyle = pt.color;
      c.fillRect(pt.x - this.view.x - 1, pt.y - this.view.y - 1, pt.size, pt.size);
    }
    c.globalAlpha = 1;
    c.restore();

    // flames (self-lit pixel art)
    const flame = (wx: number, wy: number, s: number) => {
      const x = wx - this.view.x, y = wy - this.view.y;
      if (x < -20 || y < -20 || x > VIEW_W + 20 || y > VIEW_H + 20) return;
      const f = Math.sin(this.clock * 12 + wx * 0.7);
      c.fillStyle = "#e8a33d";
      c.fillRect(x - 2 * s, y - (5 + f) * s, 4 * s, (6 + f) * s);
      c.fillStyle = "#ffe9a0";
      c.fillRect(x - s, y - (3 + f * 0.6) * s, 2 * s, (4 + f * 0.6) * s);
    };
    for (const cd of CANDLES) if (cd.flame) flame(cd.x, cd.y - 8, 1);
    // fireplace fire
    const fpx = 22.5 * TILE, fpy = 11.2 * TILE;
    flame(fpx - 10, fpy, 1.4);
    flame(fpx + 2, fpy - 3, 1.7);
    flame(fpx + 13, fpy, 1.3);
    // chandelier candles
    const chx = CHANDELIER.x + Math.sin(this.clock * 0.9) * 3;
    for (const off of [-26, -13, 0, 13, 26]) flame(chx + off, CHANDELIER.y - 32, 0.8);
    // typewriter lamp bulb
    glow(18.16 * TILE, 11 * TILE - 32, 26, "rgba(255,217,138,0.3)");
    c.fillStyle = "#ffd98a";
    c.fillRect(18.16 * TILE - this.view.x - 2, 11 * TILE - 34 - this.view.y, 4, 4);

    // muzzle flash star
    for (const fl of this.flashes) {
      const x = fl.x - this.view.x, y = fl.y - this.view.y;
      const a = fl.t / fl.max;
      c.fillStyle = `rgba(255,233,160,${a})`;
      c.fillRect(x - 4, y - 2, 8, 4);
      c.fillRect(x - 2, y - 4, 4, 8);
    }
    // fuse sparkle glints already in world pass
    // dust motes
    c.globalAlpha = 0.06;
    c.fillStyle = "#d8c9a3";
    for (let i = 0; i < 30; i++) {
      const mx = ((i * 173 + this.clock * (6 + (i % 5))) % VIEW_W);
      const my = ((i * 97 + this.clock * (3 + (i % 3)) * 2) % VIEW_H);
      c.fillRect(mx, my, 2, 2);
    }
    c.globalAlpha = 1;
  }

  private drawPostVignettes(c: CanvasRenderingContext2D) {
    const p = this.player;
    if (p.flashRed > 0 && this.state !== "title") {
      const a = Math.min(0.55, p.flashRed);
      const g = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 120, VIEW_W / 2, VIEW_H / 2, 560);
      g.addColorStop(0, "rgba(150,10,16,0)");
      g.addColorStop(1, `rgba(150,10,16,${a})`);
      c.fillStyle = g;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.state === "dying") {
      const a = clamp(1 - this.dieT / 1.7, 0, 1);
      c.fillStyle = `rgba(20,2,4,${a * 0.92})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const d of this.detach) d();
    this.audio.destroy();
  }
}
