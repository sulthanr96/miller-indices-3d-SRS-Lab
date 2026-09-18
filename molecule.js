let RDKitModule = null;
let viewer3D = null;
let currentMol = null; // RDKit molecule object
let currentSmiles = '';
let currentSDF = '';

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const PUG_VIEW = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view';

// Initialize RDKit
window.initRDKitModule().then(function(instance) {
    RDKitModule = instance;
    console.log('RDKit version: ' + RDKitModule.version());
}).catch(e => {
    console.error('RDKit initialization failed', e);
});

// UI Elements
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
const drawBtn = document.getElementById('draw-btn');
const jsmeModal = document.getElementById('jsme-modal');
const closeJsmeBtn = document.getElementById('close-jsme-btn');
const jsmeCancelBtn = document.getElementById('jsme-cancel-btn');
const jsmeApplyBtn = document.getElementById('jsme-apply-btn');
const resultsSection = document.getElementById('results-section');
const loadingOverlay = document.getElementById('loading-overlay');

// JSME Applet reference
let jsmeApplet = null;

// Initialize JSME when modal opens (lazy loading)
function initJSME() {
    if (!jsmeApplet) {
        jsmeApplet = new JSApplet.JSME("jsme_container", "100%", "400px", {
            options: "oldlook,star,atommovebutton,smiles,hydrogens"
        });
    }
}

drawBtn.addEventListener('click', () => {
    jsmeModal.classList.remove('hidden');
    initJSME();
    if (currentSmiles) {
        jsmeApplet.readSMILES(currentSmiles);
    } else {
        jsmeApplet.reset();
    }
});

function closeJsme() {
    jsmeModal.classList.add('hidden');
}

closeJsmeBtn.addEventListener('click', closeJsme);
jsmeCancelBtn.addEventListener('click', closeJsme);

jsmeApplyBtn.addEventListener('click', () => {
    const smiles = jsmeApplet.smiles();
    if (smiles) {
        searchInput.value = smiles;
        closeJsme();
        processSearch(smiles);
    } else {
        alert('Struktur kosong. Silakan gambar sesuatu terlebih dahulu.');
    }
});

searchBtn.addEventListener('click', () => {
    if (searchInput.value.trim()) {
        processSearch(searchInput.value.trim());
    }
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim()) {
        processSearch(searchInput.value.trim());
    }
});

// Highlight Buttons
document.querySelectorAll('.hl-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.hl-btn').forEach(b => b.dataset.active = 'false');
        e.target.dataset.active = 'true';
        render2D(e.target.dataset.hl);
    });
});

// 3D Style Buttons
document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.style-btn').forEach(b => b.dataset.active = 'false');
        e.target.dataset.active = 'true';
        set3DStyle(e.target.dataset.style);
    });
});

// 3D Controls
document.getElementById('btn-spin').addEventListener('click', () => {
    if (viewer3D) {
        viewer3D.spin(true);
        setTimeout(() => viewer3D.spin(false), 3000); // spin for 3 seconds
    }
});

document.getElementById('btn-reset').addEventListener('click', () => {
    if (viewer3D) {
        viewer3D.zoomTo();
    }
});

// ------------------------------------------------------------------
// Main Logic
// ------------------------------------------------------------------

function showLoading(text) {
    document.getElementById('loading-text').innerText = text;
    loadingOverlay.style.display = 'flex';
}
function hideLoading() {
    loadingOverlay.style.display = 'none';
}

async function processSearch(query) {
    if (!RDKitModule) {
        alert("RDKit is still loading, please wait a moment.");
        return;
    }
    showLoading("Mencari senyawa di PubChem...");
    try {
        const cid = await resolveCID(query);
        if (!cid) throw new Error('Senyawa tidak ditemukan di PubChem.');
        
        showLoading("Mengunduh data dan struktur 3D...");
        await fetchCompoundDetails(cid, query);
        
        resultsSection.classList.remove('hidden');
    } catch (e) {
        alert(e.message);
        console.error(e);
    } finally {
        hideLoading();
    }
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}

async function resolveCID(raw) {
    // 1. Direct CID
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    
    // 2. InChIKey
    if (/^[A-Z]{14}-[A-Z]{10}-[A-Z0-9]$/i.test(raw)) {
        try { const data = await fetchJson(`${PUG}/compound/inchikey/${encodeURIComponent(raw)}/cids/JSON`);
        return data.IdentifierList.CID[0]; } catch(e){}
    }
    
    // 3. FastFormula
    if (/^[A-Za-z0-9]+$/.test(raw) && /\d/.test(raw) && /[A-Z]/.test(raw)) {
        try { const data = await fetchJson(`${PUG}/compound/fastformula/${encodeURIComponent(raw)}/cids/JSON`);
        return data.IdentifierList.CID[0]; } catch(e){}
    }
    
    // 4. Name
    try { const data = await fetchJson(`${PUG}/compound/name/${encodeURIComponent(raw)}/cids/JSON`);
    return data.IdentifierList.CID[0]; } catch(e) {}
    
    // 5. SMILES
    try { const data = await fetchJson(`${PUG}/compound/smiles/${encodeURIComponent(raw)}/cids/JSON`);
    return data.IdentifierList.CID[0]; } catch(e) {}
    
    return null;
}

async function fetchPugViewHeading(cid, heading) {
    try {
        const url = `${PUG_VIEW}/data/compound/${cid}/JSON?heading=${encodeURIComponent(heading)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return data.Record.Section[0].Section[0].Information || [];
    } catch (e) { return []; }
}

async function fetchCompoundDetails(cid, originalQuery) {
    const fields = 'CanonicalSMILES,IsomericSMILES,Title,MolecularFormula,MolecularWeight,XLogP,ExactMass,TPSA,Complexity,HeavyAtomCount,RotatableBondCount,HBondDonorCount,HBondAcceptorCount';
    
    const [propData, sdfText, ghsData, physData] = await Promise.all([
        fetchJson(`${PUG}/compound/cid/${cid}/property/${fields}/JSON`),
        fetch(`${PUG}/compound/cid/${cid}/SDF?record_type=3d`).then(r => r.ok ? r.text() : fetch(`${PUG}/compound/cid/${cid}/SDF`).then(r => r.text())),
        fetchPugViewHeading(cid, 'GHS Classification'),
        fetchPugViewHeading(cid, 'Chemical and Physical Properties')
    ]);

    const props = propData.PropertyTable.Properties[0];
    currentSmiles = props.CanonicalSMILES || props.IsomericSMILES || '';
    currentSDF = sdfText;
    
    // Update Header
    document.getElementById('res-title').innerText = props.Title || originalQuery;
    document.getElementById('res-cid').innerText = `CID: ${props.CID || cid}`;
    document.getElementById('res-smiles').innerText = currentSmiles || 'SMILES tidak tersedia';
    
    // Prepare RDKit Mol
    if (currentMol) currentMol.delete();
    if (currentSmiles) {
        currentMol = RDKitModule.get_mol(currentSmiles);
    } else {
        currentMol = null;
    }
    
    // Reset highlighter
    document.querySelectorAll('.hl-btn').forEach(b => b.dataset.active = 'false');
    document.querySelector('.hl-btn[data-hl="none"]').dataset.active = 'true';
    
    // Render 2D & 3D
    render2D('none');
    render3D(sdfText);
    
    // Populate Tables
    populatePhysChem(props);
    populateLipinski(props);
    populateGHS(ghsData);
}

// ------------------------------------------------------------------
// Render 2D SVG with Highlighting
// ------------------------------------------------------------------
function render2D(highlightMode) {
    if (!currentMol) {
        document.getElementById('svg-wrap').innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 italic">2D tidak tersedia</div>';
        return;
    }
    
    let details = {};
    if (highlightMode !== 'none') {
        let smarts = '';
        switch(highlightMode) {
            case 'hdonor': smarts = '[!#6;!H0]'; break; // simplified
            case 'hacceptor': smarts = '[$([O,S;H1;v2]-[!$(*=[O,N,P,S])]),$([O,S;H0;v2]),$([O,S;-]),$([N;v3;!$(N-*=!@[O,N,P,S])]),$([nH0,o,s;+0])]' ; break; 
            case 'rotatable': smarts = '[!$(*#*)&!D1]-&!@[!$(*#*)&!D1]'; break;
            case 'aromatic': smarts = 'a'; break;
        }
        
        if (smarts) {
            const q = RDKitModule.get_qmol(smarts);
            if (q) {
                const matches = currentMol.get_substruct_match(q);
                if (matches !== '{}') {
                    const matchArr = JSON.parse(matches);
                    const atoms = [];
                    // RDKit get_substruct_match returns an array of matched atoms if single match, 
                    // or array of arrays if multiple? Wait, it returns a single match. get_substruct_matches returns multiple.
                    // Let's use get_substruct_matches if available, else fallback
                    let allMatches = [];
                    try {
                        const mStr = currentMol.get_substruct_matches(q);
                        allMatches = JSON.parse(mStr);
                    } catch(e) {
                        allMatches = [JSON.parse(matches)];
                    }
                    
                    allMatches.forEach(m => {
                        atoms.push(...m.atoms);
                    });
                    
                    // Deduplicate
                    const uniqueAtoms = [...new Set(atoms)];
                    details.atoms = uniqueAtoms;
                    // Colors
                    const colors = {};
                    uniqueAtoms.forEach(a => {
                        if (highlightMode === 'hdonor') colors[a] = [0.2, 0.6, 1.0]; // blueish
                        else if (highlightMode === 'hacceptor') colors[a] = [1.0, 0.4, 0.4]; // reddish
                        else if (highlightMode === 'rotatable') colors[a] = [0.2, 0.8, 0.2]; // green
                        else if (highlightMode === 'aromatic') colors[a] = [0.8, 0.2, 0.8]; // purple
                    });
                    
                    // Note: RDKit minimal JS doesn't easily support passing color objects into get_svg without JSON details
                    // We'll format the JSON for get_svg_with_highlights
                    details = JSON.stringify({
                        atoms: uniqueAtoms,
                        bonds: [], // You can add bonds if needed
                        atomColors: colors
                    });
                }
                q.delete();
            }
        }
    }
    
    let svg = '';
    if (typeof details === 'string' && details !== '{}') {
        svg = currentMol.get_svg_with_highlights(details);
    } else {
        svg = currentMol.get_svg();
    }
    
    document.getElementById('svg-wrap').innerHTML = svg;
}

// ------------------------------------------------------------------
// Render 3D with 3Dmol.js
// ------------------------------------------------------------------
function render3D(sdfText) {
    if (!viewer3D) {
        viewer3D = $3Dmol.createViewer("viewer-3d-wrap", { backgroundColor: '#0f172a' });
    }
    viewer3D.clear();
    viewer3D.addModel(sdfText, "sdf");
    
    // Set default style
    document.querySelectorAll('.style-btn').forEach(b => b.dataset.active = 'false');
    document.querySelector('.style-btn[data-style="stick"]').dataset.active = 'true';
    
    viewer3D.setStyle({}, { stick: { radius: 0.15 }, sphere: { scale: 0.3 } });
    viewer3D.zoomTo();
    viewer3D.render();
}

function set3DStyle(style) {
    if (!viewer3D) return;
    if (style === 'stick') viewer3D.setStyle({}, { stick: { radius: 0.15 }, sphere: { scale: 0.3 } });
    else if (style === 'sphere') viewer3D.setStyle({}, { sphere: {} });
    else if (style === 'cross') viewer3D.setStyle({}, { cross: { thickness: 0.1 } });
    viewer3D.render();
}

// ------------------------------------------------------------------
// Populate Tables
// ------------------------------------------------------------------
function populatePhysChem(p) {
    const tbody = document.getElementById('table-physchem');
    tbody.innerHTML = `
        <tr><td>Rumus Molekul</td><td class="font-mono">${p.MolecularFormula || '-'}</td></tr>
        <tr><td>Berat Molekul</td><td>${p.MolecularWeight ? p.MolecularWeight + ' g/mol' : '-'}</td></tr>
        <tr><td>Massa Eksak</td><td>${p.ExactMass || '-'}</td></tr>
        <tr><td>XLogP3 (Lipofilisitas)</td><td>${p.XLogP !== undefined ? p.XLogP : '-'}</td></tr>
        <tr><td>TPSA (Polar Surface Area)</td><td>${p.TPSA ? p.TPSA + ' Å²' : '-'}</td></tr>
        <tr><td>Jumlah Atom Berat</td><td>${p.HeavyAtomCount || '-'}</td></tr>
        <tr><td>Kompleksitas</td><td>${p.Complexity || '-'}</td></tr>
    `;
}

function populateLipinski(p) {
    const mw = p.MolecularWeight || 0;
    const logp = p.XLogP || 0;
    const hbd = p.HBondDonorCount || 0;
    const hba = p.HBondAcceptorCount || 0;
    const rot = p.RotatableBondCount || 0;
    const tpsa = p.TPSA || 0;
    
    let violations = 0;
    if (mw > 500) violations++;
    if (logp > 5) violations++;
    if (hbd > 5) violations++;
    if (hba > 10) violations++;
    
    const tbody = document.getElementById('table-lipinski');
    tbody.innerHTML = `
        <tr><td>Molecular Weight &le; 500</td><td class="${mw <= 500 ? 'text-emerald-600' : 'text-red-600'} font-bold">${mw}</td></tr>
        <tr><td>XLogP3 &le; 5</td><td class="${logp <= 5 ? 'text-emerald-600' : 'text-red-600'} font-bold">${logp}</td></tr>
        <tr><td>H-Bond Donors &le; 5</td><td class="${hbd <= 5 ? 'text-emerald-600' : 'text-red-600'} font-bold">${hbd}</td></tr>
        <tr><td>H-Bond Acceptors &le; 10</td><td class="${hba <= 10 ? 'text-emerald-600' : 'text-red-600'} font-bold">${hba}</td></tr>
        <tr><td>Rotatable Bonds &le; 10 (Veber)</td><td class="${rot <= 10 ? 'text-emerald-600' : 'text-amber-500'} font-bold">${rot}</td></tr>
        <tr><td>TPSA &le; 140 Å² (Veber)</td><td class="${tpsa <= 140 ? 'text-emerald-600' : 'text-amber-500'} font-bold">${tpsa}</td></tr>
    `;
    
    const verdict = document.getElementById('lipinski-verdict');
    if (violations <= 1) {
        verdict.className = "p-4 text-sm font-medium border-t border-emerald-200 bg-emerald-50 text-emerald-800";
        verdict.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i>Memenuhi Aturan Lipinski (Drug-like)`;
    } else {
        verdict.className = "p-4 text-sm font-medium border-t border-red-200 bg-red-50 text-red-800";
        verdict.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>Melanggar ${violations} Aturan Lipinski (Kurang Drug-like)`;
    }
}

function populateGHS(infoArr) {
    const pictoDiv = document.getElementById('ghs-pictograms');
    const stmtDiv = document.getElementById('ghs-statements');
    pictoDiv.innerHTML = '';
    stmtDiv.innerHTML = '';
    
    if (!infoArr || infoArr.length === 0) {
        pictoDiv.innerHTML = '<span class="text-slate-500 italic">Data GHS tidak tersedia / Senyawa dianggap aman.</span>';
        return;
    }
    
    // Find GHS pictograms
    const pictos = new Set();
    const stmts = new Set();
    
    infoArr.forEach(info => {
        if (info.Name === 'Pictogram(s)' && info.Value && info.Value.StringWithMarkup) {
            info.Value.StringWithMarkup.forEach(m => {
                if (m.String && m.String.startsWith('GHS')) {
                    pictos.add(m.String);
                }
            });
        }
        if (info.Name === 'GHS Hazard Statements' && info.Value && info.Value.StringWithMarkup) {
            info.Value.StringWithMarkup.forEach(m => {
                stmts.add(m.String);
            });
        }
    });
    
    if (pictos.size === 0 && stmts.size === 0) {
        pictoDiv.innerHTML = '<span class="text-slate-500 italic">Data GHS tidak tersedia.</span>';
        return;
    }
    
    pictos.forEach(pcode => {
        // PubChem GHS code e.g. GHS02
        const img = document.createElement('img');
        const num = pcode.replace('GHS', '');
        img.src = `https://pubchem.ncbi.nlm.nih.gov/images/ghs/GHS${num}.svg`;
        img.className = 'w-16 h-16 object-contain';
        img.title = pcode;
        pictoDiv.appendChild(img);
    });
    
    stmts.forEach(s => {
        const p = document.createElement('p');
        p.innerText = s;
        stmtDiv.appendChild(p);
    });
}
