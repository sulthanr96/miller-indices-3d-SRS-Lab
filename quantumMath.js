/**
 * Quantum Mechanics Mathematical Engine (Simplified for Textbooks)
 * Evaluates nodeless atomic orbitals (similar to Slater-Type Orbitals or Gaussians).
 * This removes confusing inner radial nodes so hybrids look like standard textbook balloons.
 */

// Evaluate radial function R(r)
// Now using Harmonic Oscillator / Pseudo-Hydrogenic polynomials to introduce
// physically accurate inner radial nodes (concentric shells) for 2s and 3s.
export function radialR(n, l, r) {
    if (n === 1 && l === 0) { // 1s (0 nodes)
        return Math.exp(-r * r);
    } 
    else if (n === 2 && l === 0) { // 2s (1 node)
        // Introduces one spherical node where value crosses 0
        return (1.0 - (r * r) / 1.5) * Math.exp(- (r * r) / 3.0);
    } 
    else if (n === 2 && l === 1) { // 2p (0 nodes)
        return (r / 0.606) * Math.exp(- (r * r) / 2.0);
    }
    else if (n === 3 && l === 0) { // 3s (2 nodes)
        // Introduces two spherical nodes
        const x = (r * r) / 3.0;
        return (1.0 - 2.0 * x + 0.5 * x * x) * Math.exp(- (r * r) / 6.0);
    }
    else if (n === 3 && l === 2) { // 3d (0 nodes)
        return (r * r / 0.541) * Math.exp(- (r * r) / 1.5);
    }
    return 0;
}

// Evaluate Real Spherical Harmonics Y_lm(x, y, z, r)
export function sphericalY(l, m, x, y, z, r) {
    if (r < 1e-6) return (l === 0) ? 1.0 : 0.0; 

    if (l === 0) { // s
        return 1.0; // Scaled to 1 for simpler mixing
    } 
    else if (l === 1) { // p
        if (m === 0) return z / r; // pz
        if (m === 1) return x / r; // px
        if (m === -1) return y / r; // py
    } 
    else if (l === 2) { // d
        if (m === 0) { // dz2
            return (3 * z * z - r * r) / (r * r);
        }
        if (m === 1) { // dxz
            return Math.sqrt(3) * x * z / (r * r);
        }
        if (m === -1) { // dyz
            return Math.sqrt(3) * y * z / (r * r);
        }
        if (m === 2) { // dx2-y2
            return Math.sqrt(3)/2 * (x * x - y * y) / (r * r);
        }
        if (m === -2) { // dxy
            return Math.sqrt(3) * x * y / (r * r);
        }
    }
    return 0;
}

export function evaluateWavefunction(type, x, y, z) {
    const r = Math.sqrt(x*x + y*y + z*z);
    
    // Base scale to fit well in the view box (extent = 15)
    let scale = 0.5;
    if (type.startsWith('1')) scale = 0.8; // 1s
    if (type.startsWith('2')) scale = 0.5; // 2s/2p
    if (type.startsWith('3')) scale = 0.35; // 3s/3d
    const r_s = r * scale;
    const x_s = x * scale;
    const y_s = y * scale;
    const z_s = z * scale;

    let n=1, l=0, m=0;

    switch (type) {
        case '1s': n=1; l=0; m=0; break;
        case '2s': n=2; l=0; m=0; break;
        case '3s': n=3; l=0; m=0; break;
        case '2pz': n=2; l=1; m=0; break;
        case '2px': n=2; l=1; m=1; break;
        case '2py': n=2; l=1; m=-1; break;
        case '3dz2': n=3; l=2; m=0; break;
        case '3dxz': n=3; l=2; m=1; break;
        case '3dyz': n=3; l=2; m=-1; break;
        case '3dx2y2': n=3; l=2; m=2; break;
        case '3dxy': n=3; l=2; m=-2; break;
    }

    const rad = radialR(n, l, r_s);
    const ang = sphericalY(l, m, x_s, y_s, z_s, r_s);
    
    return rad * ang;
}

// Synthetic textbook balloon for hybridization
function textbookBalloon(x, y, z, r, vx, vy, vz) {
    if (r < 1e-6) return 0;
    const dot = Math.max(0, (x*vx + y*vy + z*vz) / r);
    // r^2 * exp(-r^2 / 2) peaks at sqrt(2), dot^12 makes it a nice distinct thin balloon
    return ((r*r) / 0.7357) * Math.exp(-(r*r)/2.0) * Math.pow(dot, 12);
}

// Evaluate Hybridized Orbitals (Pure VSEPR shapes)
export function evaluateHybridization(type, x, y, z) {
    const scale = 0.5;
    const r_s = Math.sqrt(x*x + y*y + z*z) * scale;
    const x_s = x * scale, y_s = y * scale, z_s = z * scale;

    const balloons = [];

    if (type === 'sp') {
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 1, 0, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -1, 0, 0));
    } 
    else if (type === 'sp2') {
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 1, 0, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -0.5, 0.866, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -0.5, -0.866, 0));
    }
    else if (type === 'sp3') {
        const sq3 = 1.0/1.732;
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, sq3, sq3, sq3));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, sq3, -sq3, -sq3));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -sq3, sq3, -sq3));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -sq3, -sq3, sq3));
    }
    else if (type === 'sp3d') {
        // Equatorial
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 1, 0, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -0.5, 0.866, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -0.5, -0.866, 0));
        // Axial
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 0, 0, 1));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 0, 0, -1));
    }
    else if (type === 'sp3d2') {
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 1, 0, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, -1, 0, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 0, 1, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 0, -1, 0));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 0, 0, 1));
        balloons.push(textbookBalloon(x_s, y_s, z_s, r_s, 0, 0, -1));
    }

    let sum_hybrid = 0;
    
    for (let b of balloons) {
        sum_hybrid += b;
    }

    return [sum_hybrid];
}
