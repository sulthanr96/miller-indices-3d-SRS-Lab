/**
 * Quantum Mechanics Mathematical Engine (Simplified for Textbooks)
 * Evaluates nodeless atomic orbitals (similar to Slater-Type Orbitals or Gaussians).
 * This removes confusing inner radial nodes so hybrids look like standard textbook balloons.
 */

// Evaluate simplified radial function R(r)
// Normalized so the maximum amplitude is roughly 1.0
export function radialR(n, l, r) {
    // We use a simple Gaussian-like envelope r^l * exp(-r^2 / c)
    // to give smooth, nodeless, textbook-like shapes.
    
    if (n === 1 && l === 0) { // 1s
        return Math.exp(-r * r); // Max = 1 at r=0
    } 
    else if (n === 2 && l === 0) { // 2s (Nodeless)
        // 2s in textbooks is just a larger sphere.
        return Math.exp(- (r * r) / 3.0);
    } 
    else if (n === 2 && l === 1) { // 2p
        // max of r * exp(-r^2 / 2) is at r=1, value is exp(-0.5) ~ 0.606
        return (r / 0.6065) * Math.exp(- (r * r) / 2.0);
    } 
    else if (n === 3 && l === 0) { // 3s (Nodeless)
        return Math.exp(- (r * r) / 6.0); // Even larger sphere
    }
    else if (n === 3 && l === 1) { // 3p (Nodeless)
        return (r / 0.6065) * Math.exp(- (r * r) / 3.0);
    }
    else if (n === 3 && l === 2) { // 3d
        // max of r^2 * exp(-r^2 / 2) is at r=sqrt(2), value is 2/e ~ 0.735
        return ((r * r) / 0.7357) * Math.exp(- (r * r) / 2.0);
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
    const scale = 0.5;
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
    const dot = (x*vx + y*vy + z*vz) / r;
    if (dot <= 0) return 0; // only the positive lobe
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

    let max_hybrid = 0;
    for (let b of balloons) {
        if (b > max_hybrid) max_hybrid = b;
    }

    return [max_hybrid];
}
