const fs = require('fs');
let code = fs.readFileSync('main.js', 'utf8');

const newAtomsLogic = `
        const positions = new Set();
        if (currentSystem === 'hcp') {
            // Draw a proper Hexagonal Prism!
            // The hexagon has 7 atoms on bottom (z=0), 7 on top (z=S), and 3 inside per layer (z=0.5).
            for (let z = 0; z <= S; z++) {
                // Base hexagon atoms (fractional coordinates of primitive cell)
                // Origin
                positions.add(\`0,0,\${z}\`);
                // 6 corners of hexagon
                positions.add(\`1,0,\${z}\`);
                positions.add(\`0,1,\${z}\`);
                positions.add(\`-1,1,\${z}\`);
                positions.add(\`-1,0,\${z}\`);
                positions.add(\`0,-1,\${z}\`);
                positions.add(\`1,-1,\${z}\`);
                
                // 3 inner atoms (at z+0.5)
                if (z < S) {
                    positions.add(\`1/3,2/3,\${z+0.5}\`);
                    positions.add(\`-2/3,1/3,\${z+0.5}\`);
                    positions.add(\`1/3,-1/3,\${z+0.5}\`);
                }
            }
        } else {
            for (let cx = 0; cx <= S; cx++) {
                for (let cy = 0; cy <= S; cy++) {
                    for (let cz = 0; cz <= S; cz++) {
                        positions.add(\`\${cx},\${cy},\${cz}\`);
                        if (cx < S && cy < S && cz < S) {
                            if (currentSystem === 'bcc') positions.add(\`\${cx+0.5},\${cy+0.5},\${cz+0.5}\`);
                        }
                        if (currentSystem === 'fcc') {
                            if (cx < S && cy < S) positions.add(\`\${cx+0.5},\${cy+0.5},\${cz}\`);
                            if (cx < S && cz < S) positions.add(\`\${cx+0.5},\${cy},\${cz+0.5}\`);
                            if (cy < S && cz < S) positions.add(\`\${cx},\${cy+0.5},\${cz+0.5}\`);
                        }
                    }
                }
            }
        }
`;
code = code.replace(/const positions = new Set\(\);[\s\S]*?positions\.forEach\(posStr => \{/, newAtomsLogic + '\n        positions.forEach(posStr => {');

const oldWire = `    // Build Cell Wireframes
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

const newWire = `    // Build Cell Wireframes
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
    }`;
code = code.replace(oldWire, newWire);

// Also need to fix pts for interactive dots so they map all these positions
const oldPts = `        const pts = [];
        for (let x=0; x<=S; x++) {
            for (let y=0; y<=S; y++) {
                for (let z=0; z<=S; z++) {
                    pts.push(x, y, z);
                }
            }
        }`;
const newPts = `        const pts = [];
        positions.forEach(posStr => {
            if (posStr.includes('/')) return; // Skip non-integer dots for Miller plane dragging
            const [u, v, w] = posStr.split(',').map(Number);
            const cart = fracToCartesian(u, v, w);
            pts.push(cart.x, cart.y, cart.z);
        });`;
code = code.replace(oldPts, newPts);

// Center the camera on the hexagon origin for HCP
const oldTarget = 'controls.target.copy(fracToCartesian(S/2, S/2, S/2));';
const newTarget = `
    if (currentSystem === 'hcp') {
        controls.target.copy(fracToCartesian(0, 0, S/2));
    } else {
        controls.target.copy(fracToCartesian(S/2, S/2, S/2));
    }`;
code = code.replace(oldTarget, newTarget);

fs.writeFileSync('main.js', code);
