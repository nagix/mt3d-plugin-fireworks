import {Marker, THREE} from 'mini-tokyo-3d';
import vertexShader from './vertex-shader.glsl';
import fragmentShader from './fragment-shader.glsl';
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
    BufferGeometry,
    DynamicDrawUsage,
    Float32BufferAttribute,
    Group,
    MathUtils,
    Points,
    RawShaderMaterial,
    CanvasTexture,
    Vector3
} = THREE;

function clamp(value, lower, upper) {
    return Math.min(Math.max(value, lower), upper);
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

const friction = 0.998;
const textureSize = 128.0;
const particleSize = 300;

const getOffsetXYZ = i => {
    const offset = 3;
    const index = i * offset;
    const x = index;
    const y = index + 1;
    const z = index + 2;

    return {x, y, z};
};

const getOffsetRGBA = i => {
    const offset = 4;
    const index = i * offset;
    const r = index;
    const g = index + 1;
    const b = index + 2;
    const a = index + 3;

    return {r, g, b, a};
};

const getRandomNum = (max = 0, min = 0) => Math.floor(Math.random() * (max + 1 - min)) + min;

const drawRadialGradation = (ctx, canvasRadius, canvasW, canvasH) => {
    ctx.save();
    const gradient = ctx.createRadialGradient(canvasRadius, canvasRadius, 0, canvasRadius, canvasRadius, canvasRadius);
    gradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
};

const getTexture = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const diameter = textureSize;
    canvas.width = diameter;
    canvas.height = diameter;
    const canvasRadius = diameter / 2;

    /* gradation circle
    ------------------------ */
    drawRadialGradation(ctx, canvasRadius, canvas.width, canvas.height);
    return new CanvasTexture(canvas);
};

const canvasTexture = getTexture();

const getPointMesh = (num, vels, type) => {
    // geometry
    const bufferGeometry = new BufferGeometry();
    const vertices = [];
    const velocities = [];
    const colors = [];
    const adjustSizes = [];
    const masses = [];
    const colorType = Math.random() > 0.3 ? 'single' : 'multiple';
    const singleColor = getRandomNum(100, 20) * 0.01;
    const multipleColor = () => getRandomNum(100, 1) * 0.01;
    let rgbType;
    const rgbTypeDice = Math.random();

    if (rgbTypeDice > 0.66) {
        rgbType = 'red';
    } else if (rgbTypeDice > 0.33) {
        rgbType = 'green';
    } else {
        rgbType = 'blue';
    }
    for (let i = 0; i < num; i++) {
        const pos = new Vector3(0, 0, 0);

        vertices.push(pos.x, pos.y, pos.z);
        velocities.push(vels[i].x, vels[i].y, vels[i].z);
        if (type === 'seed') {
            let size;

            if (type === 'trail') {
                size = Math.random() * 0.1 + 0.1;
            } else {
                // size = Math.pow(vels[i].z, 2) * 0.04;
                size = Math.random() * 0.1 + 0.1;
            }
            if (i === 0) {
                size *= 1.1;
            }
            adjustSizes.push(size * 5);
            masses.push(size * 0.017);
            colors.push(1.0, 1.0, 1.0, 1.0);
        } else {
            const size = getRandomNum(particleSize, 10) * 0.001;

            adjustSizes.push(size * 5);
            masses.push(size * 0.017);
            if (colorType === 'multiple') {
                colors.push(multipleColor(), multipleColor(), multipleColor(), 1.0);
            } else {
                switch (rgbType) {
                case 'red':
                    colors.push(singleColor, 0.1, 0.1, 1.0);
                    break;
                case 'green':
                    colors.push(0.1, singleColor, 0.1, 1.0);
                    break;
                case 'blue':
                    colors.push(0.1, 0.1, singleColor, 1.0);
                    break;
                default:
                    colors.push(singleColor, 0.1, 0.1, 1.0);
                }
            }
        }
    }
    bufferGeometry.setAttribute('position', new Float32BufferAttribute(vertices, 3).setUsage(DynamicDrawUsage));
    bufferGeometry.setAttribute('velocity', new Float32BufferAttribute(velocities, 3).setUsage(DynamicDrawUsage));
    bufferGeometry.setAttribute('color', new Float32BufferAttribute(colors, 4).setUsage(DynamicDrawUsage));
    bufferGeometry.setAttribute('adjustSize', new Float32BufferAttribute(adjustSizes, 1).setUsage(DynamicDrawUsage));
    bufferGeometry.setAttribute('mass', new Float32BufferAttribute(masses, 1).setUsage(DynamicDrawUsage));

    // material
    const shaderMaterial = new RawShaderMaterial({
        uniforms: {
            size: {
                type: 'f',
                value: textureSize
            },
            texture: {
                type: 't',
                value: canvasTexture
            }
        },
        transparent: true,
        // Display of "blending: THREE.AdditiveBlending" does not work properly if "depthWrite" property is set to true.
        // Therefore, it is necessary to make it false in the case of making the image transparent by blending.
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader,
        fragmentShader
    });

    return new Points(bufferGeometry, shaderMaterial);
};

class ParticleMesh {

    constructor(scale, num, vels, type) {
        this.scale = scale;
        this.particleNum = num;
        this.timerStartFading = 10;
        this.mesh = getPointMesh(num, vels, type);
    }

    update(gravity, frameRateFactor) {
        if (this.timerStartFading > 0) {
            this.timerStartFading -= 0.3;
        }

        const {position, velocity, color, mass} = this.mesh.geometry.attributes;
        const decrementRandom = () => (Math.random() > 0.5 ? 0.98 : 0.96);
        const decrementByVel = v => (Math.random() > 0.5 ? 0 : (1 - v) * 0.1);

        for (let i = 0; i < this.particleNum; i++) {
            const {x, y, z} = getOffsetXYZ(i);

            velocity.array[z] += gravity.z - mass.array[i] * this.scale * frameRateFactor;
            velocity.array[x] *= 1 - ((1 - friction) * frameRateFactor);
            velocity.array[y] *= 1 - ((1 - friction) * frameRateFactor);
            velocity.array[z] *= 1 - ((1 - friction) * frameRateFactor);
            position.array[x] += velocity.array[x] * frameRateFactor;
            position.array[y] += velocity.array[y] * frameRateFactor;
            position.array[z] += velocity.array[z] * frameRateFactor;

            const {a} = getOffsetRGBA(i);

            if (this.timerStartFading <= 0) {
                color.array[a] *= 1 - ((1 - (decrementRandom() - decrementByVel(color.array[a]))) * frameRateFactor);
                if (color.array[a] < 0.001) {
                    color.array[a] = 0;
                }
            }
        }
        position.needsUpdate = true;
        velocity.needsUpdate = true;
        color.needsUpdate = true;
    }

    disposeAll() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }

}

class ParticleSeedMesh extends ParticleMesh {

    constructor(scale, num, vels) {
        super(scale, num, vels, 'seed');
    }

    update(gravity, frameRateFactor) {
        const {position, velocity, color, mass} = this.mesh.geometry.attributes;
        const decrementRandom = () => (Math.random() > 0.3 ? 0.99 : 0.96);
        const decrementByVel = v => (Math.random() > 0.3 ? 0 : (1 - v) * 0.1);
        const shake = () => (Math.random() > 0.5 ? 0.05 : -0.05) * this.scale * frameRateFactor;
        const dice = () => Math.random() > 0.1;
        const _f = friction * 0.98;

        for (let i = 0; i < this.particleNum; i++) {
            const {x, y, z} = getOffsetXYZ(i);

            velocity.array[z] += gravity.z - mass.array[i] * this.scale * frameRateFactor;
            velocity.array[x] *= 1 - ((1 - _f) * frameRateFactor);
            velocity.array[y] *= 1 - ((1 - _f) * frameRateFactor);
            velocity.array[z] *= 1 - ((1 - _f) * frameRateFactor);
            position.array[x] += velocity.array[x] * frameRateFactor;
            position.array[y] += velocity.array[y] * frameRateFactor;
            position.array[z] += velocity.array[z] * frameRateFactor;
            if (dice()) {
                position.array[x] += shake();
            }
            if (dice()) {
                position.array[y] += shake();
            }

            const {a} = getOffsetRGBA(i);

            color.array[a] *= 1 - ((1 - (decrementRandom() - decrementByVel(color.array[a]))) * frameRateFactor);
            if (color.array[a] < 0.001) {
                color.array[a] = 0;
            }
        }
        position.needsUpdate = true;
        velocity.needsUpdate = true;
        color.needsUpdate = true;
    }

}

class ParticleTailMesh extends ParticleMesh {

    constructor(scale, num, vels) {
        super(scale, num, vels, 'trail');
    }

    update(gravity, frameRateFactor) {
        const {position, velocity, color, mass} = this.mesh.geometry.attributes;
        const decrementRandom = () => (Math.random() > 0.3 ? 0.98 : 0.95);
        const shake = () => (Math.random() > 0.5 ? 0.05 : -0.05) * this.scale * frameRateFactor;
        const dice = () => Math.random() > 0.2;

        for (let i = 0; i < this.particleNum; i++) {
            const {x, y, z} = getOffsetXYZ(i);

            velocity.array[z] += gravity.z - mass.array[i] * this.scale * frameRateFactor;
            velocity.array[x] *= 1 - ((1 - friction) * frameRateFactor);
            velocity.array[y] *= 1 - ((1 - friction) * frameRateFactor);
            velocity.array[z] *= 1 - ((1 - friction) * frameRateFactor);
            position.array[x] += velocity.array[x] * frameRateFactor;
            position.array[y] += velocity.array[y] * frameRateFactor;
            position.array[z] += velocity.array[z] * frameRateFactor;
            if (dice()) {
                position.array[x] += shake();
            }
            if (dice()) {
                position.array[y] += shake();
            }

            const {a} = getOffsetRGBA(i);

            color.array[a] *= 1 - ((1 - decrementRandom()) * frameRateFactor);
            if (color.array[a] < 0.001) {
                color.array[a] = 0;
            }
        }
        position.needsUpdate = true;
        velocity.needsUpdate = true;
        color.needsUpdate = true;
    }

}

class BasicFireWorks {

    constructor(scale, position) {
        this.scale = scale;
        this.position = position;
        this.gravity = new Vector3(0, 0, -0.005 * scale);
        this.meshGroup = new Group();
        this.isExplode = false;
        const max = 400;
        const min = 150;
        this.petalsNum = getRandomNum(max, min);
        this.life = 150;
        this.seed = this.getSeed();
        this.meshGroup.add(this.seed.mesh);
        this.flowerSizeRate = MathUtils.mapLinear(this.petalsNum, min, max, 0.4, 0.7);
    }

    getSeed() {
        const num = 40;
        const vels = [];

        for (let i = 0; i < num; i++) {
            const vx = 0;
            const vy = 0;
            const vz = (i === 0 ? Math.random() * 2.5 + 0.9 : Math.random() * 2.0 + 0.4) * this.scale;

            vels.push(new Vector3(vx, vy, vz));
        }

        const pm = new ParticleSeedMesh(this.scale, num, vels);
        const x = this.position.x;
        const y = this.position.y;
        const z = 0;

        pm.mesh.position.set(x, y, z);
        return pm;
    }

    explode(pos) {
        this.isExplode = true;
        this.flower = this.getFlower(pos);
        this.meshGroup.add(this.flower.mesh);
        this.meshGroup.remove(this.seed.mesh);
        this.seed.disposeAll();
    }

    getFlower(pos) {
        const num = this.petalsNum;
        const vels = [];
        let radius;
        const dice = Math.random();

        if (dice > 0.5) {
            for (let i = 0; i < num; i++) {
                radius = getRandomNum(120, 60) * 0.01 * this.scale;

                const theta = MathUtils.degToRad(Math.random() * 180);
                const phi = MathUtils.degToRad(Math.random() * 360);
                const vx = Math.sin(theta) * Math.cos(phi) * radius;
                const vy = Math.sin(theta) * Math.sin(phi) * radius;
                const vz = Math.cos(theta) * radius;
                const vel = new Vector3(vx, vy, vz);

                vel.multiplyScalar(this.flowerSizeRate);
                vels.push(vel);
            }
        } else {
            const zStep = 180 / num;
            const trad = (360 * (Math.random() * 20 + 1)) / num;
            const xStep = trad;
            const yStep = trad;

            radius = getRandomNum(120, 60) * 0.01 * this.scale;
            for (let i = 0; i < num; i++) {
                const sphereRate = Math.sin(MathUtils.degToRad(zStep * i));
                const vz = Math.cos(MathUtils.degToRad(zStep * i)) * radius;
                const vx = Math.cos(MathUtils.degToRad(xStep * i)) * sphereRate * radius;
                const vy = Math.sin(MathUtils.degToRad(yStep * i)) * sphereRate * radius;
                const vel = new Vector3(vx, vy, vz);
                vel.multiplyScalar(this.flowerSizeRate);
                vels.push(vel);
            }
        }

        const particleMesh = new ParticleMesh(this.scale, num, vels);

        particleMesh.mesh.position.set(pos.x, pos.y, pos.z);
        return particleMesh;
    }

    update(frameRateFactor) {
        if (!this.isExplode) {
            this.drawTail(frameRateFactor);
        } else {
            this.flower.update(this.gravity, frameRateFactor);
            if (this.life > 0) {
                this.life -= 1 * frameRateFactor;
            }
        }
    }

    drawTail(frameRateFactor) {
        this.seed.update(this.gravity, frameRateFactor);
        const {position, velocity} = this.seed.mesh.geometry.attributes;
        let count = 0;
        let isComplete = true;

        // Check if the y-axis speed is down for all particles
        for (let i = 0, l = velocity.array.length; i < l; i++) {
            const v = velocity.array[i];
            const index = i % 3;

            if (index === 2 && v > 0) {
                count++;
            }
        }

        isComplete = count === 0;
        if (!isComplete) {
            return;
        }

        const {x, y, z} = this.seed.mesh.position;
        const flowerPos = new Vector3(x, y, z);
        let highestPos = 0;
        let offsetPos;

        for (let i = 0, l = position.array.length; i < l; i++) {
            const p = position.array[i];
            const index = i % 3;

            if (index === 2 && p > highestPos) {
                highestPos = p;
                offsetPos = new Vector3(position.array[i - 2], position.array[i - 1], p);
            }
        }
        if (offsetPos === undefined) {
            return;
        }
        flowerPos.add(offsetPos);
        this.explode(flowerPos);
    }

}

class RichFireWorks extends BasicFireWorks {

    constructor(scale, position) {
        super(scale, position);

        const max = 150;
        const min = 100;

        this.petalsNum = getRandomNum(max, min);
        this.flowerSizeRate = MathUtils.mapLinear(this.petalsNum, min, max, 0.4, 0.7);
        this.tailMeshGroup = new Group();
        this.tails = [];
    }

    explode(pos) {
        this.isExplode = true;
        this.flower = this.getFlower(pos);
        this.tails = this.getTail();
        this.meshGroup.add(this.flower.mesh);
        this.meshGroup.add(this.tailMeshGroup);
    }

    getTail() {
        const tails = [];
        const num = 20;
        const {color: petalColor} = this.flower.mesh.geometry.attributes;

        for (let i = 0; i < this.petalsNum; i++) {
            const vels = [];

            for (let j = 0; j < num; j++) {
                const vx = 0;
                const vy = 0;
                const vz = 0;

                vels.push(new Vector3(vx, vy, vz));
            }

            const tail = new ParticleTailMesh(this.scale, num, vels);

            const {r, g, b, a} = getOffsetRGBA(i);

            const petalR = petalColor.array[r];
            const petalG = petalColor.array[g];
            const petalB = petalColor.array[b];
            const petalA = petalColor.array[a];

            const {position, color} = tail.mesh.geometry.attributes;

            for (let k = 0; k < position.count; k++) {
                const {r, g, b, a} = getOffsetRGBA(k);

                color.array[r] = petalR;
                color.array[g] = petalG;
                color.array[b] = petalB;
                color.array[a] = petalA;
            }

            const {x, y, z} = this.flower.mesh.position;

            tail.mesh.position.set(x, y, z);
            tails.push(tail);
            this.tailMeshGroup.add(tail.mesh);
        }
        return tails;
    }

    update(frameRateFactor) {
        if (!this.isExplode) {
            this.drawTail(frameRateFactor);
        } else {
            this.flower.update(this.gravity, frameRateFactor);

            const {position: flowerGeometory} = this.flower.mesh.geometry.attributes;

            for (let i = 0, l = this.tails.length; i < l; i++) {
                const tail = this.tails[i];
                tail.update(this.gravity, frameRateFactor);
                const {x, y, z} = getOffsetXYZ(i);
                const flowerPos = new Vector3(
                    flowerGeometory.array[x],
                    flowerGeometory.array[y],
                    flowerGeometory.array[z]
                );
                const {position, velocity} = tail.mesh.geometry.attributes;

                for (let k = 0; k < position.count; k++) {
                    const {x, y, z} = getOffsetXYZ(k);
                    const desiredVelocity = new Vector3();
                    const tailPos = new Vector3(position.array[x], position.array[y], position.array[z]);
                    const tailVel = new Vector3(velocity.array[x], velocity.array[y], velocity.array[z]);

                    desiredVelocity.subVectors(flowerPos, tailPos);

                    const steer = desiredVelocity.sub(tailVel);

                    steer.normalize();
                    steer.multiplyScalar(Math.random() * 0.0003 * this.life * this.scale * frameRateFactor);
                    velocity.array[x] += steer.x;
                    velocity.array[y] += steer.y;
                    velocity.array[z] += steer.z;
                }
                velocity.needsUpdate = true;
            }

            if (this.life > 0) {
                this.life -= 1.2 * frameRateFactor;
            }
        }
    }

}

class FireworksLayer {

    constructor(options) {
        const me = this;
        let lastTick = performance.now();

        me.id = options.id;
        me.type = 'three';
        me.lightColor = 'white';
        me.fireworksInstances = {};

        const repeat = () => {
            const now = performance.now();

            me.tick((now - lastTick) / (1000 / 60));
            lastTick = now;
            requestAnimationFrame(repeat);
        };

        repeat();
    }

    onAdd(map, context) {
        const me = this;

        me.map = map;
        me.scene = context.scene;
    }

    tick(frameRateFactor) {
        const {fireworksInstances, scene} = this;

        for (const key of Object.keys(fireworksInstances)) {
            const instances = fireworksInstances[key];
            const exploadedIndexList = [];

            for (let i = instances.length - 1; i >= 0; i--) {
                const instance = instances[i];

                instance.update(frameRateFactor);
                if (instance.isExplode) {
                    exploadedIndexList.push(i);
                }
            }

            for (let i = 0, l = exploadedIndexList.length; i < l; i++) {
                const index = exploadedIndexList[i];
                const instance = instances[index];

                if (!instance) {
                    return;
                }

                /*
                    Be careful because js heap size will continue to increase unless you do the following:
                    - Remove unuse mesh from scene
                    - Execute dispose method of Geometres and Materials in the Mesh
                */
                instance.meshGroup.remove(instance.seed.mesh);
                instance.seed.disposeAll();
                if (instance.life <= 0) {
                    scene.remove(instance.meshGroup);
                    if (instance.tailMeshGroup) {
                        instance.tails.forEach(v => {
                            v.disposeAll();
                        });
                    }
                    instance.flower.disposeAll();
                    instances.splice(index, 1);
                }
            }
        }
    }

    launchFireWorks(key, lngLat) {
        const me = this;
        const {map, scene, fireworksInstances} = me;
        let instances = fireworksInstances[key];

        if (!instances) {
            instances = me.fireworksInstances[key] = [];
        }

        if (instances.length > 5) {
            return;
        }

        const modelPosition = map.getModelPosition(lngLat);
        const modelScale = map.getModelScale();
        const scale = Math.pow(2, 17 - clamp(map.getZoom(), 14, 16)) * modelScale;
        const position = {
            x: modelPosition.x + (Math.random() * 400 - 200) * modelScale,
            y: modelPosition.y + (Math.random() * 400 - 200) * modelScale
        };
        const fw = Math.random() > 0.5 ? new BasicFireWorks(scale, position) : new RichFireWorks(scale, position);

        instances.push(fw);
        scene.add(fw.meshGroup);
    }

}

class FireworksControl {

    constructor(options) {
        const me = this,
            {lang, clock, eventHandler} = options;

        me._lang = lang;
        me._clock = clock;
        me._dict = {
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
