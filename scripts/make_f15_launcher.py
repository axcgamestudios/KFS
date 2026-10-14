#!/usr/bin/env python3
"""Genera el launcher E2E Fase 15 (patrón de fases anteriores):
un snippet JS pequeño que evalúa el payload y expone el log."""
import json

payload = open('/home/z/my-project/scripts/e2e_f15_payload.js', encoding='utf-8').read()
launcher = (
    'const __code = ' + json.dumps(payload) + ';\n'
    'window.__kotfsE2ELog = null;\n'
    'setTimeout(() => { eval(__code); }, 0);\n'
    '"kicked"\n'
)
open('/home/z/my-project/scripts/e2e_f15.js', 'w', encoding='utf-8').write(launcher)
print('launcher listo:', len(launcher), 'bytes')
