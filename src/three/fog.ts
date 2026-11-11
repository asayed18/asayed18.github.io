import * as THREE from 'three'

/**
 * Atmosphere for every material in the scene, installed once before the first shader compiles.
 *
 * three.js' exponential fog depends on the distance from the camera only. On top of it this adds
 * ground mist: haze that is thicker near the ground and thins out with height, so streets far
 * ahead sink into a soft veil while rooftops and towers rise out of it, as on a humid evening.
 *
 * A material can see through the haze more easily by defining FOG_SCALE below 1 (the
 * landmarks use it so they stay half-visible far away).
 */
/** Colour of the haze at the horizon; the sky fades into the same colour as the fog. */
export const SKY_HAZE = { light: '#e2ded6', dark: '#18223a' }

let installed = false

export function installAtmosphere(): void {
  if (installed) return
  installed = true

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
#endif
`
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWorld = instanceMatrix * fogWorld;
  #endif
  vFogHeight = ( modelMatrix * fogWorld ).y;
#endif
`
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifndef FOG_SCALE
    #define FOG_SCALE 1.0
  #endif
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogD = vFogDepth * FOG_SCALE;
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogD * fogD );
    // Ground mist: grows with distance, fades out over the first few storeys.
    float mist = ( 1.0 - exp( - fogD * fogDensity * 3.2 ) ) * exp( - max( vFogHeight, 0.0 ) / 6.5 ) * 0.85;
    fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - mist );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, fogD );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`
}
