// Separable Gaussian blur (5-tap) applied along `dir`, one axis per pass.
uniform sampler2D tDiffuse;
uniform vec2 dir;

varying vec2 vUv;

void main() {
    vec3 s = vec3(0.0);
    s += texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    s += texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb * 0.3162162162;
    s += texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb * 0.3162162162;
    s += texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb * 0.0702702703;
    s += texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(s, 1.0);
}
