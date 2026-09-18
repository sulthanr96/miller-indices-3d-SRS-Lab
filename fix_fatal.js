const fs = require('fs');
let code = fs.readFileSync('main.js', 'utf8');

const badElse = `    } else {
        // Just draw dots at corners if no system is selected
        const dotGeo = new THREE.BufferGeometry();
        const pts = [];
        positions.forEach(posStr => {
            if (posStr.includes('/')) return; // Skip non-integer dots for Miller plane dragging
            const [u, v, w] = posStr.split(',').map(Number);
            const cart = fracToCartesian(u, v, w);
            pts.push(cart.x, cart.y, cart.z);
        });
        dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const dotMat = new THREE.PointsMaterial({ color: 0x64748b, size: 0.05 });
        const dotMesh = new THREE.Points(dotGeo, dotMat);
        atomsGroup.add(dotMesh);
        
        document.getElementById('crystal-info').classList.add('hidden');
    }`;

const goodElse = `    } else {
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
    }`;

code = code.replace(badElse, goodElse);
fs.writeFileSync('main.js', code);
