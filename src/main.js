// src/main.js

import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import './style.css';

// ----------------------
// Scene & Camera
// ----------------------
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 10, 10);
scene.add(dirLight);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 0, 700);
camera.lookAt(0, 0, 0);

// ----------------------
// Renderer + Composer
// ----------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x000000, 0);
document.getElementById('canvas-container').appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  parseFloat(document.getElementById('glowSlider').value),
  0.7,
  0.3
);
composer.addPass(bloomPass);

// ----------------------
// Orbit Controls (limited auto-rotate)
// ----------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.minAzimuthAngle = -Math.PI * 0.25;
controls.maxAzimuthAngle = Math.PI * 0.25;
controls.minPolarAngle = Math.PI / 2 - 0.5; // wider vertical range
controls.maxPolarAngle = Math.PI / 2 + 0.5; // wider vertical range
controls.enableZoom = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.2;

// ----------------------
// Controls Elements
// ----------------------
const glowSlider   = document.getElementById('glowSlider');
const glowValue    = document.getElementById('glowValue');
const scaleSlider  = document.getElementById('scaleSlider');
const scaleValue   = document.getElementById('scaleValue');
const noiseSlider  = document.getElementById('noiseRadiusSlider');
const noiseValue   = document.getElementById('noiseRadiusValue');
const colorPicker  = document.getElementById('colorPicker');
const bgPicker     = document.getElementById('bgPicker');
const switchButton = document.getElementById('switchModel');

glowValue.textContent  = parseFloat(glowSlider.value).toFixed(2);
scaleValue.textContent = parseFloat(scaleSlider.value).toFixed(1);
noiseValue.textContent = noiseSlider.value;

// ----------------------
// Parameters
// ----------------------
const PARTICLE_COUNT   = 50000;
let INITIAL_SIZE       = parseFloat(scaleSlider.value) || 1.0;
const BASE_SPEED       = 0.1;
const MIN_DISTANCE     = 1;
const MAX_DISTANCE     = 50;
let defaultNoiseRadius = parseFloat(noiseSlider.value) || 50;
let MOUSE_NOISE_RADIUS = defaultNoiseRadius;
const RETURN_SPRING    = 15.0;

// Ripple & Noise
const RIPPLE_DURATION = 0.5;
let rippleTime        = 0;
let isRippling        = false;
let rippleMaxRadius   = defaultNoiseRadius;
const noiseGen        = new ImprovedNoise();
const NOISE_INTENSITY = 5.0;
function onClickRipple() {
  rippleTime      = 0;
  isRippling      = true;
  rippleMaxRadius = defaultNoiseRadius * INITIAL_SIZE * 2;
}
document.addEventListener('click', onClickRipple);

// ----------------------
// Buffers & Geometry
// ----------------------
const positions         = new Float32Array(PARTICLE_COUNT * 3);
const velocities        = new Float32Array(PARTICLE_COUNT * 3);
const distances         = new Float32Array(PARTICLE_COUNT);
const maxDistances      = new Float32Array(PARTICLE_COUNT);
const originalPositions = new Float32Array(PARTICLE_COUNT * 3);
let sizes               = new Float32Array(PARTICLE_COUNT).fill(INITIAL_SIZE);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

// ----------------------
// Shaders & Materials
// ----------------------
const vertexShader = `
  attribute float aSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize;
  }
`;
const fragmentShader = `
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor, 1.0);
  }
`;
const baseMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color('#ffffff') } },
  vertexShader,
  fragmentShader
});
const glowTexture = new THREE.TextureLoader().load('/textures/glow.png');
const glowMaterial = new THREE.PointsMaterial({
  sizeAttenuation: true,
  map: glowTexture,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
  color: '#ffffff'
});

// ----------------------
// Points
// ----------------------
const baseParticles = new THREE.Points(geometry, baseMaterial);
const glowParticles = new THREE.Points(geometry, glowMaterial);
scene.add(baseParticles, glowParticles);

// ----------------------
// Spawn Points & Model Loading
// ----------------------
let spawnPoints = [];
const intersectionPoint = new THREE.Vector3();
const modelPaths  = ['/models/yourModel.gltf', '/models/macchina.gltf'];
const modelScales = [5, 180];
let currentModelIndex = 0;
const gltfLoader = new GLTFLoader();

function resetParticle(i) {
  const idx3 = i * 3;
  const pIdx = Math.floor(Math.random() * spawnPoints.length);
  const p    = spawnPoints[pIdx];
  positions[idx3]   = p.x;
  positions[idx3+1] = p.y;
  positions[idx3+2] = p.z;
  originalPositions[idx3]   = p.x;
  originalPositions[idx3+1] = p.y;
  originalPositions[idx3+2] = p.z;
  // random direction in XY and slight Z component
  const dir = new THREE.Vector3(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1
  ).normalize();
  velocities[idx3]   = dir.x * BASE_SPEED;
  velocities[idx3+1] = dir.y * BASE_SPEED;
  velocities[idx3+2] = dir.z * BASE_SPEED;
  distances[i]        = 0;
  maxDistances[i]     = MIN_DISTANCE + Math.pow(Math.random(), 3) * (MAX_DISTANCE - MIN_DISTANCE);
  sizes[i]            = INITIAL_SIZE;
}

function loadSpawnPoints(path) {
  spawnPoints = [];
  gltfLoader.load(
    path,
    (gltf) => {
      const logo = gltf.scene;
      const s    = modelScales[currentModelIndex];
      logo.scale.set(s, s, s);
      const bbox = new THREE.Box3().setFromObject(logo);
      const center = bbox.getCenter(new THREE.Vector3());
      logo.position.sub(center);
      logo.updateMatrixWorld(true);
      logo.traverse((child) => {
        if (child.isMesh && child.geometry.attributes.position) {
          const posAttr = child.geometry.attributes.position;
          const wm = child.matrixWorld;
          for (let i = 0; i < posAttr.count; i++) {
            const p = new THREE.Vector3()
              .fromBufferAttribute(posAttr, i)
              .applyMatrix4(wm);
            spawnPoints.push(p);
          }
        }
      });
      for (let i = 0; i < PARTICLE_COUNT; i++) resetParticle(i);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate    = true;
    },
    undefined,
    (err) => console.error(err)
  );
}

loadSpawnPoints(modelPaths[currentModelIndex]);
switchButton.addEventListener('click', () => {
  currentModelIndex = (currentModelIndex + 1) % modelPaths.length;
  loadSpawnPoints(modelPaths[currentModelIndex]);
});

// ----------------------
// Resize
// ----------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------
// Mouse Tracking
// ----------------------
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
const plane     = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(plane, intersectionPoint);
});

// ----------------------
// UI Handlers
// ----------------------
scaleSlider.addEventListener('input', (e) => {
  INITIAL_SIZE = parseFloat(e.target.value);
  scaleValue.textContent  = INITIAL_SIZE.toFixed(1);
  sizes.fill(INITIAL_SIZE);
  geometry.attributes.aSize.needsUpdate = true;
});

glowSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  bloomPass.strength = val;
  glowValue.textContent = val.toFixed(2);
});

noiseSlider.addEventListener('input', (e) => {
  defaultNoiseRadius = parseFloat(e.target.value);
  noiseValue.textContent = defaultNoiseRadius;
  if (!isRippling) MOUSE_NOISE_RADIUS = defaultNoiseRadius;
});

colorPicker.addEventListener('input', (e) => {
  baseMaterial.uniforms.uColor.value.set(e.target.value);
  glowMaterial.color.set(e.target.value);
});

bgPicker.addEventListener('input', (e) => {
  const newColor = e.target.value;
  scene.background = new THREE.Color(newColor);
  renderer.setClearColor(new THREE.Color(newColor), 1);
});

// ----------------------
// Animate Loop
// ----------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  controls.update();

  // ripple timing
  if (isRippling) {
    rippleTime += delta;
    const t = rippleTime / RIPPLE_DURATION;
    if (t <= 1) {
      MOUSE_NOISE_RADIUS = defaultNoiseRadius +
        (rippleMaxRadius - defaultNoiseRadius) * Math.sin(Math.PI * t);
    } else {
      isRippling = false;
      MOUSE_NOISE_RADIUS = defaultNoiseRadius;
    }
  }

  if (spawnPoints.length) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx3 = i * 3;
      // compute distances in 3D from interaction point on plane z=0
      const dx = positions[idx3]   - intersectionPoint.x;
      const dy = positions[idx3+1] - intersectionPoint.y;
      const dz = positions[idx3+2] - 0;
      const dist3d = Math.hypot(dx, dy, dz);

      // ripple & noise affects all axes
      if (isRippling && dist3d < MOUSE_NOISE_RADIUS) {
        const n = noiseGen.noise(
          positions[idx3] * 0.02,
          positions[idx3+1] * 0.02,
          positions[idx3+2] * 0.02 + rippleTime * 10
        );
        velocities[idx3]   += Math.cos(n * Math.PI * 2) * NOISE_INTENSITY * INITIAL_SIZE;
        velocities[idx3+1] += Math.sin(n * Math.PI * 2) * NOISE_INTENSITY * INITIAL_SIZE;
        velocities[idx3+2] += Math.cos(n * Math.PI * 2) * NOISE_INTENSITY * INITIAL_SIZE;
      }

      // repulsion from interaction point
      if (dist3d < MOUSE_NOISE_RADIUS) {
        const rx = dx / dist3d;
        const ry = dy / dist3d;
        const rz = dz / dist3d;
        const strength = 2.0 * INITIAL_SIZE;
        velocities[idx3]   += rx * strength;
        velocities[idx3+1] += ry * strength;
        velocities[idx3+2] += rz * strength;
      }

      // damping
      velocities[idx3]   *= 0.99;
      velocities[idx3+1] *= 0.99;
      velocities[idx3+2] *= 0.99;

      // spring back to original in all axes
      velocities[idx3]   += (originalPositions[idx3]   - positions[idx3])   * RETURN_SPRING * delta;
      velocities[idx3+1] += (originalPositions[idx3+1] - positions[idx3+1]) * RETURN_SPRING * delta;
      velocities[idx3+2] += (originalPositions[idx3+2] - positions[idx3+2]) * RETURN_SPRING * delta;

      // update positions
      positions[idx3]   += velocities[idx3]   * delta;
      positions[idx3+1] += velocities[idx3+1] * delta;
      positions[idx3+2] += velocities[idx3+2] * delta;

      distances[i] += BASE_SPEED * delta;
      if (distances[i] >= maxDistances[i]) resetParticle(i);
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate    = true;
  }

  composer.render();
}

animate();
