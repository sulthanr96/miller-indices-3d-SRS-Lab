/**
 * Quantum Mechanics Mathematical Engine
 * Evaluates hydrogen-like atomic orbitals.
 */

// Evaluate radial function R_nl(r)
// Scaled for visualization purposes. a_0 = 1.
export function radialR(n, l, r) {
    // For n=1, 2, 3
    if (n === 1 && l === 0) { // 1s
        return 2.0 * Math.exp(-r);
    } 
    else if (n === 2 && l === 0) { // 2s
        return (1.0 / Math.sqrt(2)) * (1.0 - r / 2.0) * Math.exp(-r / 2.0);
    } 
    else if (n === 2 && l === 1) { // 2p
        return (1.0 / Math.sqrt(24)) * r * Math.exp(-r / 2.0);
    } 
    else if (n === 3 && l === 0) { // 3s
        return (2.0 / 81.0 / Math.sqrt(3)) * (27.0 - 18.0 * r + 2.0 * r * r) * Math.exp(-r / 3.0);
    }
    else if (n === 3 && l === 1) { // 3p
        return (4.0 / 81.0 / Math.sqrt(6)) * r * (6.0 - r) * Math.exp(-r / 3.0);
    }
    else if (n === 3 && l === 2) { // 3d
        return (4.0 / 81.0 / Math.sqrt(30)) * r * r * Math.exp(-r / 3.0);
    }
    return 0;
}

// Evaluate Real Spherical Harmonics Y_lm(x, y, z, r)
// Cartesian formulation is much faster for grid evaluation.
export function sphericalY(l, m, x, y, z, r) {
    if (r < 1e-6) return (l === 0) ? 1.0 : 0.0; // origin singularity

    if (l === 0 && m === 0) { // s
        return 0.28209479177; // 1 / sqrt(4pi)
    } 
    else if (l === 1) { // p
        const c = 0.4886025119; // sqrt(3/4pi)
        if (m === 0) return c * z / r; // pz
        if (m === 1) return c * x / r; // px
        if (m === -1) return c * y / r; // py
    } 
    else if (l === 2) { // d
        const c1 = 0.3153915652; // 1/4 * sqrt(5/pi)
        const c2 = 1.09254843059; // 1/2 * sqrt(15/pi)
        const c3 = 0.54627421529; // 1/4 * sqrt(15/pi)
        
        if (m === 0) { // dz2
            return c1 * (3 * z * z - r * r) / (r * r);
        }
        if (m === 1) { // dxz
            return c2 * x * z / (r * r);
        }
        if (m === -1) { // dyz
            return c2 * y * z / (r * r);
        }
        if (m === 2) { // dx2-y2
            return c3 * (x * x - y * y) / (r * r);
        }
        if (m === -2) { // dxy
            return c2 * x * y / (r * r);
        }
    }
    return 0;
}

// Full wavefunction \psi = R * Y
export function evaluateWavefunction(type, x, y, z) {
    const r = Math.sqrt(x*x + y*y + z*z);
    
    // Scale down Cartesian coordinates to spread the orbital over the grid nicely
    let scale = 1.0;
    if (type.startsWith('1')) scale = 3.0; // 1s is visually smallest
    if (type.startsWith('2')) scale = 1.5; // 2s/2p are medium
    if (type.startsWith('3')) scale = 1.0; // 3s/3d are largest

    const r_scaled = r * scale;
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

    const rad = radialR(n, l, r_scaled);
    const ang = sphericalY(l, m, x_s, y_s, z_s, r_scaled);
    
    return rad * ang;
}

// Evaluate Hybridized Orbitals with mixing parameter t (0 to 1)
// Returns an array of wavefunctions [h1, h2, ...] for a given point
export function evaluateHybridization(type, x, y, z, t) {
    // We mainly use 2s and 2p for standard hybridization
    const scale = 1.5;
    const r_scaled = Math.sqrt(x*x + y*y + z*z) * scale;
    const x_s = x * scale, y_s = y * scale, z_s = z * scale;

    const psi_s = radialR(2, 0, r_scaled) * sphericalY(0, 0, x_s, y_s, z_s, r_scaled);
    const psi_px = radialR(2, 1, r_scaled) * sphericalY(1, 1, x_s, y_s, z_s, r_scaled);
    const psi_py = radialR(2, 1, r_scaled) * sphericalY(1, -1, x_s, y_s, z_s, r_scaled);
    const psi_pz = radialR(2, 1, r_scaled) * sphericalY(1, 0, x_s, y_s, z_s, r_scaled);

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
