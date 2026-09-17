import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
// Background color to match the tailwind bg-slate-50
scene.background = new THREE.Color(0xf8fafc); 

// Camera setup
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.up.set(0, 0, 1); // Z is up

const defaultCameraPos = new THREE.Vector3(3.0, -2.0, 2.5);
const defaultTarget = new THREE.Vector3(0.5, 0.5, 0.5);
camera.position.copy(defaultCameraPos);

// WebGL Renderer with antialiasing and preserveDrawingBuffer for export
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // limit pixel ratio for performance
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.copy(defaultTarget); // Focus on center of unit cell
controls.minDistance = 1;
controls.maxDistance = 10;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
dirLight2.position.set(-5, -2, -7);
scene.add(dirLight2);

// --- Static Geometry ---

// 1. Unit Cell (Cube) Wireframe
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const cubeEdges = new THREE.EdgesGeometry(cubeGeo);
const cubeLines = new THREE.LineSegments(
    cubeEdges, 
    new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1, transparent: true, opacity: 0.8 }) // slate-400
);
cubeLines.position.set(0.5, 0.5, 0.5); // Center the BoxGeometry so bottom-left-front corner is at (0,0,0)
scene.add(cubeLines);

// 2. Unit Cell Vertices (Points)
const pointsGeo = new THREE.BufferGeometry();
const pts = [];
for(let x=0; x<=1; x++) {
    for(let y=0; y<=1; y++) {
        for(let z=0; z<=1; z++) {
            pts.push(x, y, z);
        }
    }
}
pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
const pointsMat = new THREE.PointsMaterial({ color: 0x64748b, size: 0.04, sizeAttenuation: true }); // slate-500
const pointsMesh = new THREE.Points(pointsGeo, pointsMat);
scene.add(pointsMesh);

// 3. Origin Marker (Black Sphere)
const originGeo = new THREE.SphereGeometry(0.04, 16, 16);
const originMat = new THREE.MeshBasicMaterial({ color: 0x0f172a }); // slate-900
const originMesh = new THREE.Mesh(originGeo, originMat);
scene.add(originMesh);

// 4. Axes (X, Y, Z) using ArrowHelper
const axisLength = 1.6;
const headLength = 0.15;
const headWidth = 0.08;
const origin = new THREE.Vector3(0, 0, 0);

const colorX = 0xef4444; // red-500
const colorY = 0x22c55e; // green-500
const colorZ = 0x3b82f6; // blue-500

const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, axisLength, colorX, headLength, headWidth);
const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, axisLength, colorY, headLength, headWidth);
const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, axisLength, colorZ, headLength, headWidth);
scene.add(arrowX, arrowY, arrowZ);

// 5. Axis Labels (Sprites)
function createLabelSprite(text, position, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Transparent background
    ctx.clearRect(0, 0, 128, 128);
    
    // Draw text
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
    sprite.renderOrder = 999; // Ensure labels render on top
    return sprite;
}

scene.add(createLabelSprite('X', new THREE.Vector3(axisLength + 0.1, 0, 0), '#ef4444'));
scene.add(createLabelSprite('Y', new THREE.Vector3(0, axisLength + 0.1, 0), '#22c55e'));
scene.add(createLabelSprite('Z', new THREE.Vector3(0, 0, axisLength + 0.1), '#3b82f6'));

// --- Plane Generation Logic ---

let planeMesh = null;
let planeEdges = null;

/**
 * Calculates the intersection points of a Miller plane with the unit cube [0,1]^3.
 */
function getIntersections(h, k, l) {
    if (h === 0 && k === 0 && l === 0) return []; // Invalid Miller index

    // To handle negative indices, we conceptually shift the origin of the unit cell
    // such that the plane intersects the shifted axes at positive/negative intercepts appropriately.
    const tx = h < 0 ? 1 : 0;
    const ty = k < 0 ? 1 : 0;
    const tz = l < 0 ? 1 : 0;

    // Plane equation: Ax + By + Cz + D = 0
    const A = h;
    const B = k;
    const C = l;
    const D = - (h * tx + k * ty + l * tz + 1);

    // 12 edges of the unit cube [0,1]^3
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
        
        // Signed distance conceptually (unnormalized)
        const v1 = A * p1.x + B * p1.y + C * p1.z + D;
        const v2 = A * p2.x + B * p2.y + C * p2.z + D;

        if (Math.abs(v1) < eps && Math.abs(v2) < eps) {
            // Entire edge is on the plane
            points.push(p1.clone(), p2.clone());
        } else if (Math.abs(v1 - v2) > eps) {
            // Check if intersection parameter t is between 0 and 1
            const t = v1 / (v1 - v2);
            if (t >= -eps && t <= 1 + eps) {
                const pt = new THREE.Vector3().lerpVectors(p1, p2, t);
                // Clamp coordinates to [0, 1] to fix tiny floating point errors
                pt.x = Math.max(0, Math.min(1, pt.x));
                pt.y = Math.max(0, Math.min(1, pt.y));
                pt.z = Math.max(0, Math.min(1, pt.z));
                points.push(pt);
            }
        }
    });

    // Remove duplicates
    const uniquePoints = [];
    points.forEach(p => {
        const isDuplicate = uniquePoints.some(up => up.distanceTo(p) < eps);
        if (!isDuplicate) uniquePoints.push(p);
    });

    if (uniquePoints.length < 3) return []; // Doesn't form a polygon

    // Sort points radially to form a convex polygon
    const center = new THREE.Vector3();
    uniquePoints.forEach(p => center.add(p));
    center.divideScalar(uniquePoints.length);

    const normal = new THREE.Vector3(A, B, C).normalize();
    const u = new THREE.Vector3().subVectors(uniquePoints[0], center).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();

    uniquePoints.sort((a, b) => {
        const vecA = new THREE.Vector3().subVectors(a, center);
        const vecB = new THREE.Vector3().subVectors(b, center);
        const angleA = Math.atan2(vecA.dot(v), vecA.dot(u));
        const angleB = Math.atan2(vecB.dot(v), vecB.dot(u));
        return angleA - angleB;
    });

    return uniquePoints;
}

/**
 * Re-draws the plane based on input values.
 */
function updatePlane() {
    // Remove old meshes
    if (planeMesh) scene.remove(planeMesh);
    if (planeEdges) scene.remove(planeEdges);

    const hInput = document.getElementById('h-input').value;
    const kInput = document.getElementById('k-input').value;
    const lInput = document.getElementById('l-input').value;
    
    // Parse ints, treat empty or '-' as 0 while typing
    const h = parseInt(hInput === '' || hInput === '-' ? 0 : hInput);
    const k = parseInt(kInput === '' || kInput === '-' ? 0 : kInput);
    const l = parseInt(lInput === '' || lInput === '-' ? 0 : lInput);

    const points = getIntersections(h, k, l);

    if (points.length >= 3) {
        // Create geometry using a triangle fan from the first point
        const vertices = [];
        for (let i = 1; i < points.length - 1; i++) {
            vertices.push(points[0].x, points[0].y, points[0].z);
            vertices.push(points[i].x, points[i].y, points[i].z);
            vertices.push(points[i+1].x, points[i+1].y, points[i+1].z);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();

        // Beautiful glass-like material for the plane
        const material = new THREE.MeshPhysicalMaterial({ 
            color: 0x8b5cf6,       // violet-500
            transparent: true, 
            opacity: 0.45,
            side: THREE.DoubleSide,
            roughness: 0.1,
            metalness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });

        planeMesh = new THREE.Mesh(geometry, material);
        scene.add(planeMesh);

        // Bold edges for the plane polygon
        const edgePts = [...points, points[0]]; // close the loop
        const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
        planeEdges = new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({ 
            color: 0x5b21b6,       // violet-900
            linewidth: 2 
        }));
        scene.add(planeEdges);
    }
}

// --- Event Listeners ---

// Update plane on input changes
['h-input', 'k-input', 'l-input'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', updatePlane);
    el.addEventListener('change', updatePlane);
});

// Export Image feature
document.getElementById('export-btn').addEventListener('click', () => {
    // Force a render to ensure we grab the latest frame
    renderer.render(scene, camera);
    
    // Get Data URL
    const dataURL = renderer.domElement.toDataURL('image/png');
    
    // Construct filename
    const h = document.getElementById('h-input').value || 0;
    const k = document.getElementById('k-input').value || 0;
    const l = document.getElementById('l-input').value || 0;
    
    // Create download link
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `miller_index_${h}_${k}_${l}.png`;
    link.click();
});

// Reset Position
document.getElementById('reset-btn').addEventListener('click', () => {
    camera.position.copy(defaultCameraPos);
    controls.target.copy(defaultTarget);
    controls.update();
});

// Window Resize
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

// --- Initialization & Animation Loop ---

updatePlane();

function animate() {
    requestAnimationFrame(animate);
    controls.update(); // required if damping enabled
    renderer.render(scene, camera);
}
animate();
