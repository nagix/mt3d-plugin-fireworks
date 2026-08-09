precision mediump float;

uniform sampler2D uTexture;
uniform float uIntensity;

varying vec3 vColor;
varying float vAlpha;

void main() {
    vec4 tex = texture2D(uTexture, gl_PointCoord);
    float a = tex.a;
    // Push the very core of the sprite towards white for a hot center.
    vec3 col = mix(vColor, vec3(1.0), pow(a, 4.0) * 0.6);
    gl_FragColor = vec4(col, 1.0) * a * vAlpha * uIntensity;
}
