// Full-screen quad vertex shader shared by every bloom pass: it forwards the UV
// and positions the quad so it covers the whole render target.
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
