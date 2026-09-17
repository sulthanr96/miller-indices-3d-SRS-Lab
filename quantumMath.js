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
    // This acts like varying the Bohr radius a_0 relative to our viewing box
    let scale = 1.0;
    if (type.startsWith('1')) scale = 4.0;
    if (type.startsWith('2')) scale = 2.0;
    if (type.startsWith('3')) scale = 1.0;

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
