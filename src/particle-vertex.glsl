// Analytic particle trajectory computed on the GPU from the initial conditions
// and elapsed time. Force model: constant gravity g (along -Z, since the map's
// model space is Z-up) plus linear drag k. Closed form:
//   f = (1 - e^{-k t}) / k            (-> t as k -> 0)
//   xy = xy0 + v0.xy * f
//   z  = z0 + v0.z * f + (g/k)(f - t) (-> z0 + v0.z t - 1/2 g t^2 as k -> 0)
//
// ShaderMaterial injects position, projectionMatrix and modelViewMatrix, so they
// are not redeclared here.
precision highp float;

attribute vec3 aInitVel;
attribute vec4 aColSize; // rgb, size
attribute vec4 aPhys;    // g (downward accel), k (drag), birth, lifespan
attribute vec2 aTwink;   // twinkle speed, phase

uniform float uSizeScale;
uniform float uPixelRatio;
uniform float uTime;
uniform float uZoomFactor;    // 2^(zoom - 15): explicit zoom magnification
uniform float uRefDepth;      // view-space depth of the screen center
uniform float uDepthStrength; // 0 = uniform size, 1 = full perspective depth

varying vec3 vColor;
varying float vAlpha;

void main() {
    float birth = aPhys.z;
    float lifespan = aPhys.w;
    float age = uTime - birth;

    // Cull particles that have not been born yet or have already expired.
    if (age < 0.0 || age > lifespan) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        return;
    }

    float g = aPhys.x;
    float k = aPhys.y;
    vec3 p;

    if (k > 1e-4) {
        float f = (1.0 - exp(-k * age)) / k;
        p = position + aInitVel * f;
        p.z += (g / k) * (f - age);
    } else {
        p = position + aInitVel * age;
        p.z += -0.5 * g * age * age;
    }

    float lifeLeft = 1.0 - age / lifespan;
    float alpha = min(1.0, lifeLeft * 1.9);
    float sizeFade = 0.55 + 0.45 * lifeLeft;
    float twinkle = aTwink.x > 0.0 ?
        (0.2 + 0.8 * (0.5 + 0.5 * sin(uTime * aTwink.x + aTwink.y))) : 1.0;

    vColor = aColSize.rgb;
    vAlpha = alpha * twinkle;

    vec4 modelViewPosition = modelViewMatrix * vec4(p, 1.0);
    // Overall size scales with the zoom magnification (referenced at zoom 15);
    // the depth ratio (~1 at the screen center) adds the near-big/far-small cue.
    float viewDepth = max(1.0, -modelViewPosition.z);
    float depthFactor = clamp(mix(1.0, uRefDepth / viewDepth, uDepthStrength), 0.3, 3.0);
    gl_PointSize = aColSize.a * sizeFade * uSizeScale * uPixelRatio * uZoomFactor * depthFactor;
    gl_Position = projectionMatrix * modelViewPosition;
}
