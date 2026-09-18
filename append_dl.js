const fs = require('fs');
let code = fs.readFileSync('molecule.js', 'utf8');

// Add currentSDF variable
code = code.replace("let currentSmiles = '';", "let currentSmiles = '';\nlet currentSDF = '';");

// Store SDF
code = code.replace("currentSmiles = props.CanonicalSMILES;", "currentSmiles = props.CanonicalSMILES;\n    currentSDF = sdfText;");

// Add Event Listeners for Downloads
const dlLogic = `
// Download Controls
document.getElementById('btn-dl-2d').addEventListener('click', () => {
    const svgHTML = document.getElementById('svg-wrap').innerHTML;
    if (!svgHTML) return;
    const blob = new Blob([svgHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (document.getElementById('res-title').innerText || 'molecule') + '_2D.svg';
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-dl-mol').addEventListener('click', () => {
    if (!currentSDF) return;
    const blob = new Blob([currentSDF], { type: 'chemical/x-mdl-sdfile' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (document.getElementById('res-title').innerText || 'molecule') + '_3D.sdf';
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-dl-png').addEventListener('click', () => {
    if (!viewer3D) return;
    const imgData = viewer3D.pngURI();
    const a = document.createElement('a');
    a.href = imgData;
    a.download = (document.getElementById('res-title').innerText || 'molecule') + '_3D.png';
    a.click();
});
`;

code = code.replace("// ------------------------------------------------------------------\n// Main Logic", dlLogic + "\n// ------------------------------------------------------------------\n// Main Logic");

fs.writeFileSync('molecule.js', code);
