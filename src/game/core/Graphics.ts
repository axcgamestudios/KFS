import type { QualityLevel } from './Engine';
import type { Settings } from '../systems/SaveSystem';

/**
 * Fase 13 — Ajustes gráficos individuales (estilo Minecraft).
 *
 * El jugador ya no elige solo un preset: cada característica pesada se puede
 * activar / desactivar en caliente (oleaje, sombras, luces realistas, pasto
 * 3D, reflejo del mar, efectos) y la distancia de renderizado se mide en
 * chunks de 64 m, igual que en Minecraft.
 */

/** Interruptores gráficos que el jugador controla uno a uno. */
export interface GraphicsSettings {
  /** Oleaje Gerstner del mar (apagado = mar espejo, las estelas siguen vivas). */
  waves: boolean;
  /** Sombras proyectadas (sol / luna). */
  shadows: boolean;
  /** Luces realistas: antorchas, farol, brasas de dragón, fuego dinámico. */
  realLights: boolean;
  /** Pasto 3D instanciado (briznas cercanas + mattas lejanas). */
  grass3d: boolean;
  /** Distancia de renderizado en chunks de 64 m (2 – 10). */
  renderChunks: number;
  /** Reflejo real del mar: 0 = apagado · 1 = baja (384², ⅓ de frames) · 2 = alta (512², ½ de frames). */
  reflections: 0 | 1 | 2;
  /** Cadena cinematográfica (bloom + MSAA). */
  postfx: boolean;
  /** Escala de resolución interna (0.5 – 1.5 ×). */
  resolution: number;
  /** Contador de FPS en el HUD. */
  showFps: boolean;
}

/** Lo que trae cada preset de calidad — el punto de partida, no una jaula:
 *  después el jugador puede retocar cada interruptor por separado. */
export const PRESET_GRAPHICS: Record<QualityLevel, GraphicsSettings> = {
  xlow: {
    waves: false, shadows: false, realLights: false, grass3d: false,
    renderChunks: 2, reflections: 0, postfx: false, resolution: 0.6, showFps: true,
  },
  low: {
    waves: true, shadows: false, realLights: true, grass3d: false,
    renderChunks: 4, reflections: 0, postfx: false, resolution: 0.75, showFps: true,
  },
  medium: {
    // Fase 14 — la reflexión planar re-renderiza la escena entera: en Media
    // se queda APAGADA (solo cielo procedural). High = baja, Ultra = alta.
    waves: true, shadows: true, realLights: true, grass3d: true,
    renderChunks: 5, reflections: 0, postfx: false, resolution: 1.0, showFps: true,
  },
  high: {
    waves: true, shadows: true, realLights: true, grass3d: true,
    renderChunks: 6, reflections: 1, postfx: false, resolution: 1.25, showFps: true,
  },
  ultra: {
    waves: true, shadows: true, realLights: true, grass3d: true,
    renderChunks: 7, reflections: 2, postfx: true, resolution: 1.5, showFps: true,
  },
};

/** Preset por defecto: Media — nada de "ultra y todo eso" de fábrica. */
export const DEFAULT_TIER: QualityLevel = 'medium';

/** Fase 14 — calidad de nubes del domo por escalón (ver SkySystem.uCloudQual):
 *  xlow sin nubes · baja/media la capa cúmulo (media con auto-sombra) ·
 *  alta añade las dos capas superiores · ultra todo. El pase de reflexión
 *  del mar SIEMPRE va sin nubes (el agua las distorsiona igual). */
export const CLOUD_QUAL: Record<QualityLevel, number> = {
  xlow: 0, low: 1, medium: 2, high: 3, ultra: 3,
};

/** Fase 14 — llamas transitorias simultáneas (aliento de dragón, impactos,
 *  fogonazos): cada una es un quad aditivo = un draw call transparente. */
export const FLAME_BUDGET: Record<QualityLevel, number> = {
  xlow: 16, low: 24, medium: 44, high: 90, ultra: 150,
};

/** Estado global de runtime que consultan los dueños de PointLights
 *  (VFX, antorchas, farol, caballeros, dragones) cada frame. */
export const gfxRuntime = {
  /** false → toda luz puntual se apaga (intensidad 0) al instante. */
  pointLights: true,
  /** Fase 16 — false when the player runs with waves OFF (low graphics /
   *  no swell): the interactive wake rings (player + boats) deform a FLAT
   *  sea into a glowing blob that reads like an ugly bloom. Gate on this. */
  waves: true,
};

/** Prefijo de ruta de assets — vacío en dev/sandbox, "/KFS" en GitHub Pages. */
export const ASSET_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '') as string;

/** Extrae los interruptores gráficos de un objeto Settings. */
export function graphicsOf(s: Settings): GraphicsSettings {
  return {
    waves: s.waves,
    shadows: s.shadows,
    realLights: s.realLights,
    grass3d: s.grass3d,
    renderChunks: s.renderChunks,
    reflections: s.reflections,
    postfx: s.postfx,
    resolution: s.resolution,
    showFps: s.showFps,
  };
}

/** Aplica un preset completo (botón de calidad) sobre unos Settings. */
export function applyPreset(s: Settings, preset: QualityLevel): Settings {
  return {
    ...s,
    quality: preset,
    tier: preset,
    ...PRESET_GRAPHICS[preset],
  };
}

/** Niebla adaptativa: al reducir la distancia de renderizado la niebla
 *  espesa para esconder el borde del mundo (como los chunks de Minecraft). */
export function fogMulForChunks(presetFog: number, chunks: number, presetChunks: number): number {
  const k = Math.max(0.6, Math.min(2.8, presetChunks / Math.max(2, chunks)));
  return presetFog * k;
}

/** Plano lejano de la cámara: suficiente para el domo del cielo (radio 1150)
 *  y para la distancia de renderizado elegida. */
export function cameraFarForChunks(chunks: number): number {
  return Math.max(1400, chunks * 64 * 2 + 500);
}

export const CHUNK_METERS = 64;
