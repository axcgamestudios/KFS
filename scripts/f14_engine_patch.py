#!/usr/bin/env python3
"""Fase 14 — parchea Engine.ts: presets re-equilibrados + loop de sombras.
Reemplazos por línea exacta (los espacios del original no son consistentes).
"""
import re, sys

P = '/home/z/my-project/src/game/core/Engine.ts'
src = open(P, encoding='utf-8').read()

# --- 1) QUALITY_PRESETS: reemplazar las 5 líneas de escalones ---
NEW_PRESETS = {
    'xlow':   "  xlow:   { pixelRatioCap: 0.62, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 2, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 3.4, waterSegments: 80,  waveMotionRadius: 45,  waterRefl: 0, npcAnimDistance: 28, streamDistance: 0.45 },",
    'low':    "  low:    { pixelRatioCap: 0.75, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 4, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 1.7, waterSegments: 112, waveMotionRadius: 80,  waterRefl: 0, npcAnimDistance: 45, streamDistance: 0.7 },",
    'medium': "  medium: { pixelRatioCap: 1.0,  shadowMapSize: 1024, shadowsEnabled: true,  viewChunkRadius: 5, grassDensity: 0.26, anisotropy: 2, postfx: false, fogMul: 1.25, waterSegments: 152, waveMotionRadius: 95,  waterRefl: 0, npcAnimDistance: 55, streamDistance: 0.9 },",
    'high':   "  high:   { pixelRatioCap: 1.25, shadowMapSize: 2048, shadowsEnabled: true,  viewChunkRadius: 6, grassDensity: 0.65, anisotropy: 4, postfx: false, fogMul: 1.0, waterSegments: 208, waveMotionRadius: 130, waterRefl: 1, npcAnimDistance: 95, streamDistance: 1.0 },",
    'ultra':  "  ultra:  { pixelRatioCap: 1.5,  shadowMapSize: 4096, shadowsEnabled: true,  viewChunkRadius: 7, grassDensity: 1.0,  anisotropy: 8, postfx: true,  fogMul: 0.92, waterSegments: 280, waveMotionRadius: 160, waterRefl: 1, npcAnimDistance: 130, streamDistance: 1.0 },",
}
lines = src.split('\n')
count = 0
for i, ln in enumerate(lines):
    m = re.match(r"^  (xlow|low|medium|high|ultra):\s+\{ pixelRatioCap", ln)
    if m:
        lines[i] = NEW_PRESETS[m.group(1)]
        count += 1
assert count == 5, f'esperaba 5 líneas de preset, toqué {count}'
src = '\n'.join(lines)

# --- 2) campos de cadencia de sombras ---
src = src.replace(
    "  private clock = new THREE.Clock();\n  private updaters: Array<(dt: number, elapsed: number) => void> = [];\n  private running = false;\n  private frameHandle = 0;",
    "  private clock = new THREE.Clock();\n  private updaters: Array<(dt: number, elapsed: number) => void> = [];\n  private running = false;\n  private frameHandle = 0;\n  /** Fase 14 — sombras cada N frames (1 = cada frame). */\n  private shadowEvery = 1;\n  private frameIdx = 0;",
    1)

# --- 3) tipo de sombra PCF por defecto ---
src = src.replace(
    "    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;",
    "    // Fase 14 — PCF (no soft) salvo en high/ultra: el filtro soft son muchas\n    // más muestras de textura por píxel iluminado y en integradas duele.\n    this.renderer.shadowMap.type = THREE.PCFShadowMap;",
    1)

# --- 4) applyGraphics: sin suelo de densidad + cadencia + tipo de sombra ---
src = src.replace(
    "      grassDensity: gfx.grass3d ? Math.max(base.grassDensity, 0.4) : 0,",
    "      // Fase 14 — sin suelo de 0.4: la densidad de pasto es la del escalón.\n      grassDensity: gfx.grass3d ? base.grassDensity : 0,",
    1)

src = src.replace(
    "    const prevShadowSize = this.quality.shadowMapSize;\n    const base = QUALITY_PRESETS[tier];",
    "    const prevShadowSize = this.quality.shadowMapSize;\n    const prevShadowType = this.renderer.shadowMap.type;\n    const base = QUALITY_PRESETS[tier];",
    1)

src = src.replace(
    "    };\n    const pr = Math.min(window.devicePixelRatio, this.quality.pixelRatioCap);\n    this.renderer.setPixelRatio(pr);\n    this.renderer.shadowMap.enabled = this.quality.shadowsEnabled;\n    const shadowsToggled = prevShadows !== this.quality.shadowsEnabled;\n    const shadowSizeChanged = prevShadowSize !== this.quality.shadowMapSize;",
    "    };\n    // Fase 14 — cadencia + filtro de sombras por escalón\n    this.shadowEvery = this.quality.shadowsEnabled ? SHADOW_RATE_BY_TIER[tier] : 1;\n    const wantSoft = tier === 'high' || tier === 'ultra';\n    const shadowTypeChanged = prevShadowType !== (wantSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap);\n    this.renderer.shadowMap.type = wantSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;\n    this.renderer.shadowMap.autoUpdate = this.shadowEvery <= 1;\n    if (!this.renderer.shadowMap.autoUpdate) this.renderer.shadowMap.needsUpdate = true;\n    const pr = Math.min(window.devicePixelRatio, this.quality.pixelRatioCap);\n    this.renderer.setPixelRatio(pr);\n    this.renderer.shadowMap.enabled = this.quality.shadowsEnabled;\n    const shadowsToggled = prevShadows !== this.quality.shadowsEnabled;\n    const shadowSizeChanged = prevShadowSize !== this.quality.shadowMapSize;",
    1)

src = src.replace(
    "          // Shadow on/off & shadow map size require shader recompilation\n          if ((shadowsToggled || shadowSizeChanged) && m.type !== 'ShaderMaterial') {",
    "          // Shadow on/off, map size and filter type require shader recompilation\n          if ((shadowsToggled || shadowSizeChanged || shadowTypeChanged) && m.type !== 'ShaderMaterial') {",
    1)

# --- 5) loop: needsUpdate cada N frames ---
src = src.replace(
    "      for (const u of this.updaters) u(dt, elapsed);",
    "      for (const u of this.updaters) u(dt, elapsed);\n      // Fase 14 — cadencia de sombras: con autoUpdate apagado solo marcamos\n      // needsUpdate cada N frames (el sol no corre, nadie lo nota).\n      if (this.renderer.shadowMap.enabled && !this.renderer.shadowMap.autoUpdate) {\n        this.frameIdx++;\n        this.renderer.shadowMap.needsUpdate = this.frameIdx % this.shadowEvery === 0;\n      }",
    1)

open(P, 'w', encoding='utf-8').write(src)
print('Engine.ts OK')
