import * as THREE from 'three'

/**
 * Procedural facades.
 *
 * Every building is a box. This shader paints the box like a real building instead of adding
 * geometry: storeys of windows with frames and mullions, recessed reflective glass, a storefront
 * on the ground floor, pilasters, brickwork, a parapet band, grime near the ground and on the
 * roof, and (at night) a random share of lit windows, some with half-drawn blinds.
 *
 * Storeys are measured from the ground in world space, so a setback tier sitting on a lower
 * block continues its floors instead of starting a new storefront in mid-air.
 *
 * It works for instanced unit boxes (the background city, one `aFacade` attribute per instance)
 * and for plain boxes with their real size in the geometry (the experience buildings, configured
 * through uniforms). Both draw the same shader program.
 */

/** Facade types. Values are read by the shader; keep them in sync. */
export const FACADE_STYLE = {
  /** Offices and apartments: separate windows in a rendered wall, pilasters between bays. */
  punched: 0,
  /** Horizontal bands of glass running almost wall to wall. */
  ribbon: 1,
  /** Glass tower: the whole wall is glazing between thin mullions. */
  curtain: 2,
  /** Old brick walk-up: darker brick, smaller windows. */
  brick: 3,
} as const

export type FacadeStyle = (typeof FACADE_STYLE)[keyof typeof FACADE_STYLE]

/** Storey height of the background city. */
export const CITY_FLOOR_HEIGHT = 2.3
/** Wall height at the top of each building without windows. */
export const PARAPET_HEIGHT = 0.7

/**
 * Window bays across one face, laid out exactly as the shader lays them out: bays of about
 * `bayWidth` stretched to fill the face. Returns the centres, relative to the face centre.
 */
export function facadeBays(faceWidth: number, bayWidth: number): { centers: number[]; width: number } {
  const count = Math.max(Math.floor(faceWidth / bayWidth), 1)
  const width = faceWidth / count
  const centers = Array.from({ length: count }, (_, k) => -faceWidth / 2 + (k + 0.5) * width)
  return { centers, width }
}

export interface FacadeUniforms {
  /** Half size of a plain (non-instanced) box. Instanced boxes read it from the instance matrix. */
  uHalf: { value: THREE.Vector3 }
  /** Plain boxes only (instanced boxes use `aFacade`): storey height, bay width, style. */
  uFloorH: { value: number }
  uColW: { value: number }
  uStyle: { value: number }
  /** Share of windows that are lit (0 to 1). */
  uLitRatio: { value: number }
  /** Brightness of lit windows. */
  uLitStrength: { value: number }
  uLitColor: { value: THREE.Color }
  uGlassColor: { value: THREE.Color }
  /** Multiplier for the wall colour on window frames (above 1 = lighter frames). */
  uFrameTone: { value: number }
}

export function createFacadeUniforms(): FacadeUniforms {
  return {
    uHalf: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uFloorH: { value: CITY_FLOOR_HEIGHT },
    uColW: { value: 1.4 },
    uStyle: { value: FACADE_STYLE.punched },
    uLitRatio: { value: 0 },
    uLitStrength: { value: 0 },
    uLitColor: { value: new THREE.Color('#ffffff') },
    uGlassColor: { value: new THREE.Color('#050505') },
    uFrameTone: { value: 1 },
  }
}

/** Colours and lighting of the facades for each theme. Active = the building in focus. */
export function setFacadeTheme(u: FacadeUniforms, isLight: boolean, isActive = false): void {
  // Glass reflects a pale blue-grey sky by day; at night the lit rooms glow a soft warm white,
  // like tungsten and warm LED behind curtains.
  if (isLight) {
    u.uGlassColor.value.set(isActive ? '#9fb0bc' : '#66788a')
    u.uFrameTone.value = 0.78
    u.uLitRatio.value = isActive ? 1 : 0
    u.uLitStrength.value = isActive ? 0.35 : 0
    u.uLitColor.value.set('#fff1d8')
  } else {
    u.uGlassColor.value.set(isActive ? '#1a2029' : '#06080c')
    u.uFrameTone.value = 1.7
    u.uLitRatio.value = isActive ? 0.7 : 0.22
    u.uLitStrength.value = isActive ? 1.05 : 0.6
    u.uLitColor.value.set('#f6d6a2')
  }
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vFacadeLocal;
varying vec3 vFacadeHalf;
varying vec3 vFacadeNormal;
varying vec3 vFacadeCenter;
varying vec3 vFacadeParams;
uniform vec3 uHalf;
uniform float uFloorH;
uniform float uColW;
uniform float uStyle;
#ifdef USE_INSTANCING
attribute vec3 aFacade;
#endif
`

const VERTEX_BODY = /* glsl */ `
#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 facadeScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vFacadeLocal = position * facadeScale;
  vFacadeHalf = facadeScale * 0.5;
  vFacadeCenter = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFacadeParams = aFacade;
#else
  vFacadeLocal = position;
  vFacadeHalf = uHalf;
  vFacadeCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFacadeParams = vec3(uFloorH, uColW, uStyle);
#endif
vFacadeNormal = normal;
`

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vFacadeLocal;
varying vec3 vFacadeHalf;
varying vec3 vFacadeNormal;
varying vec3 vFacadeCenter;
varying vec3 vFacadeParams;
uniform float uLitRatio;
uniform float uLitStrength;
uniform vec3 uLitColor;
uniform vec3 uGlassColor;
uniform float uFrameTone;

float facadeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float facadeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(facadeHash(i), facadeHash(i + vec2(1.0, 0.0)), f.x),
             mix(facadeHash(i + vec2(0.0, 1.0)), facadeHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float band(float lo, float hi, float x, float aa) {
  return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x));
}

/** 1 on thin lines at every integer of x, anti-aliased; fades out once lines get sub-pixel. */
float gridLine(float x, float width) {
  float w = fwidth(x);
  float d = abs(fract(x + 0.5) - 0.5);
  float line = 1.0 - smoothstep(width - w, width + w, d);
  return line * (1.0 - smoothstep(width * 0.6, width * 1.6, w));
}
`

const FRAGMENT_MAP = /* glsl */ `
#include <map_fragment>
float facadeGlass = 0.0;
float facadeLit = 0.0;
// Less sky reaches the foot of a wall in a street canyon (what a baked GI pass would show).
float facadeAO = 1.0;
{
  vec3 n = normalize(vFacadeNormal);
  float seed = facadeHash(vFacadeCenter.xz);
  // Height above the ground (world space), and the top of this box.
  float y = vFacadeCenter.y + vFacadeLocal.y;
  float top = vFacadeCenter.y + vFacadeHalf.y;
  float style = vFacadeParams.z;

  if (abs(n.y) < 0.5) {
    bool facesZ = abs(n.z) > 0.5;
    float u = facesZ ? vFacadeLocal.x : vFacadeLocal.z;
    float halfW = facesZ ? vFacadeHalf.x : vFacadeHalf.z;

    float floorH = vFacadeParams.x;
    float cols = max(floor(2.0 * halfW / vFacadeParams.y), 1.0);
    float colW = 2.0 * halfW / cols;

    vec2 cell = vec2((u + halfW) / colW, y / floorH);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    vec2 aa = fwidth(cell) * 0.75 + 0.0005;

    // Window opening within one bay and storey, per style.
    float wx = 0.22;
    float wy0 = 0.3;
    float wy1 = 0.82;
    float mullionW = 0.012;
    if (style > 0.5 && style < 1.5) { wx = 0.03; wy0 = 0.3; wy1 = 0.8; }
    else if (style > 1.5 && style < 2.5) { wx = 0.012; wy0 = 0.035; wy1 = 0.975; mullionW = 0.0; }
    else if (style > 2.5) { wx = 0.3; wy0 = 0.34; wy1 = 0.8; }
    if (id.y < 0.5) {
      // Storefront: wide and tall glass on the ground floor.
      wx = 0.06;
      wy0 = 0.05;
      wy1 = 0.76;
    }

    // No windows in the parapet band at the top of the wall.
    float parapetH = style > 1.5 && style < 2.5 ? 0.25 : ${'${PARAPET}'};
    float belowParapet = 1.0 - smoothstep(top - parapetH - aa.y, top - parapetH + aa.y, y);

    float glass = band(wx, 1.0 - wx, f.x, aa.x) * band(wy0, wy1, f.y, aa.y) * belowParapet;
    float frameOuter = band(wx - 0.045, 1.0 - wx + 0.045, f.x, aa.x) * band(wy0 - 0.05, wy1 + 0.035, f.y, aa.y) * belowParapet;
    float mullion = mullionW > 0.0 ? (1.0 - smoothstep(mullionW, mullionW + aa.x * 2.0, abs(f.x - 0.5))) * glass : 0.0;
    glass -= mullion;
    float frame = clamp(frameOuter - glass, 0.0, 1.0);

    // Lit windows: a random share per bay, a random brightness, some blinds half drawn.
    float pick = facadeHash(id + vFacadeCenter.xz * 1.7 + (facesZ ? n.z : n.x) * 13.0);
    float litShare = style > 1.5 && style < 2.5 ? uLitRatio * 0.6 : uLitRatio;
    float lit = step(1.0 - litShare, pick) * mix(0.3, 1.0, facadeHash(id * 1.3 + seed));
    float blindLine = mix(wy1, wy0, facadeHash(id + 9.0) * 0.7);
    float blind = mix(0.35, 1.0, step(f.y, blindLine));
    facadeLit = glass * lit * blind;

    // Recess: the top of each opening sits in the shadow of the lintel.
    float recess = 1.0 - 0.55 * smoothstep(wy1 - 0.22, wy1, f.y) * glass;

    // Grime: darker near the ground and faint streaks running down the wall.
    float grime = 1.0 - 0.28 * (1.0 - smoothstep(0.0, 1.4, y));
    float streak = facadeHash(vec2(floor((u + halfW) * 2.5), seed * 31.0));
    grime *= 1.0 - 0.14 * streak * (1.0 - y / max(top, 0.001));

    // Render and concrete: large blotches plus fine grain, instead of a tiled texture.
    vec2 wp = vec2(u, y) + seed * 50.0;
    float wall = 0.86 + 0.1 * facadeNoise(wp * 0.6) + 0.06 * facadeNoise(wp * 7.0);

    if (style > 2.5) {
      // Brick: darker, with staggered mortar joints (they fade out in the distance).
      vec2 brick = vec2((u + halfW) * 4.0 + step(0.5, fract(y * 4.0)) * 0.5, y * 8.0);
      float mortar = max(gridLine(brick.x, 0.06), gridLine(brick.y, 0.08));
      wall *= 0.72 * (0.9 + 0.2 * facadeHash(floor(brick))) * (1.0 + 0.35 * mortar);
    } else if (style < 0.5 && id.y > 0.5) {
      // Pilasters: slightly proud strips between the bays catch a little more light.
      float pilaster = 1.0 - band(0.06, 0.94, f.x, aa.x);
      wall *= 1.0 + 0.08 * pilaster;
    }
    if (style > 1.5 && style < 2.5) {
      // Curtain wall: panels differ slightly in tint, like real insulated glass units.
      glass *= 1.0;
      frame = max(frame, (1.0 - band(0.0, 0.985, f.y, aa.y)) * belowParapet);
    }
    // Slab line between storeys.
    float slab = id.y > 0.5 ? (1.0 - smoothstep(0.0, aa.y * 2.0 + 0.015, f.y)) * belowParapet : 0.0;
    wall *= 1.0 - 0.25 * slab;

    float tint = style > 1.5 && style < 2.5 ? 0.8 + 0.4 * facadeHash(id + 3.7) : 1.0;
    diffuseColor.rgb *= mix(1.0, uFrameTone, frame) * grime * wall;
    diffuseColor.rgb = mix(diffuseColor.rgb, uGlassColor * recess * tint, glass);
    facadeGlass = glass;
    facadeAO = mix(0.42, 1.0, smoothstep(0.0, 11.0, y));
  } else if (n.y > 0.5) {
    // Roof: gravel tone and a lighter parapet coping along the edges.
    vec2 edge = vFacadeHalf.xz - abs(vFacadeLocal.xz);
    float coping = 1.0 - smoothstep(0.18, 0.22, min(edge.x, edge.y));
    float gravel = 0.72 + 0.12 * facadeHash(floor(vFacadeLocal.xz * 6.0) + seed);
    diffuseColor.rgb *= mix(gravel, 1.15, coping);
  }
}
`.replace('${PARAPET}', PARAPET_HEIGHT.toFixed(2))

const FRAGMENT_AO = /* glsl */ `
#include <aomap_fragment>
reflectedLight.indirectDiffuse *= facadeAO;
reflectedLight.indirectSpecular *= mix(1.0, facadeAO, 0.6);
reflectedLight.directDiffuse *= mix(1.0, facadeAO, 0.25);
`

const FRAGMENT_ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
// Slightly rough glass: still reflective, but a nearby light no longer burns a hard white spot.
roughnessFactor = mix(roughnessFactor, 0.16, facadeGlass);
`

const FRAGMENT_METALNESS = /* glsl */ `
#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.75, facadeGlass);
`

const FRAGMENT_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += uLitColor * facadeLit * uLitStrength;
`

/**
 * Turns a MeshStandardMaterial into a facade material. The uniforms are live: change their values
 * to restyle the building without a shader rebuild.
 */
export function applyFacade(material: THREE.MeshStandardMaterial, uniforms: FacadeUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', VERTEX_BODY)
    shader.fragmentShader =
      FRAGMENT_HEAD +
      shader.fragmentShader
        .replace('#include <map_fragment>', FRAGMENT_MAP)
        .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
        .replace('#include <metalnessmap_fragment>', FRAGMENT_METALNESS)
        .replace('#include <emissivemap_fragment>', FRAGMENT_EMISSIVE)
        .replace('#include <aomap_fragment>', FRAGMENT_AO)
  }
  // Same code for every facade material: one program per variant (instanced or not).
  material.customProgramCacheKey = () => 'facade-v4'
  material.needsUpdate = true
}
