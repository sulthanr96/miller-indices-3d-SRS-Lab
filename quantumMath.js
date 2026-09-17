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

export function evaluateHybridization(type, x, y, z, t) {
    const scale = 0.5;
    const r_s = Math.sqrt(x*x + y*y + z*z) * scale;
    const x_s = x * scale, y_s = y * scale, z_s = z * scale;

    // Use 2s and 2p for hybridization
    const psi_s = radialR(2, 0, r_s) * sphericalY(0, 0, x_s, y_s, z_s, r_s);
    const psi_px = radialR(2, 1, r_s) * sphericalY(1, 1, x_s, y_s, z_s, r_s);
    const psi_py = radialR(2, 1, r_s) * sphericalY(1, -1, x_s, y_s, z_s, r_s);
    const psi_pz = radialR(2, 1, r_s) * sphericalY(1, 0, x_s, y_s, z_s, r_s);

    const hybrids = [];

    if (type === 'sp') {
        const h1 = (1-t)*psi_s + t*(0.7071*psi_s + 0.7071*psi_pz);
        const h2 = (1-t)*psi_pz + t*(0.7071*psi_s - 0.7071*psi_pz);
        hybrids.push(h1, h2);
    } 
    else if (type === 'sp2') {
        const h1 = (1-t)*psi_s + t*(0.5773*psi_s + 0.8165*psi_py);
        const h2 = (1-t)*psi_py + t*(0.5773*psi_s - 0.4082*psi_py + 0.7071*psi_px);
        const h3 = (1-t)*psi_px + t*(0.5773*psi_s - 0.4082*psi_py - 0.7071*psi_px);
        hybrids.push(h1, h2, h3);
    }
    else if (type === 'sp3') {
        const h1 = (1-t)*psi_s  + t*0.5*(psi_s + psi_px + psi_py + psi_pz);
        const h2 = (1-t)*psi_px + t*0.5*(psi_s + psi_px - psi_py - psi_pz);
        const h3 = (1-t)*psi_py + t*0.5*(psi_s - psi_px + psi_py - psi_pz);
        const h4 = (1-t)*psi_pz + t*0.5*(psi_s - psi_px - psi_py + psi_pz);
        hybrids.push(h1, h2, h3, h4);
    }

    return hybrids;
}
