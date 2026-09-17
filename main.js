import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8fafc); 

// Camera setup (Z is up, isometric view)
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.up.set(0, 0, 1); 

// Zoomed out slightly to prevent Z-axis clipping
const defaultCameraPos = new THREE.Vector3(3.2, 3.2, 3.2);
const defaultTarget = new THREE.Vector3(0.5, 0.5, 0.5);
camera.position.copy(defaultCameraPos);

// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.copy(defaultTarget);
controls.minDistance = 1;
controls.maxDistance = 10;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
dirLight2.position.set(-5, -2, -7);
scene.add(dirLight2);

// --- Static Geometry ---
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const cubeEdges = new THREE.EdgesGeometry(cubeGeo);
const cubeLines = new THREE.LineSegments(
    cubeEdges, 
    new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1, transparent: true, opacity: 0.8 })
);
cubeLines.position.set(0.5, 0.5, 0.5);
scene.add(cubeLines);

const originGeo = new THREE.SphereGeometry(0.04, 16, 16);
const originMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
const originMesh = new THREE.Mesh(originGeo, originMat);
scene.add(originMesh);

// Axes
const axisLength = 1.6;
const headLength = 0.15;
const headWidth = 0.08;
const origin = new THREE.Vector3(0, 0, 0);

const colorX = 0xef4444; // red
const colorY = 0x22c55e; // green
const colorZ = 0x3b82f6; // blue

const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, axisLength, colorX, headLength, headWidth);
const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, axisLength, colorY, headLength, headWidth);
const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, axisLength, colorZ, headLength, headWidth);
scene.add(arrowX, arrowY, arrowZ);

// Labels
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

// Adjust label position slightly to avoid clipping if it gets too close to edge
scene.add(createLabelSprite('X', new THREE.Vector3(axisLength + 0.1, 0, 0), '#ef4444'));
scene.add(createLabelSprite('Y', new THREE.Vector3(0, axisLength + 0.1, 0), '#22c55e'));
scene.add(createLabelSprite('Z', new THREE.Vector3(0, 0, axisLength + 0.1), '#3b82f6'));

// --- Plane Logic ---
let planeMesh = null;
let planeEdges = null;

function getIntersections(h, k, l) {
    if (h === 0 && k === 0 && l === 0) return [];

    const tx = h < 0 ? 1 : 0;
    const ty = k < 0 ? 1 : 0;
    const tz = l < 0 ? 1 : 0;

    const A = h, B = k, C = l;
    const D = - (h * tx + k * ty + l * tz + 1);

    const edgesList = [
        [[0,0,0], [1,0,0]], [[0,0,0], [0,1,0]], [[0,0,0], [0,0,1]],
        [[1,0,0], [1,1,0]], [[1,0,0], [1,0,1]],
        [[0,1,0], [1,1,0]], [[0,1,0], [0,1,1]],
        [[0,0,1], [1,0,1]], [[0,0,1], [0,1,1]],
        [[1,1,0], [1,1,1]], [[1,0,1], [1,1,1]], [[0,1,1], [1,1,1]]
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
                pt.x = Math.max(0, Math.min(1, pt.x));
                pt.y = Math.max(0, Math.min(1, pt.y));
                pt.z = Math.max(0, Math.min(1, pt.z));
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
            vertices.push(points[0].x, points[0].y, points[0].z);
            vertices.push(points[i].x, points[i].y, points[i].z);
            vertices.push(points[i+1].x, points[i+1].y, points[i+1].z);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhysicalMaterial({ 
            color: 0x8b5cf6, transparent: true, opacity: 0.45,
            side: THREE.DoubleSide, roughness: 0.1, metalness: 0.1,
            clearcoat: 1.0, clearcoatRoughness: 0.1
        });

        planeMesh = new THREE.Mesh(geometry, material);
        scene.add(planeMesh);

        const edgePts = [...points, points[0]];
        const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
        planeEdges = new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({ color: 0x5b21b6, linewidth: 2 }));
        scene.add(planeEdges);
    }
}

// --- Interactive Draw Mode Logic ---
let drawModeActive = false;
const interactGroup = new THREE.Group();
scene.add(interactGroup);
const interactSpheres = [];
let selectedSpheres = [];

// Create a grid of clickable points on the unit cell (step 0.5)
const sphereGeo = new THREE.SphereGeometry(0.04, 16, 16);
const defaultSphereMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 }); // slate-400
const selectedSphereMat = new THREE.MeshBasicMaterial({ color: 0xef4444 }); // red-500

for (let x = 0; x <= 1; x += 0.5) {
    for (let y = 0; y <= 1; y += 0.5) {
        for (let z = 0; z <= 1; z += 0.5) {
            // Skip the origin if you want, but it's fine to keep it
            const mesh = new THREE.Mesh(sphereGeo, defaultSphereMat);
            mesh.position.set(x, y, z);
            mesh.visible = false;
            interactGroup.add(mesh);
            interactSpheres.push(mesh);
        }
    }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { let t = b; b = a % b; a = t; }
    return a;
}

function gcd3(a, b, c) {
    return gcd(a, gcd(b, c));
}

function onMouseClick(event) {
    if (!drawModeActive) return;

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactSpheres);

    if (intersects.length > 0) {
        const clickedSphere = intersects[0].object;
        
        // If already selected, deselect it
        if (selectedSpheres.includes(clickedSphere)) {
            clickedSphere.material = defaultSphereMat;
            selectedSpheres = selectedSpheres.filter(s => s !== clickedSphere);
            return;
        }

        // If we already have 3, clear them for a new selection
        if (selectedSpheres.length === 3) {
            selectedSpheres.forEach(s => s.material = defaultSphereMat);
            selectedSpheres = [];
        }

        clickedSphere.material = selectedSphereMat;
        selectedSpheres.push(clickedSphere);

        // If we now have 3 points, calculate Miller Indices!
        if (selectedSpheres.length === 3) {
            const p1 = selectedSpheres[0].position;
            const p2 = selectedSpheres[1].position;
            const p3 = selectedSpheres[2].position;

            const v1 = new THREE.Vector3().subVectors(p2, p1);
            const v2 = new THREE.Vector3().subVectors(p3, p1);
            const n = new THREE.Vector3().crossVectors(v1, v2);

            if (n.lengthSq() < 1e-6) {
                // Collinear points, invalid plane
                alert("The selected 3 points are in a straight line. Please select points that form a triangle.");
                selectedSpheres.forEach(s => s.material = defaultSphereMat);
                selectedSpheres = [];
                return;
            }

            // Normal vector components are proportional to Miller Indices.
            // Since our grid is in steps of 0.5, cross product components are multiples of 0.25.
            // Multiply by 4 and round to get integers.
            let h = Math.round(n.x * 4);
            let k = Math.round(n.y * 4);
            let l = Math.round(n.z * 4);

            // Normalize by greatest common divisor
            const divisor = gcd3(h, k, l);
            if (divisor !== 0) {
                h /= divisor;
                k /= divisor;
                l /= divisor;
            }

            // By convention, we often make the first non-zero index positive.
            if (h < 0 || (h === 0 && k < 0) || (h === 0 && k === 0 && l < 0)) {
                h = -h; k = -k; l = -l;
            }

            // Update UI inputs
            document.getElementById('h-input').value = h;
            document.getElementById('k-input').value = k;
            document.getElementById('l-input').value = l;

            // Trigger plane redraw
            updatePlane();
        }
    }
}
window.addEventListener('click', onMouseClick);


// --- UI Event Listeners ---
['h-input', 'k-input', 'l-input'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
        if (!drawModeActive) updatePlane();
    });
    el.addEventListener('change', () => {
        if (!drawModeActive) updatePlane();
    });
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
    controls.target.copy(defaultTarget);
    controls.update();
});

// Mode Switching Logic
const btnView = document.getElementById('mode-view-btn');
const btnDraw = document.getElementById('mode-draw-btn');
const inputs = [document.getElementById('h-input'), document.getElementById('k-input'), document.getElementById('l-input')];

function setMode(isDraw) {
    drawModeActive = isDraw;
    
    if (isDraw) {
        // Draw Mode active
        btnDraw.className = "px-4 py-1.5 rounded-md bg-white shadow-sm text-sm font-bold text-violet-600 transition-all";
        btnView.className = "px-4 py-1.5 rounded-md text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        
        // Disable inputs
        inputs.forEach(el => el.disabled = true);
        inputs.forEach(el => el.classList.add('opacity-50', 'bg-gray-100'));
        
        // Show interactive spheres
        interactSpheres.forEach(s => s.visible = true);
        
        // Update Instructions
        document.getElementById('instruction-title').innerText = "Draw Mode";
        document.getElementById('instruction-list').innerHTML = `
            <li><strong>Click 3 points</strong> on the grid to define a plane.</li>
            <li>The system will automatically guess the Miller Indices <strong>(h k l)</strong>.</li>
            <li>Selected points will turn <span class="text-red-500 font-bold">Red</span>.</li>
        `;
    } else {
        // View Mode active
        btnView.className = "px-4 py-1.5 rounded-md bg-white shadow-sm text-sm font-bold text-violet-600 transition-all";
        btnDraw.className = "px-4 py-1.5 rounded-md text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        
        // Enable inputs
        inputs.forEach(el => el.disabled = false);
        inputs.forEach(el => el.classList.remove('opacity-50', 'bg-gray-100'));
        
        // Hide interactive spheres and clear selection
        interactSpheres.forEach(s => {
            s.visible = false;
            s.material = defaultSphereMat;
        });
        selectedSpheres = [];
        
        // Update Instructions
        document.getElementById('instruction-title').innerText = "View Mode";
        document.getElementById('instruction-list').innerHTML = `
            <li>Change <strong>(h k l)</strong> values to visualize planes.</li>
            <li>For negative indices (e.g. 1̄), use <strong>-1</strong></li>
            <li><strong>Left Click + Drag</strong> to rotate.</li>
            <li><strong>Scroll</strong> to zoom in/out.</li>
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
updatePlane();

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();
