// Bright pass: keeps only the parts of the scene above the bloom threshold.
uniform sampler2D tDiffuse;
uniform float threshold;

varying vec2 vUv;

void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = max(max(c.r, c.g), c.b);
    float k = max(0.0, l - threshold) / max(l, 1e-4);
    gl_FragColor = vec4(c * k, 1.0);
}
