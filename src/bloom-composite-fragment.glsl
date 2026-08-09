// Additively composites the particle scene plus its blurred bloom over the map.
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float strength;

varying vec2 vUv;

void main() {
    vec3 base = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    gl_FragColor = vec4(base + bloom * strength, 1.0);
}
