---
name: threejs-scene-setup
description: Conventions for initializing renderer/camera/controls in this React Three Fiber/Vite project; use when creating or refactoring scene setup.
---

# Three.js Scene Setup

## Initialization
- Renderer: set `antialias` true only for medium/high tiers; clamp DPR; enable shadows conditionally; set tone mapping/exposure explicitly.
- Camera: document fov/near/far; set aspect from container; update on resize; start at sensible z and lookAt targets.
- Controls: prefer `OrbitControls`/`PointerLockControls` as needed; limit maxDistance, polar angles; disable damping for low tier if perf-bound.

## Resize and DPR
- Use a dedicated hook to handle resize: update renderer size, camera aspect/projection, and pixel ratio cap.
- Throttle resize handlers; avoid layout thrash by reading sizes once per frame.

## Resource management
- Reuse geometries/materials; memoize loaders; share environments/HDRIs where possible.
- Dispose on unmount: renderer targets, geometries, materials, textures; remove event listeners.
- Keep render-loop work minimal; avoid state updates per frame—use refs for mutable frame data.

## Scene hygiene
- Group scene graph logically (lighting, environment, characters, props).
- Use layers or visibility toggles for debug-only helpers; gate debug UI behind env flag.
- Document uniforms and shader params near definitions; avoid magic numbers.
