import { useEffect, useRef, useState } from "react";
import {
  Engine, VIEW_W, VIEW_H,
  type Screen, type HudData, type BannerMsg, type ToastMsg, type RankResult,
} from "./game/engine";
import { ROOMS } from "./game/map";

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<HudData | null>(null);
  const [banner, setBanner] = useState<BannerMsg | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [result, setResult] = useState<RankResult | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const eng = new Engine(canvas, {
      onScreen: (s) => {
        setScreen(s);
        if (s === "playing") {
          setHint(true);
          window.setTimeout(() => setHint(false), 9000);
        }
      },
      onHud: setHud,
      onBanner: setBanner,
      onToast: setToast,
      onResult: setResult,
    });
    engRef.current = eng;
    return () => eng.destroy();
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 3450);
    return () => window.clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2850);
    return () => window.clearTimeout(t);
  }, [toast]);

  const eng = () => engRef.current;
  const inGame = screen === "playing" || screen === "paused" || screen === "dying";
  const condition = hud ? (hud.hp > 70 ? "FINE" : hud.hp > 35 ? "CAUTION" : "DANGER") : "FINE";
  const condColor =
    condition === "FINE" ? "#4fae5a" : condition === "CAUTION" ? "#e0b23a" : "#d2372b";

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#050407]">
      <div
        className="relative crt-curve"
        style={{ width: "min(100vw, calc(100vh * 1.7778))", aspectRatio: "16/9" }}
      >
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="absolute inset-0 w-full h-full pixelated" />

        {/* CRT dressing */}
        <div className="absolute inset-0 pointer-events-none scanlines crt-flicker" />
        <div className="absolute inset-0 pointer-events-none vignette" />

        {/* danger vignette */}
        {screen === "playing" && hud && hud.hp <= 35 && (
          <div className="absolute inset-0 pointer-events-none danger-vignette" />
        )}

        {/* ------------ ROOM BANNER (letterbox) ------------ */}
        {banner && screen !== "title" && (
          <div key={banner.key} className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-[9%] bg-black banner-bar-top" />
            <div className="absolute bottom-0 left-0 right-0 h-[9%] bg-black banner-bar-bot" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="banner-name font-display text-[clamp(28px,5vw,54px)] leading-none text-[#d8b45a] [text-shadow:0_2px_0_#3a2a10,0_0_30px_rgba(216,180,90,0.35)]">
                {banner.name}
              </div>
              <div className="banner-sub mt-3 text-[8px] tracking-[0.3em] text-[#8a7a5a] uppercase">
                {banner.sub}
              </div>
            </div>
          </div>
        )}

        {/* ------------ ITEM TOAST ------------ */}
        {toast && toast.body && (
          <div key={toast.key} className="absolute top-[12%] left-1/2 -translate-x-1/2 toast-anim pointer-events-none">
            <div className="border-2 border-[#8a6d3b] bg-[#0d0a08]/95 px-5 py-3 text-center shadow-[0_0_24px_rgba(0,0,0,0.8)]">
              <div className="text-[8px] text-[#c1272d] tracking-[0.25em] mb-2">
                {toast.title || "—"}
              </div>
              <div className="text-[9px] text-[#e8d9a8] leading-relaxed">{toast.body}</div>
            </div>
          </div>
        )}

        {/* ------------ INTERACT PROMPT ------------ */}
        {screen === "playing" && hud?.interact && (
          <div className="absolute bottom-[19%] left-1/2 -translate-x-1/2 text-center pointer-events-none rise-in">
            <div className="border border-[#6a5a3a] bg-black/80 px-4 py-2">
              <span className="keycap">E</span>
              <span className="text-[9px] text-[#e8d9a8] ml-2 tracking-wider">
                {hud.interact.label}
              </span>
              {hud.interact.locked && (
                <div className="mt-2 text-[8px] text-[#c1272d] tracking-widest">
                  {hud.interact.locked}
                </div>
              )}
              {hud.interact.progress !== null && (
                <div className="mt-2 w-40 h-[6px] bg-[#1d1812] border border-[#6a5a3a] mx-auto">
                  <div
                    className="h-full bg-[#d8b45a]"
                    style={{ width: `${Math.min(100, hud.interact.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------ HUD ------------ */}
        {inGame && hud && (
          <div className="absolute bottom-0 left-0 right-0 hud-panel px-4 py-2 flex items-center gap-4 text-[9px]">
            {/* condition */}
            <div className="flex items-center gap-3 min-w-[168px]">
              <div
                className="w-4 h-4 border border-black/60"
                style={{ background: condColor, boxShadow: `0 0 10px ${condColor}` }}
              />
              <div>
                <div className="text-[7px] text-[#8a7a5a] tracking-[0.2em] mb-1">CONDITION</div>
                <div
                  className={condition === "DANGER" ? "blink" : ""}
                  style={{ color: condColor, fontSize: 10 }}
                >
                  {condition}
                </div>
              </div>
              <svg width="52" height="18" viewBox="0 0 52 18" className="opacity-80">
                <polyline
                  points="0,9 10,9 14,3 19,15 24,9 34,9 37,6 40,12 43,9 52,9"
                  fill="none"
                  stroke={condColor}
                  strokeWidth="1.5"
                />
              </svg>
            </div>

            {/* ammo */}
            <div className="flex items-center gap-3 border-l border-[#3a2c1c] pl-4">
              <svg width="14" height="18" viewBox="0 0 14 18" shapeRendering="crispEdges">
                <rect x="4" y="1" width="6" height="4" fill="#c9a24a" />
                <rect x="3" y="5" width="8" height="9" fill="#8a6d3b" />
                <rect x="3" y="14" width="8" height="3" fill="#c9a24a" />
              </svg>
              <div>
                <div className="text-[7px] text-[#8a7a5a] tracking-[0.2em] mb-1">HANDGUN</div>
                {hud.reloading ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[#d8b45a] blink" style={{ fontSize: 10 }}>RELOADING</span>
                    <span className="w-16 h-[5px] bg-[#1d1812] border border-[#4a3c24] inline-block">
                      <span className="block h-full bg-[#d8b45a]" style={{ width: `${hud.reloadP * 100}%` }} />
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 13 }}>
                    <span className={hud.lowAmmo ? "text-[#d2372b] blink" : "text-[#e8d9a8]"}>
                      {String(hud.mag).padStart(2, "0")}
                    </span>
                    <span className="text-[#8a7a5a]"> / {hud.reserve}</span>
                  </div>
                )}
              </div>
            </div>

            {/* fuses */}
            <div className="flex items-center gap-2 border-l border-[#3a2c1c] pl-4">
              <div>
                <div className="text-[7px] text-[#8a7a5a] tracking-[0.2em] mb-1">FUSES</div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <svg key={i} width="12" height="18" viewBox="0 0 12 18" shapeRendering="crispEdges">
                      <rect x="3" y="0" width="2" height="3" fill={i < hud.fuses ? "#c9a24a" : "#2a2218"} />
                      <rect x="7" y="0" width="2" height="3" fill={i < hud.fuses ? "#c9a24a" : "#2a2218"} />
                      <rect x="2" y="3" width="8" height="12" fill={i < hud.fuses ? "#d8d0b8" : "#2a2218"} />
                      <rect x="2" y="3" width="8" height="3" fill={i < hud.fuses ? "#c9a24a" : "#33291c"} />
                      {i < hud.fuses && <rect x="4" y="8" width="4" height="4" fill="#c1272d" />}
                    </svg>
                  ))}
                </div>
              </div>
            </div>

            {/* stats */}
            <div className="hidden md:flex flex-col gap-1 border-l border-[#3a2c1c] pl-4 text-[#8a7a5a]">
              <span>TIME <span className="text-[#e8d9a8]">{fmt(hud.time)}</span></span>
              <span>SAVES <span className="text-[#e8d9a8]">{hud.saves}</span> · KILLS <span className="text-[#e8d9a8]">{hud.kills}</span></span>
            </div>

            <div className="flex-1" />

            {/* minimap + room */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[7px] text-[#8a7a5a] tracking-[0.2em] mb-1">
                  {ROOMS[hud.roomId]?.name ?? "???"}
                </div>
                <div className="text-[7px] text-[#5a4c34]">
                  {hud.doorOpen ? "FRONT DOOR OPEN" : `FRONT DOOR SEALED`}
                </div>
              </div>
              <div className="border border-[#6a5a3a] bg-black/70 p-1">
                <svg width={132} height={102} viewBox="0 0 132 102" shapeRendering="crispEdges">
                  {ROOMS.map((r) => {
                    const seen = hud.visited.includes(r.id);
                    return (
                      <rect
                        key={r.id}
                        x={r.x * 3} y={r.y * 3} width={r.w * 3} height={r.h * 3}
                        fill={seen ? (r.id === hud.roomId ? "#4a3222" : "#2c1f18") : "#130f0c"}
                        stroke="#6a5a3a" strokeWidth="1"
                      />
                    );
                  })}
                  <rect
                    x={21 * 3} y={25 * 3} width={6} height={3}
                    fill={hud.doorOpen ? "#4fae5a" : "#c1272d"}
                  />
                  {screen !== "dying" && (
                    <circle className="mm-dot" cx={(hud.px / 32) * 3} cy={(hud.py / 32) * 3} r={2.4} fill="#e8d9a8" />
                  )}
                </svg>
              </div>
            </div>

            {hud.muted && (
              <div className="text-[7px] text-[#8a7a5a] border border-[#3a2c1c] px-2 py-1">MUTED</div>
            )}
          </div>
        )}

        {/* controls hint */}
        {hint && screen === "playing" && (
          <div className="absolute top-3 right-3 text-[7px] text-[#8a7a5a] bg-black/60 border border-[#2a2218] px-3 py-2 leading-relaxed pointer-events-none">
            WASD MOVE · MOUSE AIM · LMB FIRE
            <br />
            R RELOAD · SHIFT RUN · E USE · ESC PAUSE
          </div>
        )}

        {/* ------------ TITLE ------------ */}
        {screen === "title" && (
          <div className="absolute inset-0 flex flex-col items-center justify-between py-[4%] bg-gradient-to-b from-black/70 via-transparent to-black/85">
            <div className="text-[7px] tracking-[0.4em] text-[#8a3a3a] mt-[2%]">
              A FAN-MADE 8-BIT SURVIVAL HORROR
            </div>
            <div className="text-center -mt-[4%]">
              <h1 className="font-display title-blood text-[clamp(52px,9.5vw,116px)] leading-[0.9]">
                MANSION
              </h1>
              <div className="flex items-center justify-center gap-4 my-1">
                <span className="h-px w-[18%] bg-[#8a6d3b]/60" />
                <span className="font-display title-ghost text-[clamp(20px,3vw,34px)]">of the</span>
                <span className="h-px w-[18%] bg-[#8a6d3b]/60" />
              </div>
              <h1 className="font-display title-blood text-[clamp(52px,9.5vw,116px)] leading-[0.9]">
                DEAD
              </h1>
              <div className="mt-4 text-[8px] tracking-[0.42em] text-[#7fa06a]">
                THEY ARE STILL HUNGRY
              </div>
            </div>

            <div className="w-[86%] max-w-[880px]">
              <button className="btn-re w-full mb-3 text-[11px] py-4" onClick={() => eng()?.startFromTitle()}>
                <span className="blink mr-3">▸</span> CLICK OR PRESS ENTER — BEGIN THE NIGHT
              </button>
              <div className="grid grid-cols-2 gap-3 text-[7px] leading-[1.9] text-[#8a7a5a]">
                <div className="border border-[#2a2218] bg-black/50 px-4 py-3">
                  <div className="text-[#d8b45a] tracking-[0.25em] mb-1">KEYBOARD + MOUSE</div>
                  <span className="keycap">W</span><span className="keycap">A</span>
                  <span className="keycap">S</span><span className="keycap">D</span> MOVE ·{" "}
                  <span className="keycap">MOUSE</span> AIM · <span className="keycap">LMB</span> FIRE (AUTO-AIM)
                  <br />
                  <span className="keycap">R</span> RELOAD · <span className="keycap">SHIFT</span> RUN ·{" "}
                  <span className="keycap">E</span> USE · <span className="keycap">ESC</span> PAUSE ·{" "}
                  <span className="keycap">M</span> MUTE
                </div>
                <div className="border border-[#2a2218] bg-black/50 px-4 py-3">
                  <div className="text-[#d8b45a] tracking-[0.25em] mb-1">GAMEPAD</div>
                  LEFT STICK MOVE · RIGHT STICK AIM · RT FIRE
                  <br />
                  LT RUN · Ⓧ RELOAD · Ⓐ USE · START PAUSE
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[7px] text-[#5a4c34]">
                <span>OBJECTIVE: FIND 3 FUSES — UNLOCK THE FRONT DOOR — ESCAPE</span>
                <span className="text-[#8a3a3a]">♪ HAUNTING AMBIENT — HEADPHONES ADVISED</span>
              </div>
            </div>
          </div>
        )}

        {/* ------------ PAUSE ------------ */}
        {screen === "paused" && (
          <div className="absolute inset-0 bg-black/78 flex flex-col items-center justify-center gap-7">
            <div className="font-display text-6xl text-[#d8b45a] [text-shadow:0_3px_0_#3a2a10]">PAUSED</div>
            <div className="flex flex-col gap-3 w-64">
              <button className="btn-re" onClick={() => eng()?.togglePause()}>RESUME</button>
              <button className="btn-re btn-ghost" onClick={() => eng()?.newRun()}>RESTART NIGHT</button>
              <button className="btn-re btn-ghost" onClick={() => eng()?.toggleMute()}>
                SOUND: {hud?.muted ? "OFF" : "ON"}
              </button>
              <button className="btn-re btn-ghost" onClick={() => eng()?.quitToTitle()}>QUIT TO TITLE</button>
            </div>
            <div className="text-[7px] text-[#5a4c34] tracking-widest">
              THE MANSION WAITS. IT IS PATIENT.
            </div>
          </div>
        )}

        {/* ------------ DEATH ------------ */}
        {screen === "dead" && (
          <div className="absolute inset-0 bg-[#0a0204]/92 flex flex-col items-center justify-center gap-6">
            <div className="death-in text-center">
              <div className="font-display title-blood text-[clamp(64px,10vw,120px)] leading-none">
                YOU DIED
              </div>
              <div className="mt-4 text-[8px] tracking-[0.3em] text-[#8a5a4a]">
                THE MANSION CLAIMS ANOTHER SOUL
              </div>
            </div>
            <div className="flex flex-col gap-3 w-72 rise-in" style={{ animationDelay: "1.2s" }}>
              <button
                className="btn-re"
                disabled={!hud?.hasSave}
                onClick={() => eng()?.continueRun()}
              >
                {hud?.hasSave ? "CONTINUE — LAST SAVE" : "NO INK SAVED"}
              </button>
              <button className="btn-re btn-ghost" onClick={() => eng()?.newRun()}>
                RESTART THE NIGHT
              </button>
              <button className="btn-re btn-ghost" onClick={() => eng()?.quitToTitle()}>
                GIVE UP — TITLE
              </button>
            </div>
            <div className="text-[7px] text-[#5a3a34] tracking-widest">PRESS ENTER TO CONTINUE</div>
          </div>
        )}

        {/* ------------ VICTORY ------------ */}
        {screen === "victory" && result && (
          <div className="absolute inset-0 bg-black/88 flex flex-col items-center justify-center gap-5">
            <div className="text-center rise-in">
              <div className="font-display text-[clamp(40px,6vw,72px)] text-[#d8b45a] leading-none [text-shadow:0_3px_0_#3a2a10,0_0_40px_rgba(216,180,90,0.3)]">
                YOU ESCAPED
              </div>
              <div className="mt-3 text-[8px] tracking-[0.3em] text-[#7fa06a]">
                DAWN BREAKS OVER THE MANSION OF THE DEAD
              </div>
            </div>

            <div className="relative border-2 border-[#6a5a3a] bg-[#0d0a08]/95 px-8 py-5 w-[420px] max-w-[90%] rise-in" style={{ animationDelay: "0.2s" }}>
              <div className="grid grid-cols-2 gap-y-2 text-[8px]">
                <span className="text-[#8a7a5a]">ESCAPE TIME</span>
                <span className="text-right text-[#e8d9a8]">{fmt(result.time)}</span>
                <span className="text-[#8a7a5a]">KILLS</span>
                <span className="text-right text-[#e8d9a8]">{result.kills}</span>
                <span className="text-[#8a7a5a]">TYPEWRITER SAVES</span>
                <span className="text-right text-[#e8d9a8]">{result.saves}</span>
                <span className="text-[#8a7a5a]">HERBS USED</span>
                <span className="text-right text-[#e8d9a8]">{result.herbs}</span>
                <span className="text-[#8a7a5a]">DAMAGE TAKEN</span>
                <span className="text-right text-[#e8d9a8]">{result.damage}</span>
                <span className="text-[#8a7a5a] border-t border-[#3a2c1c] pt-2">SCORE</span>
                <span className="text-right text-[#d8b45a] border-t border-[#3a2c1c] pt-2">{result.score}</span>
              </div>
              <div
                className="stamp-in absolute -right-6 -top-8 font-display text-[84px] leading-none px-4 border-4"
                style={{
                  color: result.rank === "S" ? "#d8b45a" : result.rank === "A" ? "#4fae5a" : result.rank === "B" ? "#e0b23a" : "#8a7a5a",
                  borderColor: "currentColor",
                  textShadow: "0 0 24px rgba(0,0,0,0.8)",
                }}
              >
                {result.rank}
              </div>
            </div>

            <div className="flex gap-3 rise-in" style={{ animationDelay: "0.4s" }}>
              <button className="btn-re" onClick={() => eng()?.newRun()}>PLAY AGAIN</button>
              <button className="btn-re btn-ghost" onClick={() => eng()?.quitToTitle()}>TITLE</button>
            </div>
            <div className="text-[7px] text-[#5a4c34] tracking-widest">PRESS ENTER FOR TITLE</div>
          </div>
        )}
      </div>
    </div>
  );
}
