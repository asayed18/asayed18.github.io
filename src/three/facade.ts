import * as THREE from 'three'

/**
 * Procedural facades.
 *
 * Every building is a box. This shader paints the box like a real building instead of adding
 * geometry: storeys of windows with frames and mullions, recessed reflective glass, a storefront
 * on the ground floor, pilasters, brickwork, a parapet band, grime near the ground and on the
 * roof. Each window is an opening with depth: the glazing sits behind the wall face, and behind
 * the glass a room is traced (walls, floor, ceiling, furniture outlines), with its own lamp
 * colour, curtains or blinds. At night a share of the rooms is lit.
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
  /** Daylight that reaches into the rooms behind the glass (0 at night). */
  uDaylight: { value: number }
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
    uDaylight: { value: 0 },
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
    u.uDaylight.value = 0.3
  } else {
    u.uGlassColor.value.set(isActive ? '#1a2029' : '#06080c')
    u.uFrameTone.value = 1.7
    u.uLitRatio.value = isActive ? 0.75 : 0.34
    u.uLitStrength.value = isActive ? 1.15 : 0.8
    // Near white: each room picks its own lamp colour in the shader.
    u.uLitColor.value.set('#fff0dc')
    u.uDaylight.value = 0.012
  }
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vFacadeLocal;
varying vec3 vFacadeHalf;
varying vec3 vFacadeNormal;
varying vec3 vFacadeCenter;
varying vec3 vFacadeParams;
varying vec3 vFacadeView;
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
  mat4 facadeWorld = modelMatrix * instanceMatrix;
#else
  vFacadeLocal = position;
  vFacadeHalf = uHalf;
  vFacadeCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFacadeParams = vec3(uFloorH, uColW, uStyle);
  mat4 facadeWorld = modelMatrix;
#endif
vFacadeNormal = normal;
// From the camera to this point, along the box's own axes: the windows use it to show depth.
vec3 facadeToPoint = (facadeWorld * vec4(transformed, 1.0)).xyz - cameraPosition;
vFacadeView = vec3(
  dot(facadeToPoint, normalize(facadeWorld[0].xyz)),
  dot(facadeToPoint, normalize(facadeWorld[1].xyz)),
  dot(facadeToPoint, normalize(facadeWorld[2].xyz)));
`

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vFacadeLocal;
varying vec3 vFacadeHalf;
varying vec3 vFacadeNormal;
varying vec3 vFacadeCenter;
varying vec3 vFacadeParams;
varying vec3 vFacadeView;
uniform float uLitRatio;
uniform float uLitStrength;
uniform vec3 uLitColor;
uniform vec3 uGlassColor;
uniform float uFrameTone;
uniform float uDaylight;

float facadeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 facadeHash3(vec2 p) {
  return fract(sin(vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)))) * 43758.5453);
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

/** A bar of half width hw centred on c. Thinner than a pixel, it fades instead of flickering. */
float facadeBar(float x, float c, float hw, float a) {
  return (1.0 - smoothstep(hw - a, hw + a, abs(x - c))) * min(1.0, hw / max(a, 1e-5));
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
vec3 facadeEmissive = vec3(0.0);
vec3 facadeTilt = vec3(0.0);
// 1 on glazing: the wall's own glow (the building in focus) must not wash over the windows.
float facadeWindow = 0.0;
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
    float faceId = facesZ ? n.z : n.x;

    float floorH = vFacadeParams.x;
    float cols = max(floor(2.0 * halfW / vFacadeParams.y), 1.0);
    float colW = 2.0 * halfW / cols;

    vec2 cell = vec2((u + halfW) / colW, y / floorH);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    vec2 aa = fwidth(cell) * 0.75 + 0.0005;

    bool isRibbon = style > 0.5 && style < 1.5;
    bool isCurtain = style > 1.5 && style < 2.5;
    bool isBrick = style > 2.5;
    bool isShop = id.y < 0.5;
    bool isOffice = isRibbon || isCurtain;

    // Window opening within one bay and storey, and how far the glazing sits behind the wall face.
    float wx = 0.22;
    float wy0 = 0.3;
    float wy1 = 0.82;
    float recessD = 0.16;
    if (isRibbon) { wx = 0.03; wy0 = 0.32; wy1 = 0.8; recessD = 0.09; }
    else if (isCurtain) { wx = 0.012; wy0 = 0.035; wy1 = 0.975; recessD = 0.03; }
    else if (isBrick) { wx = 0.3; wy0 = 0.34; wy1 = 0.8; recessD = 0.2; }
    if (isShop) {
      // Storefront: wide and tall glass on the ground floor, a sign fascia above it.
      wx = 0.06;
      wy0 = 0.06;
      wy1 = 0.74;
      recessD = 0.12;
    }

    // The view ray in the wall's own frame: along the wall, up, and into the wall.
    vec3 vdir = normalize(vFacadeView);
    float du = facesZ ? vdir.x : vdir.z;
    float dv = vdir.y;
    float facing = clamp(-dot(vdir, n), 0.0, 1.0);
    float dn = max(facing, 0.05);
    // Where the ray meets the glazing plane, in bay and storey units. The wall face and the glass
    // no longer line up when seen from the side: the difference is the reveal of the opening.
    vec2 g = f + vec2(du / colW, dv / floorH) * (recessD / dn);

    // No windows in the parapet band at the top of the wall.
    float parapetH = isCurtain ? 0.25 : ${'${PARAPET}'};
    float belowParapet = 1.0 - smoothstep(top - parapetH - aa.y, top - parapetH + aa.y, y);

    float openF = band(wx, 1.0 - wx, f.x, aa.x) * band(wy0, wy1, f.y, aa.y) * belowParapet;
    float openG = band(wx, 1.0 - wx, g.x, aa.x) * band(wy0, wy1, g.y, aa.y);
    float glazing = openF * openG;
    float reveal = openF * (1.0 - openG);
    float surround = band(wx - 0.045, 1.0 - wx + 0.045, f.x, aa.x) * band(wy0 - 0.02, wy1 + 0.04, f.y, aa.y) * belowParapet * (1.0 - openF);
    if (isCurtain) surround = max(surround, (1.0 - band(0.0, 0.985, f.y, aa.y)) * belowParapet);

    // Sill: a ledge under each window that catches the light, and its shadow on the wall below.
    float sill = 0.0;
    float sillShadow = 0.0;
    if (!isOffice && !isShop) {
      float across = band(wx - 0.07, 1.0 - wx + 0.07, f.x, aa.x) * belowParapet;
      sill = across * band(wy0 - 0.075, wy0 - 0.02, f.y, aa.y);
      sillShadow = across * band(wy0 - 0.2, wy0 - 0.075, f.y, aa.y) * smoothstep(wy0 - 0.2, wy0 - 0.075, f.y);
    }

    // Sash and glazing bars, in window coordinates (0 to 1 across the opening).
    vec2 wsize = vec2((1.0 - 2.0 * wx) * colW, (wy1 - wy0) * floorH);
    vec2 w = vec2((g.x - wx) / (1.0 - 2.0 * wx), (g.y - wy0) / (wy1 - wy0));
    vec2 waa = aa / vec2(1.0 - 2.0 * wx, wy1 - wy0);
    vec2 fb = vec2(isCurtain ? 0.03 : 0.055) / wsize;
    vec2 bw = vec2(0.03) / wsize;
    float pane = band(fb.x, 1.0 - fb.x, w.x, waa.x) * band(fb.y, 1.0 - fb.y, w.y, waa.y);
    // One window type per building: two leaves, leaves under a top light, a side light, one pane.
    float kind = facadeHash(vFacadeCenter.xz * 0.71 + 1.3);
    float bars = 0.0;
    if (isShop) {
      bars = facadeBar(w.y, 0.82, bw.y, waa.y);
    } else if (isRibbon) {
      bars = facadeBar(w.x, 0.5, bw.x, waa.x);
    } else if (isBrick) {
      // Sash window: a meeting rail, and glazing bars on the older ones.
      bars = facadeBar(w.y, 0.5, bw.y * 1.3, waa.y);
      if (kind > 0.4) bars = max(bars, facadeBar(w.x, 0.5, bw.x * 0.7, waa.x));
      if (kind > 0.75) bars = max(bars, max(facadeBar(w.y, 0.25, bw.y * 0.6, waa.y), facadeBar(w.y, 0.75, bw.y * 0.6, waa.y)));
    } else if (!isCurtain) {
      if (kind < 0.35) bars = facadeBar(w.x, 0.5, bw.x, waa.x);
      else if (kind < 0.65) bars = max(facadeBar(w.y, 0.72, bw.y, waa.y), facadeBar(w.x, 0.5, bw.x, waa.x) * (1.0 - smoothstep(0.72 - waa.y, 0.72 + waa.y, w.y)));
      else if (kind < 0.85) bars = facadeBar(w.x, 0.34, bw.x, waa.x);
    }
    // Curtain walls hide each floor slab behind an opaque spandrel panel.
    float spandrel = isCurtain && !isShop ? 1.0 - smoothstep(0.23 - aa.y, 0.23 + aa.y, g.y) : 0.0;
    float clear = pane * (1.0 - bars);
    float glass = glazing * clear * (1.0 - spandrel);
    float spandrelMask = glazing * clear * spandrel;
    float sash = glazing * (1.0 - clear);
    float frameKind = facadeHash(vFacadeCenter.xz * 1.37 + 8.1);
    vec3 sashColor = isOffice || isShop
      ? (frameKind < 0.6 ? vec3(0.13, 0.14, 0.16) : vec3(0.5, 0.52, 0.54))
      : (frameKind < 0.5 ? vec3(0.84, 0.84, 0.82) : frameKind < 0.8 ? vec3(0.15, 0.16, 0.18) : vec3(0.36, 0.25, 0.17));

    // The room behind the glass. Offices are open plan over several bays, flats have one room
    // per one or two windows, shops run over two bays.
    float span = isShop ? 2.0 : isOffice ? 3.0 + floor(facadeHash(vec2(seed * 7.0, id.y)) * 3.0) : 1.0 + step(0.55, facadeHash(vec2(seed * 3.0, faceId)));
    float roomIdx = floor(id.x / span);
    vec2 roomKey = vec2(roomIdx, id.y) + vFacadeCenter.xz * 1.7 + faceId * 13.0;
    vec3 rh = facadeHash3(roomKey);
    vec3 rh2 = facadeHash3(roomKey + 17.3);
    float W = span * colW;
    float H = (isCurtain ? 0.985 : 0.93) * floorH;
    float D = isShop ? 5.0 : isOffice ? 7.0 : 3.4 + rh2.x * 1.4;

    // Who has the light on. Offices go dark floor by floor, with a few floors still working.
    float floorBias = isShop ? 1.9 : isOffice ? (facadeHash(vec2(id.y, seed * 91.0)) > 0.72 ? 2.6 : 0.5) : 1.0;
    float on = step(1.0 - clamp(uLitRatio * floorBias, 0.0, 1.0), rh.x);
    float bright = mix(0.6, 1.25, rh2.x);
    // Lamp colour: warm bulbs at home, with some neutral and a few cold ones; whiter in offices.
    vec3 temp = isOffice
      ? mix(vec3(1.0, 0.95, 0.85), vec3(0.86, 0.93, 1.0), step(0.4, rh.z))
      : isShop ? mix(vec3(1.0, 0.9, 0.74), vec3(0.92, 0.96, 1.0), step(0.6, rh.z))
      : rh.z < 0.6 ? vec3(1.0, 0.74, 0.46) : rh.z < 0.9 ? vec3(1.0, 0.86, 0.66) : vec3(0.9, 0.95, 1.0);
    vec3 paint = isOffice ? vec3(0.8, 0.8, 0.78)
      : isShop ? vec3(0.86, 0.84, 0.8)
      : rh2.y < 0.5 ? vec3(0.86, 0.82, 0.74) : rh2.y < 0.7 ? vec3(0.7, 0.76, 0.8) : rh2.y < 0.85 ? vec3(0.74, 0.78, 0.68) : vec3(0.8, 0.62, 0.5);

    // Far away a window is a few pixels. Detail smaller than a pixel flickers as the camera moves
    // (and bloom turns each bright speck into a flash), so it fades to the room's average early.
    float lod = smoothstep(0.035, 0.14, max(aa.x, aa.y));

    // Follow the ray to the first wall, floor or ceiling of that room.
    vec3 ro = vec3((id.x + g.x - roomIdx * span) * colW, g.y * floorH, 0.0);
    float tx = abs(du) > 1e-4 ? (du > 0.0 ? W - ro.x : -ro.x) / du : 1e5;
    float ty = abs(dv) > 1e-4 ? (dv > 0.0 ? H - ro.y : -ro.y) / dv : 1e5;
    float tz = D / dn;
    vec3 hit = ro + vec3(du, dv, dn) * min(tz, min(tx, ty));
    bool hitBack = tz <= min(tx, ty);
    bool hitSide = !hitBack && tx < ty;
    bool hitCeil = !hitBack && !hitSide && dv > 0.0;

    vec3 albedo = paint;
    if (hitBack) {
      vec2 bp = vec2(hit.x / W, hit.y / H);
      if (isShop) {
        // Shelves of goods.
        vec3 goods = facadeHash3(floor(vec2(hit.x * 2.6, hit.y * 3.2)) + roomKey);
        float shelf = step(0.16, fract(hit.y * 3.2)) * step(hit.y, H * 0.82);
        albedo = mix(paint, 0.3 + 0.6 * goods, 0.7 * shelf);
      } else if (isOffice) {
        // Partition with doors, and desks with screens in front of it.
        albedo *= 1.0 - 0.3 * step(0.84, fract(hit.x / 1.5 + rh2.z));
        float deskTop = 0.3 + 0.16 * facadeHash(vec2(floor(hit.x / 0.8), roomKey.x));
        albedo = mix(albedo, vec3(0.14, 0.15, 0.17), step(bp.y, deskTop) * 0.85);
      } else {
        // A cupboard or bookcase, a picture, and the outline of furniture.
        float x0 = 0.08 + rh2.z * 0.5;
        float shelf = band(x0, x0 + 0.3, bp.x, 0.01) * step(bp.y, 0.74);
        albedo = mix(albedo, vec3(0.3, 0.22, 0.16) * (1.0 - 0.35 * step(0.78, fract(bp.y * 5.5))), shelf * 0.9);
        float px = x0 > 0.33 ? 0.08 : 0.66;
        float picture = band(px, px + 0.2, bp.x, 0.01) * band(0.5, 0.74, bp.y, 0.01);
        albedo = mix(albedo, 0.25 + 0.5 * facadeHash3(roomKey + 3.1), picture);
        float sofa = 0.2 + 0.12 * facadeHash(vec2(floor(hit.x / 0.9), roomKey.y));
        albedo = mix(albedo, paint * 0.3, step(bp.y, sofa) * (1.0 - shelf) * 0.8);
      }
    } else if (hitSide) {
      albedo = paint * 0.94;
    } else if (hitCeil) {
      albedo = vec3(0.9);
    } else {
      albedo = isOffice ? vec3(0.3, 0.32, 0.36) : isShop ? vec3(0.5, 0.48, 0.45) : vec3(0.42, 0.3, 0.2);
    }

    // What lights the room: ceiling panels, a pendant, a single lamp, or a television.
    vec3 lightTerm;
    vec3 modeColor = vec3(1.0);
    float modeMean = 0.8;
    if (isOffice || isShop) {
      float panels = hitCeil ? band(0.2, 0.8, fract(hit.x / 1.3), 0.04) * band(0.12, 0.88, fract(hit.z / 1.7), 0.04) : 0.0;
      lightTerm = vec3(0.75 + 2.0 * panels * (1.0 - lod)) * (0.6 + 0.4 * exp(-hit.z * 0.12));
    } else {
      vec3 toMain = hit - vec3(W * 0.5, H - 0.3, D * 0.5);
      vec3 toLamp = hit - vec3(W * (0.2 + 0.6 * rh2.z), 0.95, D * 0.8);
      vec3 toTv = hit - vec3(W * 0.5, 0.7, D * 0.25);
      float mainL = 1.9 / (1.0 + dot(toMain, toMain) * 0.3);
      float lampL = 1.6 / (1.0 + dot(toLamp, toLamp) * 1.4);
      if (rh.y < 0.55) {
        lightTerm = vec3(0.3 + mainL);
      } else if (rh.y < 0.8) {
        modeColor = vec3(1.0, 0.72, 0.44);
        modeMean = 0.32;
        lightTerm = modeColor * (0.06 + lampL);
      } else if (rh.y < 0.9) {
        modeColor = vec3(0.5, 0.66, 1.0);
        modeMean = 0.24;
        lightTerm = modeColor * (0.05 + 0.9 / (1.0 + dot(toTv, toTv) * 0.6));
      } else {
        modeMean = 0.95;
        lightTerm = vec3(0.3 + mainL) + vec3(1.0, 0.72, 0.44) * lampL;
      }
    }
    vec3 lamp = temp * uLitColor * (uLitStrength * on * bright);
    // Daylight reaches a few metres into the room and fades towards the back.
    vec3 dayIn = uDaylight * vec3(0.92, 0.96, 1.0) * (0.15 + 0.85 * exp(-hit.z * 0.55));
    vec3 interior = albedo * (lightTerm * lamp + dayIn);
    vec3 roomGlow = paint * modeColor * lamp * modeMean;
    interior = mix(interior, roomGlow + paint * uDaylight * 0.4, lod);

    // Curtains and blinds, at the glass. They hide the room and glow when it is lit.
    vec3 ch = facadeHash3(id + roomKey.yx * 0.37 + 5.1);
    float cover = 0.0;
    float trans = 0.3;
    vec3 fabric = vec3(0.84, 0.82, 0.77);
    if (isOffice) {
      // Roller blinds, each pulled down to its own height.
      float drop = ch.x < 0.5 ? 0.0 : mix(0.15, 0.8, ch.y);
      cover = smoothstep(1.0 - drop - waa.y, 1.0 - drop + waa.y, w.y) * step(0.001, drop);
      fabric = vec3(0.78, 0.78, 0.76);
      trans = 0.2;
    } else if (!isShop) {
      if (ch.x > 0.25 && ch.x < 0.55) {
        // Drapes pulled to the sides.
        float left = 0.08 + 0.25 * ch.y;
        float right = 0.08 + 0.25 * ch.z;
        cover = max(1.0 - smoothstep(left - waa.x, left + waa.x, w.x), smoothstep(1.0 - right - waa.x, 1.0 - right + waa.x, w.x));
        float folds = 0.76 + 0.24 * sin(w.x * wsize.x * 42.0) * (1.0 - lod);
        fabric = (rh2.y < 0.4 ? vec3(0.8, 0.74, 0.62) : rh2.y < 0.7 ? vec3(0.55, 0.36, 0.3) : vec3(0.4, 0.46, 0.52)) * folds;
        trans = 0.16;
      } else if (ch.x >= 0.55 && ch.x < 0.78) {
        // Net curtain across the whole window.
        cover = 0.7;
        fabric = vec3(0.9, 0.89, 0.86) * (0.88 + 0.12 * sin(w.x * wsize.x * 30.0) * (1.0 - lod));
        trans = 0.6;
      } else if (ch.x >= 0.78) {
        // Roller blind.
        float drop = mix(0.25, 1.0, ch.y);
        cover = smoothstep(1.0 - drop - waa.y, 1.0 - drop + waa.y, w.y);
        fabric = vec3(0.86, 0.82, 0.72);
        trans = 0.3;
      }
    }

    // Shop sign: a coloured fascia above the window with a lighter block of lettering.
    float shopU = (id.x - roomIdx * span + f.x) / span;
    float fascia = isShop ? band(0.8, 0.95, f.y, aa.y) : 0.0;
    vec3 fasciaColor = rh2.y < 0.25 ? vec3(0.12, 0.2, 0.16) : rh2.y < 0.45 ? vec3(0.33, 0.1, 0.1) : rh2.y < 0.65 ? vec3(0.1, 0.13, 0.22) : rh2.y < 0.85 ? vec3(0.13, 0.13, 0.14) : vec3(0.78, 0.72, 0.6);
    float letters = fascia * band(0.845, 0.905, f.y, aa.y) * band(0.25, 0.75, shopU, aa.x / span)
      * step(0.3, facadeHash(vec2(floor(shopU * 26.0), roomKey.x))) * (1.0 - lod);
    vec3 signInk = rh2.y < 0.85 ? vec3(0.9, 0.86, 0.74) : vec3(0.2, 0.18, 0.16);

    // Grime: darker near the ground and faint streaks running down the wall.
    float grime = 1.0 - 0.28 * (1.0 - smoothstep(0.0, 1.4, y));
    float streak = facadeHash(vec2(floor((u + halfW) * 2.5), seed * 31.0));
    grime *= 1.0 - 0.14 * streak * (1.0 - y / max(top, 0.001));

    // Render and concrete: large blotches plus fine grain, instead of a tiled texture.
    vec2 wp = vec2(u, y) + seed * 50.0;
    float wall = 0.86 + 0.1 * facadeNoise(wp * 0.6) + 0.06 * facadeNoise(wp * 7.0);

    if (isBrick) {
      // Brick: darker, with staggered mortar joints (they fade out in the distance).
      vec2 brick = vec2((u + halfW) * 4.0 + step(0.5, fract(y * 4.0)) * 0.5, y * 8.0);
      float mortar = max(gridLine(brick.x, 0.06), gridLine(brick.y, 0.08));
      wall *= 0.72 * (0.9 + 0.2 * facadeHash(floor(brick))) * (1.0 + 0.35 * mortar);
    } else if (style < 0.5 && !isShop) {
      // Pilasters: slightly proud strips between the bays catch a little more light.
      float pilaster = 1.0 - band(0.06, 0.94, f.x, aa.x);
      wall *= 1.0 + 0.08 * pilaster;
    }
    // Slab line between storeys.
    float slab = id.y > 0.5 ? (1.0 - smoothstep(0.0, aa.y * 2.0 + 0.015, f.y)) * belowParapet : 0.0;
    wall *= 1.0 - 0.25 * slab;

    // Recess: the top of each opening sits in the shadow of the lintel.
    float recess = 1.0 - 0.5 * smoothstep(0.7, 1.0, w.y);
    // Curtain wall panels differ slightly in tint, like real insulated glass units.
    float tint = isCurtain ? 0.8 + 0.4 * facadeHash(id + 3.7) : 1.0;

    vec3 wallColor = diffuseColor.rgb * grime * wall;
    vec3 col = wallColor * mix(1.0, isBrick ? mix(1.0, uFrameTone, 0.45) : uFrameTone, surround);
    col *= mix(1.0, 1.22, sill) * (1.0 - 0.32 * sillShadow);
    col = mix(col, mix(fasciaColor, signInk, letters), fascia);
    // Reveal: the sill side faces the sky, the lintel side faces the ground.
    float revealTone = g.y < wy0 ? 1.12 : g.y > wy1 ? 0.45 : 0.68;
    col = mix(col, wallColor * revealTone, reveal);
    col = mix(col, sashColor * recess * 0.85, sash);
    // Fabric sits behind the glass and inside the room: it gets far less light than the wall.
    vec3 glassColor = mix(uGlassColor * recess * tint, fabric * (0.3 + uDaylight), cover * 0.85);
    col = mix(col, glassColor, glass);
    col = mix(col, uGlassColor * 0.55 * tint, spandrelMask);
    diffuseColor.rgb = col;

    // Glass reflects more and shows less of the room at a shallow angle.
    float see = 1.0 - 0.85 * (0.04 + 0.96 * pow(1.0 - facing, 5.0));
    facadeEmissive = mix(interior, fabric * roomGlow * trans, cover) * see * glass;
    // A lit room also lights the reveal of its window and the shop sign above it.
    facadeEmissive += wallColor * roomGlow * 0.14 * reveal;
    // ...and spills a little onto the wall around the opening.
    vec2 away = max(max(vec2(wx, wy0) - f, f - vec2(1.0 - wx, wy1)), 0.0) * vec2(colW, floorH);
    facadeEmissive += wallColor * roomGlow * (1.0 - 0.6 * cover) * 0.09 * exp(-length(away) * 3.5) * (1.0 - openF) * belowParapet;
    facadeEmissive += mix(fasciaColor * 0.25, signInk, letters) * lamp * 0.45 * fascia;

    facadeGlass = glass * (1.0 - 0.75 * cover) + spandrelMask;
    facadeWindow = glazing;
    // Panes are never perfectly flat: each one reflects a slightly different part of the sky.
    facadeTilt = (facadeHash3(id + seed * 23.0) - 0.5) * 0.045;
    facadeAO = mix(0.42, 1.0, smoothstep(0.0, 11.0, y));
  } else if (n.y > 0.5) {
    // Roof: gravel tone and a lighter parapet coping along the edges.
    vec2 edge = vFacadeHalf.xz - abs(vFacadeLocal.xz);
    float coping = 1.0 - smoothstep(0.18, 0.22, min(edge.x, edge.y));
    float gravel = 0.72 + 0.12 * facadeHash(floor(vFacadeLocal.xz * 6.0) + seed);
    // Roofs differ from one building to the next: pale gravel, grey bitumen felt, dark membrane,
    // with patches of weathering, instead of one sand-coloured slab per block.
    float roofKind = facadeHash(vFacadeCenter.xz * 0.37 + 4.2);
    vec3 roofBase = roofKind < 0.3 ? vec3(0.34, 0.35, 0.37) : roofKind < 0.55 ? vec3(0.5, 0.49, 0.47) : roofKind < 0.7 ? vec3(0.42, 0.33, 0.29) : diffuseColor.rgb;
    float patches = 0.82 + 0.3 * facadeNoise(vFacadeLocal.xz * 0.45 + seed * 40.0);
    vec3 roofColor = mix(roofBase, diffuseColor.rgb, roofKind < 0.7 ? 0.25 : 1.0) * gravel * patches;
    diffuseColor.rgb = mix(roofColor, diffuseColor.rgb * 1.15, coping);
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

const FRAGMENT_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
normal = normalize(normal + facadeTilt * facadeGlass);
`

const FRAGMENT_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance = totalEmissiveRadiance * (1.0 - facadeWindow) + facadeEmissive;
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
        .replace('#include <normal_fragment_maps>', FRAGMENT_NORMAL)
        .replace('#include <emissivemap_fragment>', FRAGMENT_EMISSIVE)
        .replace('#include <aomap_fragment>', FRAGMENT_AO)
  }
  // Same code for every facade material: one program per variant (instanced or not).
  material.customProgramCacheKey = () => 'facade-v7'
  material.needsUpdate = true
}
