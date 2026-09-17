import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { evaluateWavefunction } from './quantumMath.js';

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(20, 15, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 15);
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight2.position.set(-10, -10, -15);
scene.add(dirLight2);

// --- Axes ---
const axesHelper = new THREE.AxesHelper(10);
scene.add(axesHelper);

// --- Marching Cubes Setup ---
let resolution = 40; // grid resolution
const materialPositive = new THREE.MeshStandardMaterial({ 
    color: 0x3b82f6, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 
});
const materialNegative = new THREE.MeshStandardMaterial({ 
    color: 0xef4444, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 
});

let effectPositive = new MarchingCubes(resolution, materialPositive, true, true, 100000);
let effectNegative = new MarchingCubes(resolution, materialNegative, true, true, 100000);
effectPositive.position.set(0, 0, 0);
effectNegative.position.set(0, 0, 0);

// Scale grid to a reasonable spatial size (e.g., from -10 to 10 in all directions)
const extent = 10.0; 
effectPositive.scale.set(extent, extent, extent);
effectNegative.scale.set(extent, extent, extent);

scene.add(effectPositive);
scene.add(effectNegative);

let currentType = '1s';
let isovalue = 0.05;
let showPhase = true;

function updateIsoSurface() {
    effectPositive.reset();
    effectNegative.reset();
    
    // Marching cubes field is a 1D array of size resolution^3
    // We map [0, resolution-1] to [-extent, extent]
    
    // We can directly fill the field array of the MarchingCubes object.
    // Three.js MarchingCubes uses an internal field array.
    // But setting it manually is done by accessing `effect.field`.
    
    let index = 0;
    for ( let k = 0; k < resolution; k ++ ) {
        const z = -extent + (2.0 * extent * k) / (resolution - 1);
        for ( let j = 0; j < resolution; j ++ ) {
            const y = -extent + (2.0 * extent * j) / (resolution - 1);
            for ( let i = 0; i < resolution; i ++ ) {
                const x = -extent + (2.0 * extent * i) / (resolution - 1);
                
                // Evaluate wave function at (x,y,z)
                const psi = evaluateWavefunction(currentType, x, y, z);
                
                // Probability density is proportional to psi^2, but to capture phase, 
                // we often just look at magnitude |psi| or map psi to field.
                // Standard convention: 
                // Positive lobe: psi > isovalue
                // Negative lobe: psi < -isovalue
                
                // Marching cubes draws surface where field == isolation value.
                // The three.js implementation adds fields and draws where field > isolation.
                
                // For positive lobe, we want field to be |psi| if psi > 0, else 0
                const posVal = psi > 0 ? psi : 0;
                // For negative lobe, we want field to be |psi| if psi < 0, else 0
                const negVal = psi < 0 ? -psi : 0;
                
                effectPositive.field[index] = posVal;
                effectNegative.field[index] = negVal;
                index++;
            }
        }
    }
    
    // We must pass the isovalue threshold manually (since we bypass addBall)
    // Three.js update logic extracts the mesh based on isolation.
    // Wait, three.js MarchingCubes extracts when we call render?
    // Actually, `isolation` is a property of the MarchingCubes object.
    effectPositive.isolation = isovalue;
    effectNegative.isolation = isovalue;
    
    // Trigger geometry rebuild
    effectPositive.update();
    effectNegative.update();
}


// --- UI Events ---
document.getElementById('orbital-select').addEventListener('change', (e) => {
    currentType = e.target.value;
    updateIsoSurface();
    
    // Update Info Panel
    document.getElementById('info-title').innerHTML = `${currentType} Orbital <span class="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-mono">Quantum Info</span>`;
});

document.getElementById('iso-slider').addEventListener('input', (e) => {
    isovalue = parseFloat(e.target.value);
    document.getElementById('iso-value-display').innerText = isovalue.toFixed(3);
    updateIsoSurface();
});

document.getElementById('phase-toggle').addEventListener('change', (e) => {
    showPhase = e.target.checked;
    effectNegative.visible = showPhase;
});

// Initialize
updateIsoSurface();

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();
