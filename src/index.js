import {Marker, THREE} from 'mini-tokyo-3d';
import particleVertexShader from './particle-vertex.glsl';
import particleFragmentShader from './particle-fragment.glsl';
import bloomVertexShader from './bloom-vertex.glsl';
import bloomBrightFragmentShader from './bloom-bright-fragment.glsl';
import bloomBlurFragmentShader from './bloom-blur-fragment.glsl';
import bloomCompositeFragmentShader from './bloom-composite-fragment.glsl';
import fireworksSVG from './fireworks.svg';
import './fireworks.css';

// Fireworks event URL
const FIRWORKS_URL = 'https://mini-tokyo.appspot.com/fireworks';

// Data refresh interval (5 minutes)
const DATA_INTERVAL = 300000;

// Activity refresh interval (1 minute)
const ACTIVITY_INTERVAL = 60000;

// Fireworks refresh interval (100 msecs)
const FIREWORKS_INTERVAL = 100;

const {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    DynamicDrawUsage,
    LinearFilter,
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Points,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    Sphere,
    Vector2,
    Vector3,
    WebGLRenderTarget
} = THREE;

// Maximum number of live particles in the shared pool.
const MAX = 150000;

// Maximum number of shells rising at once per event (limits burst density). TUNE.
const MAX_SHELLS_PER_EVENT = 3;

// Reference gravity (world units / s^2) for the analytic trajectory.
const G = 22;

// Base size of one demo "world unit" (shell speeds ~100, burst sizes ~3-4), in
// meters at zoom 16. The apparent size is held constant across zoom 14-16 and
// scales with the true magnification outside that range. TUNE on device.
const REF_TO_MODEL = 1;

// Multiplier applied only to burst particle velocities, so the burst diameter can
// be tuned independently of the launch altitude (which is set by the shell). TUNE.
const BURST_SPREAD = 1.8;

// Screen-space size of a point sprite at the screen center for zoom 14-16
// (roughly pixels); scales with the magnification outside that range. TUNE on device.
const SIZE_SCALE = 6;

// Perspective depth of the sprites: 0 = uniform size, 1 = full near-big/far-small.
const DEPTH_STRENGTH = 1;

// Overall particle brightness.
const INTENSITY = 1.5;

// Bloom tuning. Lower threshold = more of the particle light blooms; higher
// strength = brighter glow; larger radius = wider halo. TUNE on device.
const BLOOM_THRESHOLD = 0.05;
const BLOOM_STRENGTH = 2;
const BLOOM_RADIUS = 1.5;

const TAU = Math.PI * 2;

function clamp(value, lower, upper) {
    return Math.min(Math.max(value, lower), upper);
}

function rand(a, b) {
    return a + Math.random() * (b - a);
}

function randInt(a, b) {
    return Math.floor(rand(a, b + 1));
}

function createElement(tagName, attributes, container) {
    const element = document.createElement(tagName);

    Object.assign(element, attributes);
    if (container) {
        container.appendChild(element);
    }
    return element;
}

function callAndSetInterval(fn, interval) {
    fn();
    return setInterval(fn, interval);
}

// Soft radial sprite with a few cross flares, matching the reference look.
function getGlowTexture() {
    const size = 128,
        canvas = createElement('canvas', {width: size, height: size}),
        ctx = canvas.getContext('2d'),
        center = size / 2,
        radial = ctx.createRadialGradient(center, center, 0, center, center, center);

    radial.addColorStop(0.0, 'rgba(255,255,255,1)');
    radial.addColorStop(0.15, 'rgba(255,255,255,0.95)');
    radial.addColorStop(0.35, 'rgba(255,255,255,0.40)');
    radial.addColorStop(0.60, 'rgba(255,255,255,0.12)');
    radial.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, size, size);

    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(center, center);
    for (const flare of [[0, 0.55, 2.4], [Math.PI / 2, 0.55, 2.4], [Math.PI / 4, 0.30, 1.6], [-Math.PI / 4, 0.30, 1.6]]) {
        const [angle, alpha, width] = flare,
            linear = ctx.createLinearGradient(-center, 0, center, 0);

        ctx.save();
        ctx.rotate(angle);
        linear.addColorStop(0.0, 'rgba(255,255,255,0)');
        linear.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
        linear.addColorStop(1.0, 'rgba(255,255,255,0)');
        ctx.fillStyle = linear;
        ctx.fillRect(-center, -width, size, width * 2);
        ctx.restore();
    }

    return new CanvasTexture(canvas);
}

const glowTexture = getGlowTexture();

// A varied palette of saturated hues for the bursts.
const PALETTE = [[0, 1, 0.60], [18, 1, 0.58], [42, 1, 0.60], [120, 0.85, 0.55], [165, 0.9, 0.58],
    [200, 1, 0.60], [225, 1, 0.62], [280, 0.85, 0.66], [320, 1, 0.68]].map(hsl => {
    const color = new Color();

    color.setHSL(hsl[0] / 360, hsl[1], hsl[2]);
    return {r: color.r, g: color.g, b: color.b};
});

function pickColor() {
    return PALETTE[randInt(0, PALETTE.length - 1)];
}

function pickType() {
    const r = Math.random();

    if (r < 0.24) {
        return 'peony';
    } else if (r < 0.42) {
        return 'palette';
    } else if (r < 0.58) {
        return 'willow';
    } else if (r < 0.72) {
        return 'ring';
    } else if (r < 0.86) {
        return 'double';
    }
    return 'glitter';
}

// Full-screen quad vertex shader shared by the bloom passes.

class FireworksLayer {

    constructor(options) {
        const me = this;

        me.id = options.id;
        me.type = 'three';
        me.lightColor = 'white';

        // Shared analytic particle pool. Attributes are written on emit and only
        // the dirty range is uploaded; the vertex shader integrates the motion.
        me._aInitPos = new Float32Array(MAX * 3); // = 'position'
        me._aInitVel = new Float32Array(MAX * 3);
        me._aColSize = new Float32Array(MAX * 4); // rgb, size
        me._aPhys = new Float32Array(MAX * 4);    // g, k, birth, lifespan
        me._aTwink = new Float32Array(MAX * 2);   // speed, phase
        me._expiry = new Float32Array(MAX);
        me._live = new Int32Array(MAX);
        me._free = new Array(MAX);
        for (let i = 0; i < MAX; i++) {
            me._free[i] = MAX - 1 - i;
        }
        me._liveCount = 0;
        me._hi = 0;
        me._dirtyLo = Infinity;
        me._dirtyHi = 0;

        me._time = 0;
        me._lastTick = performance.now();
        me._shells = [];

        // The emit origin (model space) and scale of the shell currently emitting.
        me._emitOrigin = new Vector3();
        me._emitScale = 1;
        // Extra velocity multiplier applied during bursts (BURST_SPREAD).
        me._emitVelScale = 1;

        // Scratch vector for the per-frame screen-center depth reference.
        me._refVec = new Vector3();

        me._buildParticleObject();

        const repeat = () => {
            me._tick();
            me._frameRequestID = requestAnimationFrame(repeat);
        };

        repeat();
    }

    _buildParticleObject() {
        const me = this,
            geometry = me._geometry = new BufferGeometry(),
            ipAttr = me._ipAttr = new BufferAttribute(me._aInitPos, 3),
            ivAttr = me._ivAttr = new BufferAttribute(me._aInitVel, 3),
            csAttr = me._csAttr = new BufferAttribute(me._aColSize, 4),
            phAttr = me._phAttr = new BufferAttribute(me._aPhys, 4),
            twAttr = me._twAttr = new BufferAttribute(me._aTwink, 2);

        for (const attr of [ipAttr, ivAttr, csAttr, phAttr, twAttr]) {
            attr.setUsage(DynamicDrawUsage);
        }
        geometry.setAttribute('position', ipAttr);
        geometry.setAttribute('aInitVel', ivAttr);
        geometry.setAttribute('aColSize', csAttr);
        geometry.setAttribute('aPhys', phAttr);
        geometry.setAttribute('aTwink', twAttr);
        // A generous bounding sphere so the object is never frustum-culled
        // (frustumCulled is also disabled on the Points below).
        geometry.boundingSphere = new Sphere(new Vector3(), 1e7);

        me._uniforms = {
            uTexture: {value: glowTexture},
            uSizeScale: {value: SIZE_SCALE},
            uPixelRatio: {value: 1},
            uZoomFactor: {value: 1},
            uRefDepth: {value: 1},
            uDepthStrength: {value: DEPTH_STRENGTH},
            uIntensity: {value: INTENSITY},
            uTime: {value: 0}
        };
        me._material = new ShaderMaterial({
            uniforms: me._uniforms,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: AdditiveBlending,
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader
        });

        me._points = new Points(me._geometry, me._material);
        me._points.frustumCulled = false;
    }

    onAdd(map, context) {
        const me = this;

        me.map = map;
        me.scene = context.scene;
        me.scene.add(me._points);
        me._setupBloom(context.renderer);
    }

    onRemove() {
        const me = this;

        cancelAnimationFrame(me._frameRequestID);
        if (me.scene) {
            me.scene.remove(me._points);
        }
        me._geometry.dispose();
        me._material.dispose();
        me._disposeBloom();
    }

    // --- Simulation -------------------------------------------------------

    _tick() {
        const me = this;
        const now = performance.now();
        let dt = (now - me._lastTick) / 1000;

        me._lastTick = now;
        if (dt > 0.05) {
            dt = 0.05;
        }
        me._time += dt;
        me._uniforms.uTime.value = me._time;

        me._updateShells(dt);
        me._reclaim();
        me._uploadDirty();
        me._geometry.setDrawRange(0, me._hi);

        // Keep the map repainting while there is something to animate.
        if ((me._liveCount > 0 || me._shells.length > 0) && me.map) {
            me.map.getMapboxMap().triggerRepaint();
        }
    }

    _emit(px, py, pz, vx, vy, vz, r, g, b, size, life, k, gravFac, twS, twP, birthDelay) {
        const me = this;
        const i = me._free.pop();

        if (i === undefined) {
            return;
        }

        const origin = me._emitOrigin,
            s = me._emitScale,
            delay = birthDelay || 0,
            i3 = i * 3,
            i4 = i * 4,
            i2 = i * 2;

        me._aInitPos[i3] = origin.x + px * s;
        me._aInitPos[i3 + 1] = origin.y + py * s;
        me._aInitPos[i3 + 2] = origin.z + pz * s;
        me._aInitVel[i3] = vx * s * me._emitVelScale;
        me._aInitVel[i3 + 1] = vy * s * me._emitVelScale;
        me._aInitVel[i3 + 2] = vz * s * me._emitVelScale;
        me._aColSize[i4] = r;
        me._aColSize[i4 + 1] = g;
        me._aColSize[i4 + 2] = b;
        me._aColSize[i4 + 3] = size;
        me._aPhys[i4] = G * gravFac * s;
        me._aPhys[i4 + 1] = k;
        me._aPhys[i4 + 2] = me._time + delay;
        me._aPhys[i4 + 3] = life;
        me._aTwink[i2] = twS || 0;
        me._aTwink[i2 + 1] = twP || 0;
        me._expiry[i] = me._time + delay + life;
        me._live[me._liveCount++] = i;
        if (i + 1 > me._hi) {
            me._hi = i + 1;
        }
        if (i < me._dirtyLo) {
            me._dirtyLo = i;
        }
        if (i + 1 > me._dirtyHi) {
            me._dirtyHi = i + 1;
        }
    }

    _reclaim() {
        const me = this,
            live = me._live,
            expiry = me._expiry,
            free = me._free,
            time = me._time;
        let w = 0;

        for (let r = 0; r < me._liveCount; r++) {
            const idx = live[r];

            if (time >= expiry[idx]) {
                free.push(idx);
            } else {
                live[w++] = idx;
            }
        }
        me._liveCount = w;
    }

    _uploadDirty() {
        const me = this;

        if (me._dirtyHi <= me._dirtyLo) {
            return;
        }

        const lo = me._dirtyLo,
            count = me._dirtyHi - me._dirtyLo,
            ranges = [[me._ipAttr, 3], [me._ivAttr, 3], [me._csAttr, 4], [me._phAttr, 4], [me._twAttr, 2]];

        for (const range of ranges) {
            const [attr, stride] = range;

            attr.clearUpdateRanges();
            attr.addUpdateRange(lo * stride, count * stride);
            attr.needsUpdate = true;
        }
        me._dirtyLo = Infinity;
        me._dirtyHi = 0;
    }

    // --- Shells -----------------------------------------------------------

    launchFireWorks(key, lngLat) {
        const me = this,
            {map} = me;

        // Do not launch when the pool is close to exhaustion.
        if (me._free.length < 3000) {
            return;
        }

        // Limit the number of shells in flight per event.
        let count = 0;

        for (const shell of me._shells) {
            if (shell.eventId === key) {
                count++;
            }
        }
        if (count >= MAX_SHELLS_PER_EVENT) {
            return;
        }

        const modelPosition = map.getModelPosition(lngLat),
            modelScale = map.getModelScale(),
            origin = new Vector3(
                modelPosition.x + (Math.random() * 400 - 200) * modelScale,
                modelPosition.y + (Math.random() * 400 - 200) * modelScale,
                modelPosition.z
            );

        me._shells.push({
            origin,
            eventId: key,
            // Apparent size is held constant across zoom 14-16 (like the original
            // plugin); outside that range it scales with the true magnification.
            scale: modelScale * REF_TO_MODEL * Math.pow(2, 16 - clamp(map.getZoom(), 14, 16)),
            x: 0, y: 0, z: 0,
            vx: rand(-6, 6), vy: rand(-6, 6), vz: rand(96, 118),
            color: pickColor(),
            type: pickType(),
            trailTimer: 0
        });
    }

    _updateShells(dt) {
        const me = this,
            shells = me._shells;

        for (let k = shells.length - 1; k >= 0; k--) {
            const shell = shells[k],
                drag = 1 - 0.12 * dt;

            shell.vz -= G * dt;
            shell.vx *= drag;
            shell.vy *= drag;
            shell.vz *= drag;
            shell.x += shell.vx * dt;
            shell.y += shell.vy * dt;
            shell.z += shell.vz * dt;

            me._emitOrigin.copy(shell.origin);
            me._emitScale = shell.scale;

            shell.trailTimer -= dt;
            if (shell.trailTimer <= 0) {
                shell.trailTimer = 0.01;
                for (let n = 0; n < 2; n++) {
                    me._emit(shell.x + rand(-1.5, 1.5), shell.y + rand(-1.5, 1.5), shell.z + rand(-1.5, 1.5),
                        rand(-4, 4), rand(-4, 4), -shell.vz * 0.05 + rand(-3, 3),
                        1.0, 0.78, 0.42, 2.2, rand(0.3, 0.55), 2.0, 0.4, rand(30, 46), Math.random() * TAU);
                }
                me._emit(shell.x, shell.y, shell.z, 0, 0, 0, 1, 0.95, 0.82, 3.6, 0.09, 0, 0, 0, 0);
            }

            if (shell.vz <= 8) {
                me._explode(shell);
                shells.splice(k, 1);
            }
        }
    }

    _explode(shell) {
        const me = this;

        me._emitOrigin.copy(shell.origin);
        me._emitScale = shell.scale;

        // Flash at the burst center (zero velocity, so unaffected by BURST_SPREAD).
        me._emit(shell.x, shell.y, shell.z, 0, 0, 0, 1, 1, 0.95, 62, 0.15, 0, 0, 0, 0);

        me._emitVelScale = BURST_SPREAD;
        switch (shell.type) {
            case 'willow':
                me._willow(shell);
                break;
            case 'ring':
                me._ring(shell);
                break;
            case 'palette':
                me._paletteBurst(shell);
                break;
            case 'double':
                me._doubleBurst(shell);
                break;
            case 'glitter':
                me._glitter(shell);
                break;
            default:
                me._peony(shell);
        }
        me._emitVelScale = 1;
    }

    _peony(shell) {
        const me = this,
            n = randInt(260, 420),
            speed = rand(48, 70),
            c = shell.color,
            two = Math.random() < 0.4 ? pickColor() : null;

        for (let i = 0; i < n; i++) {
            const u = Math.random() * 2 - 1,
                th = Math.random() * TAU,
                rr = Math.sqrt(1 - u * u),
                sp = speed * rand(0.85, 1.15),
                col = two && Math.random() < 0.5 ? two : c,
                gl = Math.random() < 0.22;

            me._emit(shell.x, shell.y, shell.z, rr * Math.cos(th) * sp, rr * Math.sin(th) * sp, u * sp,
                col.r, col.g, col.b, rand(3.0, 4.4), rand(1.4, 2.3), 1.25, 1.0,
                gl ? rand(14, 28) : 0, gl ? Math.random() * TAU : 0);
        }
    }

    _paletteBurst(shell) {
        const me = this,
            n = randInt(260, 400),
            speed = rand(48, 68);

        for (let i = 0; i < n; i++) {
            const u = Math.random() * 2 - 1,
                th = Math.random() * TAU,
                rr = Math.sqrt(1 - u * u),
                sp = speed * rand(0.8, 1.15),
                col = pickColor(),
                gl = Math.random() < 0.3;

            me._emit(shell.x, shell.y, shell.z, rr * Math.cos(th) * sp, rr * Math.sin(th) * sp, u * sp,
                col.r, col.g, col.b, rand(3.0, 4.2), rand(1.4, 2.3), 1.2, 1.0,
                gl ? rand(14, 28) : 0, gl ? Math.random() * TAU : 0);
        }
    }

    _willow(shell) {
        const me = this,
            strands = randInt(155, 200),
            speed = rand(52, 64),
            rise = rand(3, 9);

        for (let i = 0; i < strands; i++) {
            const u = Math.random() * 2 - 1,
                th = Math.random() * TAU,
                rr = Math.sqrt(1 - u * u),
                sp = speed * rand(0.85, 1.1),
                vx = rr * Math.cos(th) * sp,
                vy = rr * Math.sin(th) * sp,
                vz = u * sp + rise,
                life = rand(3.2, 4.3);

            me._emit(shell.x, shell.y, shell.z, vx, vy, vz, 1.0, 0.72, 0.32, 3.2, life, 0.5, 1.08, 0, 0);
            // Trailing strands born slightly later, following the head's path.
            for (let j = 1; j <= 12; j++) {
                const off = j * 0.05,
                    ll = life - off;

                if (ll <= 0.06) {
                    break;
                }
                me._emit(shell.x, shell.y, shell.z, vx + rand(-0.8, 0.8), vy + rand(-0.8, 0.8), vz + rand(-0.8, 0.8),
                    1.0, Math.max(0.40, 0.66 - j * 0.02), 0.22, Math.max(1.6, 3.2 - j * 0.13), ll, 0.5, 1.08, 0, 0, off);
            }
        }
    }

    _ring(shell) {
        const me = this,
            nr = randInt(100, 144),
            c = shell.color,
            cc = pickColor(),
            ax = Math.random() * Math.PI,
            ay = Math.random() * Math.PI,
            ca = Math.cos(ax), sa = Math.sin(ax),
            cy = Math.cos(ay), sy = Math.sin(ay);

        for (let i = 0; i < nr; i++) {
            const a = i / nr * TAU;
            let dx = Math.cos(a), dz = Math.sin(a), dy = 0;
            const y1 = dy * ca - dz * sa, z1 = dy * sa + dz * ca;

            dy = y1;
            dz = z1;
            const x1 = dx * cy + dz * sy;

            dz = -dx * sy + dz * cy;
            dx = x1;
            const sp = rand(52, 64) * rand(0.96, 1.04);

            me._emit(shell.x, shell.y, shell.z, dx * sp, dy * sp, dz * sp, c.r, c.g, c.b, 3.3, rand(1.5, 2.1), 1.0, 0.9, 0, 0);
        }
        for (let i = 0; i < 70; i++) {
            const u = Math.random() * 2 - 1,
                th = Math.random() * TAU,
                rr = Math.sqrt(1 - u * u),
                sp = rand(20, 30);

            me._emit(shell.x, shell.y, shell.z, rr * Math.cos(th) * sp, rr * Math.sin(th) * sp, u * sp,
                cc.r, cc.g, cc.b, 3.0, rand(1.1, 1.6), 1.4, 1.0, 0, 0);
        }
    }

    _doubleBurst(shell) {
        const me = this,
            c1 = shell.color,
            c2 = pickColor();

        for (let i = 0; i < 150; i++) {
            const u = Math.random() * 2 - 1,
                th = Math.random() * TAU,
                rr = Math.sqrt(1 - u * u),
                sp = rand(26, 36);

            me._emit(shell.x, shell.y, shell.z, rr * Math.cos(th) * sp, rr * Math.sin(th) * sp, u * sp,
                c1.r, c1.g, c1.b, 3.2, rand(1.3, 1.9), 1.3, 1.0, 0, 0);
        }
        for (let i = 0; i < 190; i++) {
            const u = Math.random() * 2 - 1,
                th = Math.random() * TAU,
                rr = Math.sqrt(1 - u * u),
                sp = rand(56, 72),
                gl = Math.random() < 0.3;

            me._emit(shell.x, shell.y, shell.z, rr * Math.cos(th) * sp, rr * Math.sin(th) * sp, u * sp,
                c2.r, c2.g, c2.b, 3.2, rand(1.6, 2.4), 1.1, 1.0,
                gl ? rand(16, 30) : 0, gl ? Math.random() * TAU : 0);
        }
    }

    _glitter(shell) {
        const me = this,
            n = randInt(210, 320),
            speed = rand(42, 60),
            gold = Math.random() < 0.5,
            r = gold ? 1.0 : 0.82,
            g = gold ? 0.85 : 0.9,
            b = gold ? 0.5 : 1.0;

        for (let i = 0; i < n; i++) {
            const u = Math.random() * 2 - 1,
                th = Math.random() * TAU,
                rr = Math.sqrt(1 - u * u),
                sp = speed * rand(0.7, 1.15);

            me._emit(shell.x, shell.y, shell.z, rr * Math.cos(th) * sp, rr * Math.sin(th) * sp, u * sp,
                r, g, b, rand(2.8, 4.0), rand(1.7, 2.8), 1.2, 1.0, rand(18, 34), Math.random() * TAU);
        }
    }

    // --- Bloom post-processing -------------------------------------------

    _setupBloom(renderer) {
        const me = this;

        me._renderer = renderer;
        me._fsCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
        me._fsScene = new Scene();
        me._fsQuad = new Mesh(new PlaneGeometry(2, 2));
        me._fsScene.add(me._fsQuad);

        me._brightMaterial = new ShaderMaterial({
            uniforms: {tDiffuse: {value: null}, threshold: {value: BLOOM_THRESHOLD}},
            vertexShader: bloomVertexShader,
            fragmentShader: bloomBrightFragmentShader
        });
        me._blurMaterial = new ShaderMaterial({
            uniforms: {tDiffuse: {value: null}, dir: {value: new Vector2()}},
            vertexShader: bloomVertexShader,
            fragmentShader: bloomBlurFragmentShader
        });
        // Additively composited over the map: base particle light plus the bloom.
        me._compositeMaterial = new ShaderMaterial({
            uniforms: {tScene: {value: null}, tBloom: {value: null}, strength: {value: BLOOM_STRENGTH}},
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: AdditiveBlending,
            vertexShader: bloomVertexShader,
            fragmentShader: bloomCompositeFragmentShader
        });
    }

    _disposeBloom() {
        const me = this;

        for (const target of [me._rtScene, me._rtA, me._rtB]) {
            if (target) {
                target.dispose();
            }
        }
        for (const material of [me._brightMaterial, me._blurMaterial, me._compositeMaterial]) {
            if (material) {
                material.dispose();
            }
        }
        if (me._fsQuad) {
            me._fsQuad.geometry.dispose();
        }
    }

    _ensureTargets() {
        const me = this,
            renderer = me._renderer,
            // Read the live drawing buffer size from the GL context. The renderer
            // shares Mapbox's canvas and never has setSize() called, so three's
            // getDrawingBufferSize() would return the stale initial size and the
            // targets would not follow window resizes.
            gl = renderer.getContext(),
            w = Math.max(1, gl.drawingBufferWidth | 0),
            h = Math.max(1, gl.drawingBufferHeight | 0),
            halfW = Math.max(1, w >> 1),
            halfH = Math.max(1, h >> 1);

        if (me._rtScene && me._bufferW === w && me._bufferH === h) {
            return;
        }
        me._bufferW = w;
        me._bufferH = h;
        me._halfW = halfW;
        me._halfH = halfH;

        for (const target of [me._rtScene, me._rtA, me._rtB]) {
            if (target) {
                target.dispose();
            }
        }
        const base = {minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat};

        // rtScene keeps a depth + stencil buffer so the map's depth can be blitted
        // into it (for building occlusion); the blur targets need color only.
        me._rtScene = new WebGLRenderTarget(w, h, Object.assign({depthBuffer: true, stencilBuffer: true}, base));
        me._rtA = new WebGLRenderTarget(halfW, halfH, Object.assign({depthBuffer: false}, base));
        me._rtB = new WebGLRenderTarget(halfW, halfH, Object.assign({depthBuffer: false}, base));
    }

    _bloomPass(material, target) {
        const me = this,
            renderer = me._renderer;

        me._fsQuad.material = material;
        renderer.setRenderTarget(target);
        renderer.render(me._fsScene, me._fsCamera);
    }

    // Custom render hook (see three-layer.js). Renders the particles to an
    // offscreen target, extracts and blurs the bright parts, then additively
    // composites the particles and their bloom onto the map framebuffer.
    render(map, context) {
        const me = this,
            {renderer, scene, camera} = context;

        // Nothing to draw: skip the whole bloom pipeline. The map keeps
        // repainting for other layers, so render() is called every frame even
        // while no fireworks are active.
        if (me._liveCount === 0 && me._shells.length === 0) {
            return;
        }

        const zoom = map.getZoom();

        me._uniforms.uPixelRatio.value = renderer.getPixelRatio();
        // Constant apparent size across zoom 14-16, proportional outside.
        me._uniforms.uZoomFactor.value = Math.pow(2, zoom - clamp(zoom, 14, 16));

        const center = map.getModelPosition(map.getCenter());

        me._refVec.set(center.x, center.y, center.z).applyMatrix4(camera.matrixWorldInverse);
        me._uniforms.uRefDepth.value = Math.max(1, -me._refVec.z);

        me._ensureTargets();

        // Keep three's viewport in sync with the live drawing buffer. The renderer
        // shares Mapbox's canvas and never has setSize()/setViewport() called, so
        // the internal viewport stays at the stale initial size and the final
        // composite to the default framebuffer would be misaligned/mis-scaled.
        renderer.setViewport(0, 0, me._bufferW, me._bufferH);

        const gl = renderer.getContext(),
            prevTarget = renderer.getRenderTarget(),
            // The framebuffer the map is drawn into, holding the scene depth.
            mapFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);

        renderer.setRenderTarget(me._rtScene);

        // Copy the map's depth into rtScene so the particles are occluded by the
        // buildings/terrain in front of them (WebGL2), then render only their color.
        if (gl.blitFramebuffer) {
            const rtFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);

            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mapFramebuffer);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rtFramebuffer);
            gl.blitFramebuffer(0, 0, me._bufferW, me._bufferH, 0, 0, me._bufferW, me._bufferH, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, rtFramebuffer);
        }

        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false); // color only; keep the copied depth
        renderer.render(scene, camera);

        // Bright pass + separable blur (two widening passes).
        me._brightMaterial.uniforms.tDiffuse.value = me._rtScene.texture;
        me._bloomPass(me._brightMaterial, me._rtA);
        me._blurMaterial.uniforms.tDiffuse.value = me._rtA.texture;
        me._blurMaterial.uniforms.dir.value.set(BLOOM_RADIUS / me._halfW, 0);
        me._bloomPass(me._blurMaterial, me._rtB);
        me._blurMaterial.uniforms.tDiffuse.value = me._rtB.texture;
        me._blurMaterial.uniforms.dir.value.set(0, BLOOM_RADIUS / me._halfH);
        me._bloomPass(me._blurMaterial, me._rtA);
        me._blurMaterial.uniforms.tDiffuse.value = me._rtA.texture;
        me._blurMaterial.uniforms.dir.value.set(2.2 * BLOOM_RADIUS / me._halfW, 0);
        me._bloomPass(me._blurMaterial, me._rtB);
        me._blurMaterial.uniforms.tDiffuse.value = me._rtB.texture;
        me._blurMaterial.uniforms.dir.value.set(0, 2.2 * BLOOM_RADIUS / me._halfH);
        me._bloomPass(me._blurMaterial, me._rtA);

        // Composite additively onto the map framebuffer.
        me._compositeMaterial.uniforms.tScene.value = me._rtScene.texture;
        me._compositeMaterial.uniforms.tBloom.value = me._rtA.texture;
        renderer.setRenderTarget(prevTarget);
        me._bloomPass(me._compositeMaterial, prevTarget);
    }

}

class FireworksControl {

    constructor(options) {
        const me = this,
            {lang, clock, eventHandler} = options;

        me._lang = lang;
        me._clock = clock;
        me._dict = {
            de: {
                'title-line-1': 'Die heutigen',
                'title-line-2': 'Feste',
                'to': ' - ',
                'more': 'und $1 weitere'
            },
            en: {
                'title-line-1': 'Today\'s',
                'title-line-2': 'festivals',
                'to': ' - ',
                'more': 'and $1 more'
            },
            es: {
                'title-line-1': 'La fiesta',
                'title-line-2': 'de hoy',
                'to': ' - ',
                'more': 'y $1 más'
            },
            fr: {
                'title-line-1': 'Les fêtes',
                'title-line-2': 'd\'aujourd\'hui',
                'to': ' - ',
                'more': 'et $1 autres'
            },
            ja: {
                'title-line-1': '今日の',
                'title-line-2': '花火大会',
                'to': '〜',
                'more': 'ほか$1件'
            },
            ko: {
                'title-line-1': '오늘의',
                'title-line-2': '불꽃놀이',
                'to': ' - ',
                'more': '외 $1개'
            },
            ne: {
                'title-line-1': 'आजका',
                'title-line-2': 'चाडपर्वहरू',
                'to': ' - ',
                'more': 'र 1 थप'
            },
            pt: {
                'title-line-1': 'Os festivais',
                'title-line-2': 'de hoje',
                'to': ' - ',
                'more': 'e mais $1'
            },
            th: {
                'title-line-1': 'เทศกาล',
                'title-line-2': 'วันนี้',
                'to': ' - ',
                'more': 'และอีก $1 รายการ'
            },
            'zh-Hans': {
                'title-line-1': '今天的',
                'title-line-2': '烟火大会',
                'to': ' - ',
                'more': '其他$1场'
            },
            'zh-Hant': {
                'title-line-1': '今天的',
                'title-line-2': '煙火大會',
                'to': ' - ',
                'more': '其他$1場'
            }
        };
        me._eventHandler = eventHandler;
    }

    getDefaultPosition() {
        return 'top-left';
    }

    onAdd(map) {
        const me = this;

        me._map = map;

        me._container = document.createElement('div');
        me._container.className = 'mapboxgl-ctrl ctrl-group';
        me._container.style.display = 'none';

        me._element = document.createElement('div');
        me._element.className = 'fireworks-ctrl';
        me._container.appendChild(me._element);

        return me._container;
    }

    onRemove() {
        const me = this;

        me._container.parentNode.removeChild(me._container);
        delete me._container;
        delete me._map;
    }

    refresh(events) {
        const me = this,
            dict = me._dict[me._lang] || me._dict.en,
            container = me._container,
            element = me._element,
            baseTime = me._clock.getTime('03:00'),
            now = me._clock.getTime(),
            ids = Object.keys(events).filter(id => {
                const {start, end} = events[id];
                return start >= baseTime && start < baseTime + 86400000 && end > now;
            }),
            height = () => container.classList.contains('expanded') ?
                `min(${ids.length * 49 + 40}px, calc(100dvh - ${container.getBoundingClientRect().top + 56}px))` :
                '';

        if (ids.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        element.innerHTML = [
            '<div class="fireworks-header">',
            '<div class="fireworks-title">',
            dict['title-line-1'],
            '<br>',
            dict['title-line-2'],
            '</div>',
            '<div id="fireworks-expand-button" class="fireworks-expand-button">',
            '</div>',
            '</div>',
            '<div class="fireworks-body">',
            '<div class="fireworks-content">',
            `<button id="fireworks-${ids[0]}" class="fireworks-event">`,
            '<div class="fireworks-event-label">',
            events[ids[0]].name[me._lang] || events[ids[0]].name.en,
            '<br>',
            me._clock.getTimeString(events[ids[0]].start),
            dict['to'],
            '</div>',
            '</button>',
            '<div class="fireworks-list">',
            ...ids.slice(1).map(id => [
                `<button id="fireworks-${id}" class="fireworks-event">`,
                '<div class="fireworks-event-label">',
                events[id].name[me._lang] || events[id].name.en,
                '<br>',
                me._clock.getTimeString(events[id].start),
                dict['to'],
                '</div>',
                '</button>'
            ].join('')),
            '</div>',
            ids.length > 1 ? [
                '<div class="fireworks-footer">',
                dict['more'].replace('$1', ids.length - 1),
                '</div>'
            ].join('') : '',
            '</div>',
            '</div>'
        ].join('');

        container.style.height = height();

        document.getElementById('fireworks-expand-button').addEventListener('click', () => {
            container.classList.toggle('expanded');
            container.style.height = height();
        });

        for (const id of ids) {
            document.getElementById(`fireworks-${id}`).addEventListener('click', () => {
                container.classList.remove('expanded');
                container.style.height = height();
                me._eventHandler({id});
            });
        }
    }

}

class FireworksPlugin {

    constructor() {
        const me = this;

        me.id = 'fireworks';
        me.name = {
            de: 'Feuerwerk',
            en: 'Fireworks',
            es: 'Fuegos artificiales',
            fr: 'Feux d\'artifice',
            ja: '花火',
            ko: '불꽃놀이',
            ne: 'आतिशबाजी',
            pt: 'Fogos de artifício',
            th: 'ดอกไม้ไฟ',
            'zh-Hans': '烟花',
            'zh-Hant': '煙花'
        };
        me.iconStyle = {
            backgroundSize: '32px',
            backgroundImage: `url("${fireworksSVG}")`
        };
        me.viewModes = ['ground'];
        me.layer = new FireworksLayer({id: me.id});
        me.events = {};
        me.activeEvents = {};
    }

    onAdd(map) {
        const me = this,
            {lang, clock} = me.map = map;

        map.addLayer(me.layer);
        me.fireworksCtrl = new FireworksControl({lang, clock, eventHandler: ({id}) => {
            map.flyTo({center: me.events[id].center, zoom: 15, pitch: 60});
        }});
    }

    onRemove(map) {
        map.removeLayer(this.id);
    }

    onEnabled() {
        const me = this;

        me.map.getMapboxMap().addControl(me.fireworksCtrl);

        me.dataInterval = callAndSetInterval(() => {
            fetch(FIRWORKS_URL)
                .then(response => response.json())
                .then(data => {
                    me._updateEvents(data);
                    me._updateActiveEvents();
                    me.fireworksCtrl.refresh(me.events);
                });
        }, DATA_INTERVAL);

        const repeat = () => {
            const now = me.map.clock.getTime();

            if (Math.floor(now / ACTIVITY_INTERVAL) !== Math.floor(me._lastActivityRefresh / ACTIVITY_INTERVAL)) {
                me._updateActiveEvents();
                me.fireworksCtrl.refresh(me.events);
                me._lastActivityRefresh = now;
            }
            me._frameRequestID = requestAnimationFrame(repeat);
        };

        repeat();

        me.interval = callAndSetInterval(() => {
            if (me.visible) {
                const activeEvents = me.activeEvents;

                for (const id of Object.keys(activeEvents)) {
                    if (Math.random() > 0.7) {
                        me.layer.launchFireWorks(id, activeEvents[id].center);
                    }
                }
            }
        }, FIREWORKS_INTERVAL);
    }

    onDisabled() {
        const me = this;

        clearInterval(me.dataInterval);
        cancelAnimationFrame(me._frameRequestID);
        delete me._lastActivityRefresh;
        clearInterval(me.interval);

        me._updateEvents([]);

        me.map.getMapboxMap().removeControl(me.fireworksCtrl);
    }

    onVisibilityChanged(visible) {
        const me = this,
            {map, activeEvents} = me;

        me.visible = visible;

        for (const id of Object.keys(activeEvents)) {
            activeEvents[id].marker.setVisibility(visible);
        }
        map.setLayerVisibility(me.id, visible ? 'visible' : 'none');
    }

    _updateEvents(data) {
        const me = this,
            {map, events, activeEvents} = me;

        for (const item of data) {
            const id = item.id,
                event = events[id];

            if (event) {
                event.marker.setLngLat(item.center);
                event.updated = true;
                continue;
            }

            const element = createElement('div', {
                    className: 'fireworks-marker',
                    innerHTML: item.name[map.lang] || item.name.en
                }),
                marker = new Marker({element})
                    .setLngLat(item.center)
                    .addTo(map)
                    .setVisibility(false)
                    .on('click', () => {
                        map.flyTo({center: events[id].center, zoom: 15, pitch: 60});
                    });

            events[id] = Object.assign({marker, updated: true}, item);
        }

        for (const id of Object.keys(events)) {
            if (events[id].updated) {
                delete events[id].updated;
            } else {
                events[id].marker.remove();
                delete events[id];
                delete activeEvents[id];
            }
        }
    }

    _updateActiveEvents() {
        const me = this,
            {events, activeEvents} = me,
            now = me.map.clock.getTime();

        for (const id of Object.keys(events)) {
            const event = events[id],
                isActive = now >= event.start && now < event.end;

            if (isActive && !activeEvents[id]) {
                activeEvents[id] = event;
                event.marker.setVisibility(me.visible);
            } else if (!isActive && activeEvents[id]) {
                delete activeEvents[id];
                event.marker.setVisibility(false);
            }
        }
    }

}

export default function() {
    return new FireworksPlugin();
}
