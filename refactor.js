const fs = require('fs');
let code = fs.readFileSync('main.js', 'utf8');

const fracFunc = `
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
`;
code = code.replace('function rebuildCrystal() {', fracFunc + 'function rebuildCrystal() {');

code = code.replace(
    "'fcc': { name: 'Face-Centered Cubic (FCC)', atoms: 4, cn: 12, apf: '74.0%', r: 'a√2/4', rVal: Math.sqrt(2)/4 }", 
    "'fcc': { name: 'Face-Centered Cubic (FCC)', atoms: 4, cn: 12, apf: '74.0%', r: 'a√2/4', rVal: Math.sqrt(2)/4 },\n    'hcp': { name: 'Hexagonal Close-Packed (HCP)', atoms: 2, cn: 12, apf: '74.0%', r: 'a/2', rVal: 0.5 }"
);

const oldWireframe = `    // Build Cell Wireframes
    const lineMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1, transparent: true, opacity: 0.8 });
    for (let x=0; x<S; x++) {
        for (let y=0; y<S; y++) {
            for (let z=0; z<S; z++) {
                const boxGeo = new THREE.BoxGeometry(1, 1, 1);
                const edges = new THREE.EdgesGeometry(boxGeo);
                const lines = new THREE.LineSegments(edges, lineMat);
                lines.position.set(x + 0.5, y + 0.5, z + 0.5);
                cellLinesGroup.add(lines);
            }
        }
    }`;
const newWireframe = `    // Build Cell Wireframes
    const lineMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1, transparent: true, opacity: 0.8 });
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
    }`;
code = code.replace(oldWireframe, newWireframe);

const fccLogic = "if (currentSystem === 'fcc') {";
const hcpLogic = `if (currentSystem === 'hcp') {
                        if (cx < S && cy < S && cz < S) positions.add(\`\${cx+1/3},\${cy+2/3},\${cz+1/2}\`);
                    }
                    if (currentSystem === 'fcc') {`;
code = code.replace(fccLogic, hcpLogic);

const oldAtomRender = `        positions.forEach(pos => {
            const [x, y, z] = pos.split(',').map(Number);
            const mesh = new THREE.Mesh(sphereGeo, atomMat);
            mesh.position.set(x, y, z);
            atomsGroup.add(mesh);`;
const newAtomRender = `        positions.forEach(pos => {
            const [u, v, w] = pos.split(',').map(Number);
            const cart = fracToCartesian(u, v, w);
            const mesh = new THREE.Mesh(sphereGeo, atomMat);
            mesh.position.copy(cart);
            atomsGroup.add(mesh);`;
code = code.replace(oldAtomRender, newAtomRender);

const oldTarget = 'controls.target.set(S/2, S/2, S/2);';
const newTarget = 'controls.target.copy(fracToCartesian(S/2, S/2, S/2));';
code = code.replace(oldTarget, newTarget);

const oldVertices = `    if (points.length >= 3) {
        const vertices = [];
        for (let i = 1; i < points.length - 1; i++) {
            vertices.push(...points[0], ...points[i], ...points[i+1]);
        }`;
const newVertices = `    if (points.length >= 3) {
        const vertices = [];
        for (let i = 1; i < points.length - 1; i++) {
            const p0 = fracToCartesian(...points[0]);
            const p1 = fracToCartesian(...points[i]);
            const p2 = fracToCartesian(...points[i+1]);
            vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }`;
code = code.replace(oldVertices, newVertices);

const oldEdgePts = 'const edgePts = [...points, points[0]];';
const newEdgePts = 'const edgePts = [...points, points[0]].map(p => fracToCartesian(...p));';
code = code.replace(oldEdgePts, newEdgePts);

fs.writeFileSync('main.js', code);
