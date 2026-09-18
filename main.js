import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8fafc); 

// Camera setup (Z is up, isometric view)
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.up.set(0, 0, 1); 

// Zoomed out slightly to prevent Z-axis clipping and fit 2x2x2 supercell
const defaultCameraPos = new THREE.Vector3(4.5, 4.5, 4.5);
const defaultTarget = new THREE.Vector3(0.5, 0.5, 0.5);
camera.position.copy(defaultCameraPos);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.copy(defaultTarget);
controls.minDistance = 1;
controls.maxDistance = 15;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight2.position.set(-5, -2, -7);
scene.add(dirLight2);

// --- State Variables ---
let currentSystem = 'none';
let currentStyle = 'ball'; // 'ball' or 'space'
let currentTiling = 1; // 1 or 2
let drawModeActive = false;

// Grouping
const atomsGroup = new THREE.Group();
scene.add(atomsGroup);
const cellLinesGroup = new THREE.Group();
scene.add(cellLinesGroup);
const interactGroup = new THREE.Group();
scene.add(interactGroup);
const interactSpheres = [];
let selectedSpheres = [];

// Static Geometry (Axes & Origin)
const originGeo = new THREE.SphereGeometry(0.04, 16, 16);
const originMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
const originMesh = new THREE.Mesh(originGeo, originMat);
scene.add(originMesh);

let axesGroup = new THREE.Group();
scene.add(axesGroup);

function createLabelSprite(text, position, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = colorHex;
    ctx.font = 'bold 84px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(0.3, 0.3, 0.3);
    sprite.renderOrder = 999;
    return sprite;
}

function updateAxes() {
    axesGroup.clear();
    const axisLength = Math.max(1.6, currentTiling + 0.6);
    const headLength = 0.15;
    const headWidth = 0.08;
    const origin = new THREE.Vector3(0, 0, 0);

    const colorX = 0xef4444, colorY = 0x22c55e, colorZ = 0x3b82f6;

    const dirX = fracToCartesian(1, 0, 0).normalize();
    const dirY = fracToCartesian(0, 1, 0).normalize();
    const dirZ = fracToCartesian(0, 0, 1).normalize();

    axesGroup.add(new THREE.ArrowHelper(dirX, origin, axisLength, colorX, headLength, headWidth));
    axesGroup.add(new THREE.ArrowHelper(dirY, origin, axisLength, colorY, headLength, headWidth));
    axesGroup.add(new THREE.ArrowHelper(dirZ, origin, axisLength, colorZ, headLength, headWidth));

    axesGroup.add(createLabelSprite('X', dirX.clone().multiplyScalar(axisLength + 0.1), '#ef4444'));
    axesGroup.add(createLabelSprite('Y', dirY.clone().multiplyScalar(axisLength + 0.1), '#22c55e'));
    axesGroup.add(createLabelSprite('Z', dirZ.clone().multiplyScalar(axisLength + 0.1), '#3b82f6'));
}

// --- Crystal Structure Logic ---
const crystalData = {
    'sc': { name: 'Simple Cubic (SC)', atoms: 1, cn: 6, apf: '52.4%', r: 'a/2', rVal: 0.5 },
    'bcc': { name: 'Body-Centered Cubic (BCC)', atoms: 2, cn: 8, apf: '68.0%', r: 'a√3/4', rVal: Math.sqrt(3)/4 },
    'fcc': { name: 'Face-Centered Cubic (FCC)', atoms: 4, cn: 12, apf: '74.0%', r: 'a√2/4', rVal: Math.sqrt(2)/4 },
    'hcp': { name: 'Hexagonal Close-Packed (HCP)', atoms: 2, cn: 12, apf: '74.0%', r: 'a/2', rVal: 0.5 }
};

const defaultSphereMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 });
const selectedSphereMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });


function fracToCartesian(u, v, w) {
    if (currentSystem === 'hcp') {
        const c_over_a = 1.633;
        const x = u - v * 0.5;
        const y = v * Math.sqrt(3) / 2;
        const z = w * c_over_a;
        return new THREE.Vector3(x, y, z);
    }
    return new THREE.Vector3(u, v, w);
}
function rebuildCrystal() {
    atomsGroup.clear();
    cellLinesGroup.clear();
    interactGroup.clear();
    interactSpheres.length = 0;
    selectedSpheres = [];

    const S = currentTiling;

    // Build Cell Wireframes
    const lineMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1, transparent: true, opacity: 0.8 });
    if (currentSystem === 'hcp') {
        for (let z=0; z<S; z++) {
            // Draw Hexagon base and top
            [0, 1].forEach(dz => {
                const hexPts = [
                    [1,0,z+dz], [0,1,z+dz], [-1,1,z+dz], [-1,0,z+dz], [0,-1,z+dz], [1,-1,z+dz], [1,0,z+dz]
                ];
                const linePts = hexPts.map(p => fracToCartesian(p[0], p[1], p[2]));
                const geo = new THREE.BufferGeometry().setFromPoints(linePts);
                cellLinesGroup.add(new THREE.Line(geo, lineMat));
            });
            // Draw 6 vertical pillars
            const pillars = [[1,0], [0,1], [-1,1], [-1,0], [0,-1], [1,-1]];
            pillars.forEach(p => {
                const p1 = fracToCartesian(p[0], p[1], z);
                const p2 = fracToCartesian(p[0], p[1], z+1);
                const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                cellLinesGroup.add(new THREE.Line(geo, lineMat));
            });
            // Draw lines to center
            [0, 1].forEach(dz => {
                pillars.forEach(p => {
                    const p1 = fracToCartesian(0, 0, z+dz);
                    const p2 = fracToCartesian(p[0], p[1], z+dz);
                    const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                    cellLinesGroup.add(new THREE.Line(geo, lineMat));
                });
            });
        }
    } else {
        for (let x=0; x<S; x++) {
            for (let y=0; y<S; y++) {
                for (let z=0; z<S; z++) {
                    const pts = [
                        [0,0,0], [1,0,0], [1,1,0], [0,1,0], [0,0,0],
                        [0,0,1], [1,0,1], [1,1,1], [0,1,1], [0,0,1]
                    ];
                    const linePts = pts.map(p => fracToCartesian(x + p[0], y + p[1], z + p[2]));
                    const geo1 = new THREE.BufferGeometry().setFromPoints(linePts);
                    cellLinesGroup.add(new THREE.Line(geo1, lineMat));
                    
                    // vertical pillars
                    [[1,0], [1,1], [0,1]].forEach(p => {
                        const p1 = fracToCartesian(x + p[0], y + p[1], z + 0);
                        const p2 = fracToCartesian(x + p[0], y + p[1], z + 1);
                        const geo2 = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                        cellLinesGroup.add(new THREE.Line(geo2, lineMat));
                    });
                }
            }
        }
    }

    // Build Atoms
    if (currentSystem !== 'none') {
        const rVal = crystalData[currentSystem].rVal;
        const radius = currentStyle === 'space' ? rVal : 0.15;
        const sphereGeo = new THREE.SphereGeometry(radius, 32, 32);
        
        // Use a nice shiny material for atoms
        const atomMat = new THREE.MeshPhysicalMaterial({ 
            color: 0x3b82f6, roughness: 0.3, metalness: 0.2, clearcoat: 0.5
        });

        
        const positions = new Set();
        if (currentSystem === 'hcp') {
            // Draw a proper Hexagonal Prism!
            // The hexagon has 7 atoms on bottom (z=0), 7 on top (z=S), and 3 inside per layer (z=0.5).
            for (let z = 0; z <= S; z++) {
                // Base hexagon atoms (fractional coordinates of primitive cell)
                // Origin
                positions.add(`0,0,${z}`);
                // 6 corners of hexagon
                positions.add(`1,0,${z}`);
                positions.add(`0,1,${z}`);
                positions.add(`-1,1,${z}`);
                positions.add(`-1,0,${z}`);
                positions.add(`0,-1,${z}`);
                positions.add(`1,-1,${z}`);
                
                // 3 inner atoms (at z+0.5)
                if (z < S) {
                    positions.add(`${1/3},${2/3},${z+0.5}`);
                    positions.add(`${-2/3},${1/3},${z+0.5}`);
                    positions.add(`${1/3},${-1/3},${z+0.5}`);
                }
            }
        } else {
            for (let cx = 0; cx <= S; cx++) {
                for (let cy = 0; cy <= S; cy++) {
                    for (let cz = 0; cz <= S; cz++) {
                        positions.add(`${cx},${cy},${cz}`);
                        if (cx < S && cy < S && cz < S) {
                            if (currentSystem === 'bcc') positions.add(`${cx+0.5},${cy+0.5},${cz+0.5}`);
                        }
                        if (currentSystem === 'fcc') {
                            if (cx < S && cy < S) positions.add(`${cx+0.5},${cy+0.5},${cz}`);
                            if (cx < S && cz < S) positions.add(`${cx+0.5},${cy},${cz+0.5}`);
                            if (cy < S && cz < S) positions.add(`${cx},${cy+0.5},${cz+0.5}`);
                        }
                    }
                }
            }
        }

        positions.forEach(posStr => {
            const [u, v, w] = posStr.split(',').map(Number);
            const cart = fracToCartesian(u, v, w);
            const mesh = new THREE.Mesh(sphereGeo, atomMat);
            mesh.position.copy(cart);
            atomsGroup.add(mesh);
        });
        
        // Update Info Panel
        const info = crystalData[currentSystem];
        document.getElementById('info-title').innerText = info.name;
        document.getElementById('info-atoms').innerText = info.atoms;
        document.getElementById('info-cn').innerText = info.cn;
        document.getElementById('info-apf').innerText = info.apf;
        document.getElementById('info-r').innerText = info.r;
        document.getElementById('crystal-info').classList.remove('hidden');
    } else {
        // Just draw dots at corners if no system is selected
        const dotGeo = new THREE.BufferGeometry();
        const pts = [];
        for (let cx = 0; cx <= S; cx++) {
            for (let cy = 0; cy <= S; cy++) {
                for (let cz = 0; cz <= S; cz++) {
                    pts.push(cx, cy, cz);
                }
            }
        }
        dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const dotMat = new THREE.PointsMaterial({ color: 0x64748b, size: 0.05 });
        const dotMesh = new THREE.Points(dotGeo, dotMat);
        atomsGroup.add(dotMesh);
        
        document.getElementById('crystal-info').classList.add('hidden');
    }

    // Build Interactive Spheres for Draw Mode
    const intGeo = new THREE.SphereGeometry(0.04, 16, 16);
    for (let x = 0; x <= S; x += 0.5) {
        for (let y = 0; y <= S; y += 0.5) {
            for (let z = 0; z <= S; z += 0.5) {
                const mesh = new THREE.Mesh(intGeo, defaultSphereMat);
                mesh.position.set(x, y, z);
                mesh.visible = drawModeActive;
                interactGroup.add(mesh);
                interactSpheres.push(mesh);
            }
        }
    }

    updateAxes();
    updatePlane();
    
    // Adjust target to center of supercell
    
    if (currentSystem === 'hcp') {
        controls.target.copy(fracToCartesian(0, 0, S/2));
    } else {
        controls.target.copy(fracToCartesian(S/2, S/2, S/2));
    }
}

// --- Plane Logic ---
let planeMesh = null;
let planeEdges = null;

function getIntersections(h, k, l) {
    if (h === 0 && k === 0 && l === 0) return [];
    
    const S = currentTiling;
    const tx = h < 0 ? 1 : 0;
    const ty = k < 0 ? 1 : 0;
    const tz = l < 0 ? 1 : 0;

    const A = h, B = k, C = l;
    // Scale the plane offset to match the supercell bounding box
    const D = - (h * S * tx + k * S * ty + l * S * tz + S);

    const edgesList = [
        [[0,0,0], [S,0,0]], [[0,0,0], [0,S,0]], [[0,0,0], [0,0,S]],
        [[S,0,0], [S,S,0]], [[S,0,0], [S,0,S]],
        [[0,S,0], [S,S,0]], [[0,S,0], [0,S,S]],
        [[0,0,S], [S,0,S]], [[0,0,S], [0,S,S]],
        [[S,S,0], [S,S,S]], [[S,0,S], [S,S,S]], [[0,S,S], [S,S,S]]
    ];

    const points = [];
    const eps = 1e-5;

    edgesList.forEach(edge => {
        const p1 = new THREE.Vector3(...edge[0]);
        const p2 = new THREE.Vector3(...edge[1]);
        const v1 = A * p1.x + B * p1.y + C * p1.z + D;
        const v2 = A * p2.x + B * p2.y + C * p2.z + D;

        if (Math.abs(v1) < eps && Math.abs(v2) < eps) {
            points.push(p1.clone(), p2.clone());
        } else if (Math.abs(v1 - v2) > eps) {
            const t = v1 / (v1 - v2);
            if (t >= -eps && t <= 1 + eps) {
                const pt = new THREE.Vector3().lerpVectors(p1, p2, t);
                pt.x = Math.max(0, Math.min(S, pt.x));
                pt.y = Math.max(0, Math.min(S, pt.y));
                pt.z = Math.max(0, Math.min(S, pt.z));
                points.push(pt);
            }
        }
    });

    const uniquePoints = [];
    points.forEach(p => {
        if (!uniquePoints.some(up => up.distanceTo(p) < eps)) uniquePoints.push(p);
    });

    if (uniquePoints.length < 3) return [];

    const center = new THREE.Vector3();
    uniquePoints.forEach(p => center.add(p));
    center.divideScalar(uniquePoints.length);

    const normal = new THREE.Vector3(A, B, C).normalize();
    const u = new THREE.Vector3().subVectors(uniquePoints[0], center).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();

    uniquePoints.sort((a, b) => {
        const vecA = new THREE.Vector3().subVectors(a, center);
        const vecB = new THREE.Vector3().subVectors(b, center);
        return Math.atan2(vecA.dot(v), vecA.dot(u)) - Math.atan2(vecB.dot(v), vecB.dot(u));
    });

    return uniquePoints;
}

function updatePlane() {
    if (planeMesh) scene.remove(planeMesh);
    if (planeEdges) scene.remove(planeEdges);

    const h = parseInt(document.getElementById('h-input').value) || 0;
    const k = parseInt(document.getElementById('k-input').value) || 0;
    const l = parseInt(document.getElementById('l-input').value) || 0;

    const points = getIntersections(h, k, l);

    if (points.length >= 3) {
        const vertices = [];
        for (let i = 1; i < points.length - 1; i++) {
            const p0 = fracToCartesian(points[0].x, points[0].y, points[0].z);
            const pi = fracToCartesian(points[i].x, points[i].y, points[i].z);
            const pn = fracToCartesian(points[i+1].x, points[i+1].y, points[i+1].z);
            vertices.push(p0.x, p0.y, p0.z);
            vertices.push(pi.x, pi.y, pi.z);
            vertices.push(pn.x, pn.y, pn.z);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhysicalMaterial({ 
            color: 0x8b5cf6, transparent: true, opacity: 0.6,
            side: THREE.DoubleSide, roughness: 0.1, metalness: 0.1,
            clearcoat: 1.0, clearcoatRoughness: 0.1
        });

        planeMesh = new THREE.Mesh(geometry, material);
        scene.add(planeMesh);

        const edgePts = [...points, points[0]].map(p => fracToCartesian(p.x, p.y, p.z));
        const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
        planeEdges = new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({ color: 0x5b21b6, linewidth: 2 }));
        scene.add(planeEdges);
    }
}

// --- Interactive Draw Mode Logic ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { let t = b; b = a % b; a = t; }
    return a;
}
function gcd3(a, b, c) { return gcd(a, gcd(b, c)); }

function onMouseClick(event) {
    if (!drawModeActive) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactSpheres);

    if (intersects.length > 0) {
        const clickedSphere = intersects[0].object;
        
        if (selectedSpheres.includes(clickedSphere)) {
            clickedSphere.material = defaultSphereMat;
            selectedSpheres = selectedSpheres.filter(s => s !== clickedSphere);
            return;
        }

        if (selectedSpheres.length === 3) {
            selectedSpheres.forEach(s => s.material = defaultSphereMat);
            selectedSpheres = [];
        }

        clickedSphere.material = selectedSphereMat;
        selectedSpheres.push(clickedSphere);

        if (selectedSpheres.length === 3) {
            const p1 = selectedSpheres[0].position;
            const p2 = selectedSpheres[1].position;
            const p3 = selectedSpheres[2].position;

            const v1 = new THREE.Vector3().subVectors(p2, p1);
            const v2 = new THREE.Vector3().subVectors(p3, p1);
            const n = new THREE.Vector3().crossVectors(v1, v2);

            if (n.lengthSq() < 1e-6) {
                alert("Titik-titik tersebut segaris (collinear). Silakan pilih titik yang membentuk segitiga.");
                selectedSpheres.forEach(s => s.material = defaultSphereMat);
                selectedSpheres = [];
                return;
            }

            let h = Math.round(n.x * 4);
            let k = Math.round(n.y * 4);
            let l = Math.round(n.z * 4);

            const divisor = gcd3(h, k, l);
            if (divisor !== 0) { h /= divisor; k /= divisor; l /= divisor; }

            if (h < 0 || (h === 0 && k < 0) || (h === 0 && k === 0 && l < 0)) {
                h = -h; k = -k; l = -l;
            }

            document.getElementById('h-input').value = h;
            document.getElementById('k-input').value = k;
            document.getElementById('l-input').value = l;

            updatePlane();
        }
    }
}
window.addEventListener('click', onMouseClick);


// --- Event Listeners ---
['h-input', 'k-input', 'l-input'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { if (!drawModeActive) updatePlane(); });
    el.addEventListener('change', () => { if (!drawModeActive) updatePlane(); });
});

document.getElementById('export-btn').addEventListener('click', () => {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.href = renderer.domElement.toDataURL('image/png');
    link.download = `miller_index_${document.getElementById('h-input').value}_${document.getElementById('k-input').value}_${document.getElementById('l-input').value}.png`;
    link.click();
});

document.getElementById('reset-btn').addEventListener('click', () => {
    camera.position.copy(defaultCameraPos);
    controls.target.set(currentTiling/2, currentTiling/2, currentTiling/2);
    controls.update();
});

// Settings Events
document.getElementById('crystal-system').addEventListener('change', (e) => {
    currentSystem = e.target.value;
    rebuildCrystal();
});

const styleBall = document.getElementById('style-ball');
const styleSpace = document.getElementById('style-space');
function setStyle(style) {
    currentStyle = style;
    if (style === 'ball') {
        styleBall.className = "flex-1 py-1 rounded bg-white shadow-sm text-xs font-bold text-blue-600 transition-all";
        styleSpace.className = "flex-1 py-1 rounded text-xs font-bold text-gray-500 hover:text-gray-700 transition-all";
    } else {
        styleSpace.className = "flex-1 py-1 rounded bg-white shadow-sm text-xs font-bold text-blue-600 transition-all";
        styleBall.className = "flex-1 py-1 rounded text-xs font-bold text-gray-500 hover:text-gray-700 transition-all";
    }
    rebuildCrystal();
}
styleBall.addEventListener('click', () => setStyle('ball'));
styleSpace.addEventListener('click', () => setStyle('space'));

const tile1 = document.getElementById('tile-1');
const tile2 = document.getElementById('tile-2');
function setTiling(tiling) {
    currentTiling = tiling;
    if (tiling === 1) {
        tile1.className = "flex-1 py-1 rounded bg-white shadow-sm text-xs font-bold text-blue-600 transition-all";
        tile2.className = "flex-1 py-1 rounded text-xs font-bold text-gray-500 hover:text-gray-700 transition-all";
    } else {
        tile2.className = "flex-1 py-1 rounded bg-white shadow-sm text-xs font-bold text-blue-600 transition-all";
        tile1.className = "flex-1 py-1 rounded text-xs font-bold text-gray-500 hover:text-gray-700 transition-all";
    }
    
    // Adjust camera dynamically for tiling to keep scene in view
    if (tiling === 2) {
        defaultCameraPos.set(6.0, 6.0, 6.0);
    } else {
        defaultCameraPos.set(4.5, 4.5, 4.5);
    }
    camera.position.copy(defaultCameraPos);
    
    rebuildCrystal();
}
tile1.addEventListener('click', () => setTiling(1));
tile2.addEventListener('click', () => setTiling(2));

// Mode Switching Logic
const btnView = document.getElementById('mode-view-btn');
const btnDraw = document.getElementById('mode-draw-btn');
const inputs = [document.getElementById('h-input'), document.getElementById('k-input'), document.getElementById('l-input')];

function setMode(isDraw) {
    drawModeActive = isDraw;
    
    if (isDraw) {
        btnDraw.className = "px-4 py-1.5 rounded-md bg-white shadow-sm text-sm font-bold text-violet-600 transition-all";
        btnView.className = "px-4 py-1.5 rounded-md text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        inputs.forEach(el => { el.disabled = true; el.classList.add('opacity-50', 'bg-gray-100'); });
        interactSpheres.forEach(s => s.visible = true);
        
        document.getElementById('instruction-title').innerText = "Draw Mode";
        document.getElementById('instruction-list').innerHTML = `
            <li><strong>Klik 3 titik</strong> pada grid sel satuan untuk membentuk bidang.</li>
            <li>Sistem akan otomatis menghitung perkalian silang dan menebak Indeks Miller <strong>(h k l)</strong>.</li>
            <li>Titik terpilih akan menjadi <span class="text-red-500 font-bold">Merah</span>.</li>
        `;
    } else {
        btnView.className = "px-4 py-1.5 rounded-md bg-white shadow-sm text-sm font-bold text-violet-600 transition-all";
        btnDraw.className = "px-4 py-1.5 rounded-md text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        inputs.forEach(el => { el.disabled = false; el.classList.remove('opacity-50', 'bg-gray-100'); });
        
        interactSpheres.forEach(s => { s.visible = false; s.material = defaultSphereMat; });
        selectedSpheres = [];
        
        document.getElementById('instruction-title').innerText = "View Mode";
        document.getElementById('instruction-list').innerHTML = `
            <li>Ubah nilai <strong>(h k l)</strong> di atas untuk memvisualisasikan bidang.</li>
            <li>Untuk angka negatif (misal 1̄), ketik <strong>-1</strong>.</li>
            <li><strong>Klik Kiri + Drag</strong> untuk memutar.</li>
            <li>Gunakan menu kanan untuk melihat struktur Atom.</li>
        `;
        
        updatePlane();
    }
}

btnView.addEventListener('click', () => setMode(false));
btnDraw.addEventListener('click', () => setMode(true));


// Resize Handling
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

// Initialization
rebuildCrystal(); // Builds the initial 1x1x1 'none' crystal state, which includes the grid and axes

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();
