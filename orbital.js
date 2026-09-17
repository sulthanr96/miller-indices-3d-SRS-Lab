import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { evaluateWavefunction, evaluateHybridization } from './quantumMath.js';

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.up.set(0, 0, 1);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 15, 20);
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight2.position.set(-10, -15, -10);
scene.add(dirLight2);

// --- Axes & Labels ---
const axesHelper = new THREE.AxesHelper(15);
scene.add(axesHelper);

function createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(4, 4, 4);
    return sprite;
}

const xLabel = createTextSprite('X', '#ff4444');
xLabel.position.set(16, 0, 0);
scene.add(xLabel);

const yLabel = createTextSprite('Y', '#44ff44');
yLabel.position.set(0, 16, 0);
scene.add(yLabel);

const zLabel = createTextSprite('Z', '#4444ff');
zLabel.position.set(0, 0, 16);
scene.add(zLabel);

// --- Marching Cubes Setup ---
let resolution = 35; // slightly lower for smooth auto-animation
const materialPositive = new THREE.MeshStandardMaterial({ 
    color: 0x3b82f6, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 
});
const materialNegative = new THREE.MeshStandardMaterial({ 
    color: 0xef4444, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 
});

let effectPositive = new MarchingCubes(resolution, materialPositive, true, true, 100000);
let effectNegative = new MarchingCubes(resolution, materialNegative, true, true, 100000);

const extent = 15.0; 
effectPositive.scale.set(extent, extent, extent);
effectNegative.scale.set(extent, extent, extent);

scene.add(effectPositive);
scene.add(effectNegative);

let isHybridMode = false;
let currentAtomic = '1s';
let currentHybrid = 'sp';
let isovalue = 0.05;
let mixValue = 0.0;
let showPhase = true;

const hybridInfos = {
    'sp': { name: 'sp Hybridization', desc: 'Linear geometry. 180° bond angle. Example: BeCl₂.', angle: '180°' },
    'sp2': { name: 'sp² Hybridization', desc: 'Trigonal planar geometry. 120° bond angle. Example: BF₃.', angle: '120°' },
    'sp3': { name: 'sp³ Hybridization', desc: 'Tetrahedral geometry. 109.5° bond angle. Example: CH₄.', angle: '109.5°' }
};

function updateIsoSurface() {
    effectPositive.reset();
    effectNegative.reset();
    
    let index = 0;
    for ( let k = 0; k < resolution; k ++ ) {
        const z = -extent + (2.0 * extent * k) / (resolution - 1);
        for ( let j = 0; j < resolution; j ++ ) {
            const y = -extent + (2.0 * extent * j) / (resolution - 1);
            for ( let i = 0; i < resolution; i ++ ) {
                const x = -extent + (2.0 * extent * i) / (resolution - 1);
                
                let maxPos = 0;
                let maxNeg = 0;

                if (!isHybridMode) {
                    const psi = evaluateWavefunction(currentAtomic, x, y, z);
                    maxPos = psi > 0 ? psi : 0;
                    maxNeg = psi < 0 ? -psi : 0;
                } else {
                    const hybrids = evaluateHybridization(currentHybrid, x, y, z, mixValue);
                    // To show all hybrid orbitals together, we take the max probability at this point
                    for (let h of hybrids) {
                        if (h > maxPos) maxPos = h;
                        if (h < -maxNeg) maxNeg = -h;
                    }
                }
                
                effectPositive.field[index] = maxPos;
                effectNegative.field[index] = maxNeg;
                index++;
            }
        }
    }
    
    effectPositive.isolation = isovalue;
    effectNegative.isolation = isovalue;
    
    effectPositive.update();
    effectNegative.update();
}

// --- UI Events ---
document.getElementById('orbital-select').addEventListener('change', (e) => {
    currentAtomic = e.target.value;
    updateIsoSurface();
    document.getElementById('info-title').innerHTML = `${currentAtomic} Orbital <span class="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-mono">Quantum Info</span>`;
    document.getElementById('info-desc').innerText = "Atomic orbital wavefunction probability surface.";
});

document.getElementById('hybrid-select').addEventListener('change', (e) => {
    currentHybrid = e.target.value;
    updateIsoSurface();
    const info = hybridInfos[currentHybrid];
    document.getElementById('info-title').innerHTML = `${info.name} <span class="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-mono">${info.angle}</span>`;
    document.getElementById('info-desc').innerText = info.desc;
});

document.getElementById('mix-slider').addEventListener('input', (e) => {
    mixValue = parseFloat(e.target.value);
    document.getElementById('mix-display').innerText = Math.round(mixValue * 100) + '%';
    updateIsoSurface();
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

document.getElementById('reset-btn').addEventListener('click', () => {
    camera.position.set(15, 12, 15);
    controls.target.set(0, 0, 0);
    controls.update();
});

// Mode Switching
const btnAtomic = document.getElementById('mode-atomic-btn');
const btnHybrid = document.getElementById('mode-hybrid-btn');
const panelAtomic = document.getElementById('atomic-controls');
const panelHybrid = document.getElementById('hybrid-controls');

function setMode(isHybrid) {
    isHybridMode = isHybrid;
    if (isHybrid) {
        btnHybrid.className = "px-3 py-1.5 md:px-4 rounded-md bg-slate-800 shadow-sm text-xs md:text-sm font-bold text-blue-400 transition-all";
        btnAtomic.className = "px-3 py-1.5 md:px-4 rounded-md text-xs md:text-sm font-bold text-slate-400 hover:text-slate-200 transition-all";
        panelHybrid.classList.remove('hidden');
        panelAtomic.classList.add('hidden');
        
        // Trigger select event to update info panel
        document.getElementById('hybrid-select').dispatchEvent(new Event('change'));
    } else {
        btnAtomic.className = "px-3 py-1.5 md:px-4 rounded-md bg-slate-800 shadow-sm text-xs md:text-sm font-bold text-blue-400 transition-all";
        btnHybrid.className = "px-3 py-1.5 md:px-4 rounded-md text-xs md:text-sm font-bold text-slate-400 hover:text-slate-200 transition-all";
        panelAtomic.classList.remove('hidden');
        panelHybrid.classList.add('hidden');
        
        document.getElementById('orbital-select').dispatchEvent(new Event('change'));
    }
}

btnAtomic.addEventListener('click', () => setMode(false));
btnHybrid.addEventListener('click', () => setMode(true));


// Initialize
updateIsoSurface();

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

let mixDirection = 1;
let lastTime = 0;

function animate(time) {
    requestAnimationFrame(animate);
    
    // Auto-animate hybridization if in hybrid mode
    if (isHybridMode) {
        const dt = time - lastTime;
        if (dt > 16) { // throttle slightly for performance
            mixValue += mixDirection * 0.01;
            if (mixValue >= 1.0) { mixValue = 1.0; mixDirection = -1; }
            if (mixValue <= 0.0) { mixValue = 0.0; mixDirection = 1; }
            
            document.getElementById('mix-slider').value = mixValue;
            document.getElementById('mix-display').innerText = Math.round(mixValue * 100) + '%';
            
            updateIsoSurface();
            lastTime = time;
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);
