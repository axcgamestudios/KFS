'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Game } from '@/game/Game';
import LoadingScreen from './LoadingScreen';
import MainMenu from './MainMenu';
import IntroCinematic from './IntroCinematic';
import EndingOverlay from './EndingOverlay';
import CinematicOverlay from './CinematicOverlay';
import HUD from './HUD';
import AdminPanel from './AdminPanel';
import DialogueBox from './DialogueBox';
import InventoryUI from './InventoryUI';
import ShopUI from './ShopUI';
import NegotiationUI from './NegotiationUI';
import ForgeUI from './ForgeUI';
import AlchemyUI from './AlchemyUI';
import MapUI from './MapUI';
import JournalUI from './JournalUI';
import SkillsUI from './SkillsUI';
import PauseMenu from './PauseMenu';
import SettingsPanel from './SettingsPanel';

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [booted, setBooted] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const phase = useGameStore((s) => s.phase);
  const overlay = useGameStore((s) => s.overlay);

  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;
    let disposed = false;

    const boot = async () => {
      try {
        const game = new Game(canvasRef.current!);
        gameRef.current = game;
        // Fase 13 — asa de depuración para las sondas E2E (solo lectura:
        // permite verificar uniforms/calidad en caliente desde el navegador).
        (window as unknown as { __kfs?: Game }).__kfs = game;
        await game.boot();
        if (!disposed) setBooted(true);
      } catch (err) {
        console.error('Error al iniciar el juego:', err);
        if (!disposed) {
          setFatalError(
            'Could not initialize the 3D world. Check that your browser supports WebGL and reload the page.',
          );
        }
      }
    };

    void boot();

    return () => {
      disposed = true;
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="kotfs-root fixed inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Cinematic vignette over the 3D world */}
      <div className="kotfs-vignette z-10" />

      {/* Phase-driven UI */}
      {fatalError ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-8">
          <div className="kotfs-panel kotfs-panel-corner max-w-lg p-8 text-center">
            <h2 className="kotfs-title mb-4 text-2xl text-[color:var(--kotfs-gold)]">
              The Tide Could Not Rise
            </h2>
            <p className="mb-6 leading-relaxed text-[color:var(--kotfs-parchment-dim)]">{fatalError}</p>
            <button className="kotfs-btn" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </div>
        </div>
      ) : !booted ? (
        <LoadingScreen />
      ) : (
        <>
          {phase === 'menu' && <MainMenu />}
          {phase === 'menu' && overlay === 'settings' && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
              <div className="kotfs-panel kotfs-panel-corner flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden p-6">
                <div className="kotfs-scroll min-h-0 flex-1 overflow-y-auto pr-2">
                  <SettingsPanel
                    onBack={() => useGameStore.getState().closeOverlay()}
                  />
                </div>
              </div>
            </div>
          )}
          {phase === 'intro' && <IntroCinematic />}
          <EndingOverlay />
          <CinematicOverlay />
          {(phase === 'playing' || phase === 'paused') && (
            <>
              <HUD />
              <AdminPanel />
              <DialogueBox />
              <ShopUI />
              <NegotiationUI />
              <ForgeUI />
              <AlchemyUI />
              {overlay === 'inventory' && <InventoryUI />}
              {overlay === 'map' && <MapUI />}
              {overlay === 'journal' && <JournalUI />}
              {overlay === 'skills' && <SkillsUI />}
              {phase === 'paused' && overlay === null && <PauseMenu />}
              {overlay === 'settings' && phase === 'paused' && <PauseMenu initialTab="ajustes" />}
              {overlay === 'saves' && phase === 'paused' && <PauseMenu initialTab="guardar" />}
            </>
          )}
        </>
      )}
    </div>
  );
}
