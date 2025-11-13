import React, { useEffect, useRef, useState } from "react";

type Vec = { x: number; y: number };

type Bullet = {
  id: number;
  pos: Vec;
  vel: Vec;
  life: number;
  friendly: boolean;
  color: string;
};

type Asteroid = {
  id: number;
  pos: Vec;
  vel: Vec;
  radius: number;
  rot: number;
  rotSpeed: number;
};

type Ship = {
  id: number;
  pos: Vec;
  vel: Vec;
  angle: number;
  radius: number;
  thrusting: boolean;
  invuln: number;
  color: string;
  ai?: {
    shootCooldown: number;
    fireDelay: number;
    targetId: number | null;
  };
  dead?: boolean;
};

const randRange = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const dist2 = (a: Vec, b: Vec) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const wrap = (p: Vec, width: number, height: number) => {
  if (p.x < 0) p.x += width;
  if (p.x > width) p.x -= width;
  if (p.y < 0) p.y += height;
  if (p.y > height) p.y -= height;
};
const angleLerp = (a: number, b: number, t: number) => {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [isGameOver, setIsGameOver] = useState(false);
  const [started, setStarted] = useState(false);

  const gameRef = useRef<{
    width: number;
    height: number;
    player: Ship;
    enemies: Ship[];
    asteroids: Asteroid[];
    bullets: Bullet[];
    nextId: number;
    keys: Record<string, boolean>;
    lastTime: number;
    running: boolean;
    flash: number;
  } | null>(null);

  // Initialize/reset game
  const resetGame = () => {
    const width = 900;
    const height = 620;
    const player: Ship = {
      id: 1,
      pos: { x: width / 2, y: height / 2 },
      vel: { x: 0, y: 0 },
      angle: -Math.PI / 2,
      radius: 12,
      color: "#45ffb0",
      thrusting: false,
      invuln: 2.5,
    };
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < 8; i++) {
      const a: Asteroid = {
        id: i + 100,
        pos: { x: randRange(0, width), y: randRange(0, height) },
        vel: { x: randRange(-35, 35), y: randRange(-35, 35) },
        radius: randRange(18, 40),
        rot: Math.random() * Math.PI * 2,
        rotSpeed: randRange(-1, 1),
      };
      if (dist2(a.pos, player.pos) < (a.radius + 120) * (a.radius + 120)) {
        i--;
        continue;
      }
      asteroids.push(a);
    }
    const enemies: Ship[] = [];
    for (let i = 0; i < 2; i++) {
      const e: Ship = {
        id: 200 + i,
        pos: {
          x: randRange(0, width),
          y: randRange(0, height),
        },
        vel: { x: 0, y: 0 },
        angle: randRange(0, Math.PI * 2),
        radius: 12,
        color: "#ff5c58",
        thrusting: false,
        invuln: 1,
        ai: { shootCooldown: randRange(0.2, 1.1), fireDelay: 0, targetId: 1 },
      };
      if (dist2(e.pos, player.pos) < 240 * 240) {
        i--;
        continue;
      }
      enemies.push(e);
    }
    gameRef.current = {
      width,
      height,
      player,
      enemies,
      asteroids,
      bullets: [],
      nextId: 1000,
      keys: {},
      lastTime: performance.now(),
      running: true,
      flash: 0,
    };
    setIsGameOver(false);
    setLives(3);
    setScore(0);
    setStarted(true);
  };

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0;

    const onResize = () => {
      const container = c.parentElement;
      const w = Math.min(900, container ? container.clientWidth - 20 : 900);
      const ar = 900 / 620;
      c.width = w;
      c.height = w / ar;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const keyMap: Record<string, string> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      a: "left",
      d: "right",
      w: "up",
      s: "down",
      " ": "space",
      Spacebar: "space",
      r: "restart",
    };
    const handleKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const mapped = keyMap[k] ?? k;
      if (mapped) {
        if (mapped === "restart" && down) {
          resetGame();
        } else {
          gameRef.current && (gameRef.current.keys[mapped] = down);
        }
      }
    };
    window.addEventListener("keydown", (e) => handleKey(e, true));
    window.addEventListener("keyup", (e) => handleKey(e, false));
    c.addEventListener("click", () => {
      if (!started || isGameOver) {
        resetGame();
      } else {
        // allow shooting by clicking too
        gameRef.current && (gameRef.current.keys["space"] = true);
        setTimeout(() => gameRef.current && (gameRef.current.keys["space"] = false), 100);
      }
    });

    const shoot = (from: Ship, friendly: boolean) => {
      const g = gameRef.current!;
      const speed = 300;
      const bx = from.pos.x + Math.cos(from.angle) * (from.radius + 4);
      const by = from.pos.y + Math.sin(from.angle) * (from.radius + 4);
      const bv = {
        x: Math.cos(from.angle) * speed + from.vel.x * 0.6,
        y: Math.sin(from.angle) * speed + from.vel.y * 0.6,
      };
      const bullet: Bullet = {
        id: g.nextId++,
        pos: { x: bx, y: by },
        vel: bv,
        life: 1.5,
        friendly,
        color: friendly ? "#b8ffdb" : "#ff9b97",
      };
      g.bullets.push(bullet);
    };

    const update = (t: number) => {
      const g = gameRef.current;
      if (!g || !g.running) {
        raf = requestAnimationFrame(update);
        draw(ctx);
        return;
      }
      let dt = (t - g.lastTime) / 1000;
      if (dt > 0.04) dt = 0.04; // clamp to avoid jumps
      g.lastTime = t;

      // Controls
      const player = g.player;
      const acel = 150;
      const friction = 0.995;
      const maxSpeed = 270;
      const turnSpeed = 3.4;
      if (g.keys.left) player.angle -= turnSpeed * dt;
      if (g.keys.right) player.angle += turnSpeed * dt;
      if (g.keys.up) {
        player.vel.x += Math.cos(player.angle) * acel * dt;
        player.vel.y += Math.sin(player.angle) * acel * dt;
        player.thrusting = true;
      } else {
        player.thrusting = false;
      }
      if (g.keys.down) {
        player.vel.x -= Math.cos(player.angle) * (acel * 0.6) * dt;
        player.vel.y -= Math.sin(player.angle) * (acel * 0.6) * dt;
      }
      const spd = Math.hypot(player.vel.x, player.vel.y);
      if (spd > maxSpeed) {
        player.vel.x *= maxSpeed / spd;
        player.vel.y *= maxSpeed / spd;
      }
      player.vel.x *= friction;
      player.vel.y *= friction;

      if (g.keys.space && (!("shootDelay" in (player as any)) || (player as any).shootDelay <= 0)) {
        shoot(player, true);
        (player as any).shootDelay = 0.22;
      }
      if (("shootDelay" in (player as any))) {
        (player as any).shootDelay -= dt;
      }

      // Player pos updates
      player.pos.x += player.vel.x * dt;
      player.pos.y += player.vel.y * dt;
      wrap(player.pos, g.width, g.height);
      if (player.invuln > 0) player.invuln -= dt;

      // Enemies AI
      g.enemies.forEach((e) => {
        if (e.dead) return;
        const target = g.player;
        const to = { x: target.pos.x - e.pos.x, y: target.pos.y - e.pos.y };
        const tgtAngle = Math.atan2(to.y, to.x);
        e.angle = angleLerp(e.angle, tgtAngle, clamp(2 * dt, 0, 1));
        const dist = Math.hypot(to.x, to.y);
        // Thrust control - maintain combat distance
        const desired = dist > 260 ? 1 : dist < 160 ? -0.7 : 0.2;
        e.vel.x += Math.cos(e.angle) * (acel * 0.6) * desired * dt;
        e.vel.y += Math.sin(e.angle) * (acel * 0.6) * desired * dt;
        // small sideways jitter to make them less predictable
        const jitter = (Math.random() - 0.5) * 0.4;
        e.angle += jitter * dt;
        e.vel.x *= 0.995;
        e.vel.y *= 0.995;
        const evspd = Math.hypot(e.vel.x, e.vel.y);
        if (evspd > 220) {
          e.vel.x *= 220 / evspd;
          e.vel.y *= 220 / evspd;
        }
        e.pos.x += e.vel.x * dt;
        e.pos.y += e.vel.y * dt;
        wrap(e.pos, g.width, g.height);
        if (e.invuln > 0) e.invuln -= dt;

        // Shoot when roughly aligned and at range
        if (e.ai) {
          e.ai.fireDelay -= dt;
          const diff = Math.atan2(Math.sin(tgtAngle - e.angle), Math.cos(tgtAngle - e.angle));
          if (Math.abs(diff) < 0.3 && dist < 600 && e.ai.fireDelay <= 0) {
            shoot(e, false);
            e.ai.fireDelay = randRange(0.5, 1.2);
          }
        }
      });

      // Asteroids update
      g.asteroids.forEach((a) => {
        a.pos.x += a.vel.x * dt;
        a.pos.y += a.vel.y * dt;
        a.rot += a.rotSpeed * dt;
        wrap(a.pos, g.width, g.height);
      });

      // Bullets
      g.bullets.forEach((b) => {
        b.life -= dt;
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
        wrap(b.pos, g.width, g.height);
      });
      g.bullets = g.bullets.filter((b) => b.life > 0);

      // Collisions
      // bullets vs asteroid/enemy/player
      for (const b of g.bullets) {
        if (b.friendly) {
          // vs asteroids
          for (const a of g.asteroids) {
            if (dist2(b.pos, a.pos) < (a.radius + 2) * (a.radius + 2)) {
              b.life = 0;
              const newScore = score + Math.round(10 + a.radius);
              setScore(newScore);
              g.flash = 0.2;
              // split or remove
              if (a.radius > 20) {
                const n1: Asteroid = {
                  id: g.nextId++,
                  pos: { ...a.pos },
                  vel: { x: a.vel.x + randRange(-40, 40), y: a.vel.y + randRange(-40, 40) },
                  radius: a.radius * 0.6,
                  rot: randRange(0, Math.PI * 2),
                  rotSpeed: randRange(-1, 1),
                };
                const n2: Asteroid = {
                  id: g.nextId++,
                  pos: { ...a.pos },
                  vel: { x: a.vel.x + randRange(-40, 40), y: a.vel.y + randRange(-40, 40) },
                  radius: a.radius * 0.6,
                  rot: randRange(0, Math.PI * 2),
                  rotSpeed: randRange(-1, 1),
                };
                g.asteroids.push(n1, n2);
              }
              a.radius = 0;
            }
          }
          // vs enemy ships
          for (const e of g.enemies) {
            if (!e.dead && dist2(b.pos, e.pos) < (e.radius + 3) * (e.radius + 3)) {
              if (e.invuln <= 0) {
                b.life = 0;
                const newScore = score + 100;
                setScore(newScore);
                e.dead = true;
                g.flash = 0.25;
                // respawn enemy after delay
                setTimeout(() => {
                  const width = g.width,
                    height = g.height;
                  e.pos = { x: randRange(0, width), y: randRange(0, height) };
                  e.vel = { x: 0, y: 0 };
                  e.angle = randRange(0, Math.PI * 2);
                  e.invuln = 1.2;
                  e.dead = false;
                }, 1800);
              }
            }
          }
        } else {
          // vs player
          if (player.invuln <= 0 && dist2(b.pos, player.pos) < (player.radius + 3) * (player.radius + 3)) {
            b.life = 0;
            handlePlayerHit();
          }
        }
      }

      // Cleanup asteroids removed
      g.asteroids = g.asteroids.filter((a) => a.radius > 0);

      // player collisions
      for (const a of g.asteroids) {
        if (player.invuln <= 0 && dist2(player.pos, a.pos) < (player.radius + a.radius) * (player.radius + a.radius)) {
          handlePlayerHit();
          break;
        }
      }
      // enemy colliding with player
      for (const e of g.enemies) {
        if (!e.dead && player.invuln <= 0 && dist2(player.pos, e.pos) < (player.radius + e.radius) * (player.radius + e.radius)) {
          handlePlayerHit();
          e.invuln = 0.7;
          e.vel.x += Math.cos(player.angle) * 220;
          e.vel.y += Math.sin(player.angle) * 220;
        }
      }

      // spawn asteroids if too few
      if (g.asteroids.length < 6 && Math.random() < 0.02) {
        const a: Asteroid = {
          id: g.nextId++,
          pos: {
            x: Math.random() < 0.5 ? 0 : g.width,
            y: randRange(0, g.height),
          },
          vel: { x: randRange(-30, 30), y: randRange(-30, 30) },
          radius: randRange(18, 40),
          rot: randRange(0, Math.PI * 2),
          rotSpeed: randRange(-1, 1),
        };
        g.asteroids.push(a);
      }

      // Game over
      if (lives <= 0 && !isGameOver) {
        setIsGameOver(true);
        g.running = false;
      }

      draw(ctx);
      raf = requestAnimationFrame(update);

      function handlePlayerHit() {
        setLives((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            g.running = false;
            setIsGameOver(true);
          }
          return next;
        });
        g.flash = 0.3;
        player.invuln = 2.3;
        // reset player near center
        player.pos = { x: g.width / 2, y: g.height / 2 };
        player.vel = { x: 0, y: 0 };
        player.angle = -Math.PI / 2;
      }
    };

    const drawShip = (ctx: CanvasRenderingContext2D, s: Ship) => {
      ctx.save();
      ctx.translate(s.pos.x, s.pos.y);
      ctx.rotate(s.angle);
      const inv = Math.max(0, s.invuln);
      const flicker = inv > 0 ? (Math.sin(performance.now() / 50) + 1) * 0.25 + 0.5 : 1;
      ctx.globalAlpha = flicker;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.radius + 5, 0);
      ctx.lineTo(-s.radius, -s.radius * 0.7);
      ctx.lineTo(-s.radius * 0.6, 0);
      ctx.lineTo(-s.radius, s.radius * 0.7);
      ctx.closePath();
      ctx.stroke();
      if ((s as any).thrusting) {
        ctx.beginPath();
        ctx.moveTo(-s.radius, 0);
        ctx.lineTo(-s.radius - randRange(6, 14), randRange(-3, 3));
        ctx.lineTo(-s.radius, 0);
        ctx.strokeStyle = "#ffd166";
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const drawAsteroid = (ctx: CanvasRenderingContext2D, a: Asteroid) => {
      const pts = 10;
      const r = a.radius;
      ctx.save();
      ctx.translate(a.pos.x, a.pos.y);
      ctx.rotate(a.rot);
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const angle = (i / pts) * Math.PI * 2;
        const pr = r * (0.8 + Math.random() * 0.4);
        const x = Math.cos(angle) * pr;
        const y = Math.sin(angle) * pr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "#c7d2d9";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
      const w = c.width;
      const h = c.height;
      const g = gameRef.current;

      // Background
      ctx.fillStyle = "#0b1117";
      ctx.fillRect(0, 0, w, h);

      // subtle stars
      ctx.fillStyle = "#0f1a22";
      for (let i = 0; i < 40; i++) {
        ctx.fillRect(((i * 53.1) % w) | 0, ((i * 97.3) % h) | 0, 2, 2);
      }
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = i % 2 ? "#14222b" : "#0f1a22";
        ctx.fillRect(((i * 11.13) % w) | 0, ((i * 17.77) % h) | 0, 3, 3);
      }

      if (!g) return;

      ctx.save();
      // scale for canvas -> game world
      const sx = w / g.width;
      const sy = h / g.height;
      ctx.scale(sx, sy);

      if (g.flash > 0) {
        g.flash -= 0.016;
        ctx.fillStyle = "rgba(255,255,255," + g.flash + ")";
        ctx.fillRect(0, 0, g.width, g.height);
      }

      // bullets
      for (const b of g.bullets) {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // asteroids
      for (const a of g.asteroids) {
        drawAsteroid(ctx, a);
      }
      // enemies
      for (const e of g.enemies) {
        if (!e.dead) drawShip(ctx, e);
      }
      // player
      drawShip(ctx, g.player);

      // UI overlay (scaled to world then later with screen space)
      ctx.restore();

      // HUD in screen space
      ctx.fillStyle = "#e6f1f5";
      ctx.font = "bold 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "left";
      ctx.fillText(`Score: ${score}`, 12, 22);
      ctx.fillText(`Lives: ${lives}`, 12, 42);
      ctx.fillStyle = "#9fb3bf";
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("Arrows/WASD to steer • Space to shoot • R to restart", 12, h - 14);

      if (!started) {
        ctx.fillStyle = "rgba(11,17,23,0.65)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#e6f1f5";
        ctx.textAlign = "center";
        ctx.font = "700 28px ui-sans-serif, system-ui";
        ctx.fillText("Asteroid Dogfight", w / 2, h / 2 - 30);
        ctx.font = "16px ui-sans-serif, system-ui";
        ctx.fillStyle = "#b9c8d1";
        ctx.fillText("Click to start • Arrows/WASD to move • Spacebar to shoot", w / 2, h / 2 + 4);
        ctx.fillText("Destroy asteroids and out-fly the red AI ships.", w / 2, h / 2 + 30);
      }

      if (isGameOver) {
        ctx.fillStyle = "rgba(11,17,23,0.75)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffb4b1";
        ctx.font = "bold 34px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Game Over", w / 2, h / 2 - 16);
        ctx.fillStyle = "#e6f1f5";
        ctx.font = "16px ui-sans-serif, system-ui";
        ctx.fillText(`Final Score: ${score}`, w / 2, h / 2 + 14);
        ctx.fillStyle = "#b9c8d1";
        ctx.fillText("Press R or click to restart", w / 2, h / 2 + 40);
      }
    };

    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", (e) => handleKey(e, true));
      window.removeEventListener("keyup", (e) => handleKey(e, false));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, lives, isGameOver, started]);

  useEffect(() => {
    // Initial paint with overlay
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0b1117";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }, []);

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0b1117 0%, #0d141c 100%)",
        color: "#e6f1f5",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 940,
          border: "1px solid #1b2a35",
          borderRadius: 12,
          background: "#0b1117",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid #15232c",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, #0d151d 0%, #0b1117 100%)",
          }}
        >
          <div style={{ fontWeight: 700, letterSpacing: 0.3 }}>🚀 Asteroid Dogfight</div>
          <div style={{ fontSize: 12, color: "#9fb3bf" }}>
            Arrows/WASD to move • Space to shoot • R to restart
          </div>
        </div>
        <div style={{ padding: 10 }}>
          <canvas
            ref={canvasRef}
            width={900}
            height={620}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 8,
              background: "#0b1117",
            }}
          />
        </div>
      </div>
    </div>
  );
}
