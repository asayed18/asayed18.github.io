---
name: threejs-performance-checklist
description: Quick performance audit for this React Three Fiber/Vite site; use before shipping or when FPS/draw calls are a concern.
---

# Three.js Performance Checklist

## Quick pass
- Cap DPR: `Math.min(window.devicePixelRatio, 1.5)` (mobile often 1).
- Reuse geometries/materials; avoid per-frame allocations; memoize buffers/uniforms.
- Dispose: geometries, materials, render targets on unmount/scene swap; clean up event listeners.
- Lights/shadows: small shadow map sizes on low tier; limit shadow-casting objects; prefer `PCFSoftShadowMap` only when needed.
- Post-processing: minimal passes; SSAO/Bloom off for low tier; prefer lower sample counts.
- Animations: move heavy math off render loop or cache; avoid `setState` every frame—use refs.
- Textures: compress (KTX2), reduce resolution, power-of-two where possible; enable `generateMipmaps` only when useful.
- Models: DRACO-compress glTF; merge meshes/materials where reasonable; avoid large unlit vertex counts.

## Environment and fallbacks
- Feature-detect WebGL2; fallback to reduced quality if unavailable.
- Honor `prefers-reduced-motion` with slower/lighter animations or static mode.
- Clamp renderer size on very wide screens; throttle resize handlers.

## Verification
- Run: `npm run lint`, `npm run typecheck`, `npm run build` (or `npm run build:quick` for fast check).
- Profile: use browser devtools performance panel; watch JS heap growth and GPU frame time.
- Regression: verify loader URLs exist; snapshot camera/renderer defaults (fov, near/far, tonemapping).
