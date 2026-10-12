'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { POIS } from '@/game/world/WorldConfig';
import { X } from 'lucide-react';

const MAP_WORLD = 1432;

function worldToCanvas(x: number, z: number, size: number): [number, number] {
  return [((x + MAP_WORLD / 2) / MAP_WORLD) * size, ((z + MAP_WORLD / 2) / MAP_WORLD) * size];
}

export default function MapUI() {
  const close = useGameStore((s) => s.closeOverlay);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverPoi, setHoverPoi] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        close();
        gameApi.clickResumeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const size = Math.min(wrap.clientWidth, wrap.clientHeight) - 8;
    if (size < 10) return;
    canvas.width = canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    const src = gameApi.mapCanvas();
    const pm = gameApi.playerMap();
    const explored = pm.explored;

    ctx.clearRect(0, 0, size, size);

    // Parchment base
    ctx.fillStyle = '#c9bb9c';
    ctx.fillRect(0, 0, size, size);

    if (src) {
      // Draw only explored cells from the pre-rendered map
      const cells = 128;
      const cellSize = size / cells;
      ctx.save();
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          if (!explored[j * cells + i]) continue;
          ctx.drawImage(
            src,
            i * (src.width / cells), j * (src.height / cells),
            src.width / cells, src.height / cells,
            i * cellSize, j * cellSize,
            cellSize + 0.6, cellSize + 0.6,
          );
        }
      }
      ctx.restore();
    }

    // Grid lines (cartographer feel) only over explored areas
    ctx.strokeStyle = 'rgba(42, 33, 24, 0.12)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 8; g++) {
      ctx.beginPath();
      ctx.moveTo((g / 8) * size, 0);
      ctx.lineTo((g / 8) * size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (g / 8) * size);
      ctx.lineTo(size, (g / 8) * size);
      ctx.stroke();
    }

    // Discovered POI markers
    for (const poi of POIS) {
      if (!pm.discovered.includes(poi.id)) continue;
      const [px, py] = worldToCanvas(poi.x, poi.z, size);
      const exploredNearby = (() => {
        const cx = Math.floor(((poi.x + 716) / 1432) * 128);
        const cz = Math.floor(((poi.z + 716) / 1432) * 128);
        return explored[cz * 128 + cx];
      })();
      if (!exploredNearby) continue;
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hoverPoi === poi.id ? '#e8cc6a' : '#8a2f2f';
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2118';
      ctx.font = `${Math.max(10, size * 0.024)}px 'EB Garamond', serif`;
      ctx.textAlign = 'center';
      ctx.fillText(poi.name, px, py - 9);
    }

    // Player marker (arrow with facing)
    const [px, py] = worldToCanvas(pm.x, pm.z, size);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-pm.yaw + Math.PI);
    ctx.fillStyle = '#1d3a5f';
    ctx.strokeStyle = '#e8cc6a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // The player's ship (caravel marker) — shown once launched
    if (pm.ship) {
      const [sx, sy] = worldToCanvas(pm.ship.x, pm.ship.z, size);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-pm.ship.heading);
      // Hull
      ctx.fillStyle = '#5c3f26';
      ctx.strokeStyle = '#e8cc6a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.quadraticCurveTo(5.5, -2, 4.5, 7);
      ctx.lineTo(-4.5, 7);
      ctx.quadraticCurveTo(-5.5, -2, 0, -9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Sail
      ctx.fillStyle = '#d8cdb4';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(3.4, 2);
      ctx.lineTo(-3.4, 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Compass rose
    ctx.fillStyle = '#2a2118';
    ctx.font = `${Math.max(12, size * 0.03)}px 'Cinzel', serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 22);
    ctx.beginPath();
    ctx.moveTo(size / 2, 26);
    ctx.lineTo(size / 2 - 4, 36);
    ctx.lineTo(size / 2 + 4, 36);
    ctx.closePath();
    ctx.fill();
  }, [tick, hoverPoi]);

  const hovered = POIS.find((p) => p.id === hoverPoi);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 p-6">
      <div className="kotfs-panel kotfs-panel-corner relative flex h-full w-full max-w-4xl flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kotfs-title text-lg tracking-[0.25em] text-[color:var(--kotfs-gold)]">
            CARTA DE NAVEGACIÓN — ALDMOR
          </h2>
          <button
            className="text-[color:var(--kotfs-parchment-dim)] transition hover:text-[color:var(--kotfs-parchment)]"
            onClick={() => {
              close();
              gameApi.clickResumeHint();
            }}
          >
            <X size={20} />
          </button>
        </div>
        <hr className="kotfs-hr mb-4" />

        <div ref={wrapRef} className="relative flex-1 border border-[color:rgba(201,162,39,0.3)] bg-[#c9bb9c]">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 m-auto cursor-crosshair"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = e.clientX - rect.left;
              const my = e.clientY - rect.top;
              const wx = (mx / rect.width) * MAP_WORLD - MAP_WORLD / 2;
              const wz = (my / rect.height) * MAP_WORLD - MAP_WORLD / 2;
              const near = POIS.find(
                (p) => Math.hypot(p.x - wx, p.z - wz) < 40,
              );
              setHoverPoi(near?.id ?? null);
            }}
          />
          {/* Corner flourishes */}
          <div className="pointer-events-none absolute inset-0"
            style={{
              boxShadow: 'inset 0 0 60px rgba(42,33,24,0.35)',
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs italic text-[color:var(--kotfs-parchment-dim)]">
            {hovered
              ? `${hovered.name} — ${hovered.journal.slice(0, 90)}…`
              : 'El mapa se revela a medida que exploras. Las zonas oscuras guardan secretos.'}
          </p>
          <p className="text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
            M / ESC PARA CERRAR
          </p>
        </div>
      </div>
    </div>
  );
}
