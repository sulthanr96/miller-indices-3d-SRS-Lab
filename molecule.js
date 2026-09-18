let RDKitModule = null;
let viewer3D = null;
let currentMol = null;
let currentSmiles = '';
let currentSDF = '';
let viewer3D = null;
let isSpinning = false;

// ------------------------------------------------------------------
// Fetch & Process Search (Local Parsing first)
// ------------------------------------------------------------------
const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const PUG_VIEW = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view';

const loadingOverlay = document.getElementById('loading-overlay');
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
    
    document.getElementById('results-section').classList.add('hidden');
    currentSDF = '';
    
    let mol = null;
    try {
        mol = RDKitModule.get_mol(query);
    } catch(e) {}
    
    if (mol && mol.is_valid()) {
        currentSmiles = query;
        if (currentMol) currentMol.delete();
        currentMol = mol;
        
        updateLocalUI(query, "Struktur Kustom", "Tidak Terdaftar");
        
        resolveCID(query).then(cid => {
            if (cid) {
                document.getElementById('res-cid').innerText = `CID: ${cid}`;
                fetchExtraData(cid);
            } else {
                render3DEmpty();
                populateGHS([]);
                populatePhysChem({});
            }
        });
        
    } else {
        showLoading("Mencari senyawa di PubChem...");
        try {
            const cid = await resolveCID(query);
            if (!cid) throw new Error('Senyawa tidak ditemukan di PubChem atau SMILES tidak valid.');
            
            const fields = 'CanonicalSMILES,IsomericSMILES,Title';
            const propData = await fetchJson(`${PUG}/compound/cid/${cid}/property/${fields}/JSON`);
            const props = propData.PropertyTable.Properties[0];
            
            currentSmiles = props.CanonicalSMILES || props.IsomericSMILES || '';
            if (!currentSmiles) throw new Error('SMILES tidak tersedia dari PubChem.');
            
            if (currentMol) currentMol.delete();
            currentMol = RDKitModule.get_mol(currentSmiles);
            
            updateLocalUI(currentSmiles, props.Title || query, cid);
            fetchExtraData(cid);
            
        } catch (e) {
            alert(e.message);
        } finally {
            hideLoading();
        }
    }
}

function updateLocalUI(smiles, title, cidText) {
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('res-title').innerText = title;
    document.getElementById('res-cid').innerText = typeof cidText === 'number' ? `CID: ${cidText}` : cidText;
    document.getElementById('res-smiles').innerText = smiles;
    
    let mw = 0, exact = 0, logp = 0, tpsa = 0, hbd = 0, hba = 0, rotb = 0;
    try {
        const desc = JSON.parse(currentMol.get_descriptors());
        mw = desc.amw || 0;
        exact = desc.exactmw || 0;
        logp = desc.CrippenClogP || 0;
        tpsa = desc.tpsa || 0;
        hbd = desc.NumHBD || 0;
        hba = desc.NumHBA || 0;
        rotb = desc.NumRotatableBonds || 0;
    } catch(e) {}
    
    document.getElementById('m-logp').innerText = logp.toFixed(2);
    document.getElementById('m-hbd').innerText = hbd;
    document.getElementById('m-hba').innerText = hba;
    document.getElementById('m-tpsa').innerText = tpsa.toFixed(1);
    document.getElementById('m-rotb').innerText = rotb;
    document.getElementById('m-mass').innerText = exact.toFixed(4);
    
    let violations = 0;
    if (mw > 500) violations++;
    if (logp > 5) violations++;
    if (hbd > 5) violations++;
    if (hba > 10) violations++;
    
    const lipHtml = `
        <div class="bg-slate-50 border border-slate-200 rounded p-2 flex flex-col justify-between h-full">
            <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">MW &le; 500</div>
            <div class="${mw <= 500 ? 'text-emerald-600' : 'text-red-500'} font-bold font-mono">${mw.toFixed(2)}</div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded p-2 flex flex-col justify-between h-full">
            <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">LogP &le; 5.0</div>
            <div class="${logp <= 5 ? 'text-emerald-600' : 'text-red-500'} font-bold font-mono">${logp.toFixed(2)}</div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded p-2 flex flex-col justify-between h-full">
            <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">HBD &le; 5</div>
            <div class="${hbd <= 5 ? 'text-emerald-600' : 'text-red-500'} font-bold font-mono">${hbd}</div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded p-2 flex flex-col justify-between h-full">
            <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">HBA &le; 10</div>
            <div class="${hba <= 10 ? 'text-emerald-600' : 'text-red-500'} font-bold font-mono">${hba}</div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded p-2 flex flex-col justify-between h-full">
            <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">RotB &le; 10</div>
            <div class="${rotb <= 10 ? 'text-emerald-600' : 'text-amber-500'} font-bold font-mono">${rotb}</div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded p-2 flex flex-col justify-between h-full">
            <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">TPSA &le; 140</div>
            <div class="${tpsa <= 140 ? 'text-emerald-600' : 'text-amber-500'} font-bold font-mono">${tpsa.toFixed(1)}</div>
        </div>
    `;
    document.getElementById('lipinski-cards').innerHTML = lipHtml;
    
    const verdict = document.getElementById('lipinski-verdict');
    if (violations === 0) {
        verdict.className = "px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200";
        verdict.innerText = "Drug-like (0 Pelanggaran)";
    } else if (violations === 1) {
        verdict.className = "px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200";
        verdict.innerText = "1 Pelanggaran (Cukup Layak)";
    } else {
        verdict.className = "px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200";
        verdict.innerText = `${violations} Pelanggaran`;
    }
    
    document.querySelectorAll('.hl-chk').forEach(c => c.checked = false);
    render2D();
    document.getElementById('viewer-3d-wrap').innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Mengunduh 3D...</div>';
}

function render3DEmpty() {
    document.getElementById('viewer-3d-wrap').innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm italic">Struktur 3D tidak tersedia.</div>';
}

async function fetchExtraData(cid) {
    try {
        const [sdfText, ghsData, propData] = await Promise.all([
            fetch(`${PUG}/compound/cid/${cid}/SDF?record_type=3d`).then(r => r.ok ? r.text() : fetch(`${PUG}/compound/cid/${cid}/SDF`).then(r => r.text())),
            fetchPugViewHeading(cid, 'GHS Classification'),
            fetchJson(`${PUG}/compound/cid/${cid}/property/MolecularFormula,MolecularWeight/JSON`)
        ]);
        currentSDF = sdfText;
        render3D(sdfText);
        populateGHS(ghsData);
        populatePhysChem(propData.PropertyTable.Properties[0]);
    } catch (e) {
        render3DEmpty();
        populateGHS([]);
    }
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}

async function resolveCID(raw) {
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    if (/^[A-Z]{14}-[A-Z]{10}-[A-Z0-9]$/i.test(raw)) {
        try { const data = await fetchJson(`${PUG}/compound/inchikey/${encodeURIComponent(raw)}/cids/JSON`); return data.IdentifierList.CID[0]; } catch(e){}
    }
    if (/^[A-Za-z0-9]+$/.test(raw) && /\d/.test(raw) && /[A-Z]/.test(raw)) {
        try { const data = await fetchJson(`${PUG}/compound/fastformula/${encodeURIComponent(raw)}/cids/JSON`); return data.IdentifierList.CID[0]; } catch(e){}
    }
    try { const data = await fetchJson(`${PUG}/compound/name/${encodeURIComponent(raw)}/cids/JSON`); return data.IdentifierList.CID[0]; } catch(e) {}
    try { const data = await fetchJson(`${PUG}/compound/smiles/${encodeURIComponent(raw)}/cids/JSON`); return data.IdentifierList.CID[0]; } catch(e) {}
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

// ------------------------------------------------------------------
// RDKit 2D Rendering
// ------------------------------------------------------------------
function render2D() {
    if (!currentMol) {
        document.getElementById('svg-wrap').innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 italic">2D tidak tersedia</div>';
        return;
    }
    
    const atomsToHighlight = new Set();
    const atomColors = {};
    const COLOR_HBD = [0.26, 0.60, 0.88];
    const COLOR_HBA = [0.89, 0.41, 0.35];
    const COLOR_ROTB = [0.91, 0.70, 0.22];
    const COLOR_AROM = [0.28, 0.73, 0.47];

    function addMatches(smarts, color) {
        try {
            const q = RDKitModule.get_qmol(smarts);
            if (q && q.is_valid()) {
                const matchesStr = currentMol.get_substruct_matches(q);
                if (matchesStr !== '{}') {
                    const matches = JSON.parse(matchesStr);
                    matches.forEach(m => {
                        m.atoms.forEach(idx => {
                            atomsToHighlight.add(idx);
                            atomColors[idx] = color;
                        });
                    });
                }
                q.delete();
            }
        } catch(e){}
    }

    const chks = document.querySelectorAll('.hl-chk');
    let hasHighlight = false;
    chks.forEach(chk => {
        if (chk.checked) {
            hasHighlight = true;
            if (chk.dataset.hl === 'hdonor') addMatches('[!#6;!H0]', COLOR_HBD);
            if (chk.dataset.hl === 'hacceptor') addMatches('[$([O,S;H1;v2]-[!$(*=[O,N,P,S])]),$([O,S;H0;v2]),$([O,S;-]),$([N;v3;!$(N-*=!@[O,N,P,S])]),$([nH0,o,s;+0])]', COLOR_HBA);
            if (chk.dataset.hl === 'rotatable') addMatches('[!$(*#*)&!D1]-&!@[!$(*#*)&!D1]', COLOR_ROTB);
            if (chk.dataset.hl === 'aromatic') addMatches('a', COLOR_AROM);
        }
    });

    let svg = '';
    if (hasHighlight && atomsToHighlight.size > 0) {
        const details = JSON.stringify({
            width: 380,
            height: 380,
            atoms: Array.from(atomsToHighlight),
            bonds: [],
            highlightAtomColors: atomColors,
            highlightRadius: 0.35,
            drawOptions: { bondLineWidth: 2.2 }
        });
        svg = currentMol.get_svg_with_highlights(details);
    } else {
        svg = currentMol.get_svg(380, 380);
    }
    
    document.getElementById('svg-wrap').innerHTML = svg;
}

// ------------------------------------------------------------------
// 3D Rendering
// ------------------------------------------------------------------
function render3D(sdfText) {
    if (!viewer3D) {
        viewer3D = $3Dmol.createViewer("viewer-3d-wrap", { backgroundColor: '#0f172a' });
    }
    viewer3D.clear();
    viewer3D.addModel(sdfText, "sdf");
    
    document.querySelectorAll('.style-btn').forEach(b => b.dataset.active = 'false');
    document.querySelector('.style-btn[data-style="stick"]').dataset.active = 'true';
    
    viewer3D.setStyle({}, { stick: { radius: 0.15, colorscheme: 'Jmol' }, sphere: { scale: 0.28, colorscheme: 'Jmol' } });
    viewer3D.zoomTo();
    viewer3D.render();
}

function set3DStyle(style) {
    if (!viewer3D) return;
    if (style === 'stick') viewer3D.setStyle({}, { stick: { radius: 0.15, colorscheme: 'Jmol' }, sphere: { scale: 0.28, colorscheme: 'Jmol' } });
    else if (style === 'sphere') viewer3D.setStyle({}, { sphere: { colorscheme: 'Jmol' } });
    else if (style === 'cross') viewer3D.setStyle({}, { cross: { thickness: 0.1, colorscheme: 'Jmol' } });
    viewer3D.render();
}

// ------------------------------------------------------------------
// Populate Tables
// ------------------------------------------------------------------
function populatePhysChem(props) {
    const t = document.getElementById('table-physchem');
    t.innerHTML = '';
    if (!props || Object.keys(props).length === 0) {
        t.innerHTML = '<tr><td colspan="2" class="p-3 text-slate-500 italic">Sifat eksperimental dari PubChem tidak tersedia untuk senyawa ini.</td></tr>';
        return;
    }
    const map = {
        'MolecularFormula': 'Rumus Molekul',
        'MolecularWeight': 'Berat Molekul (PubChem)'
    };
    for (const [k, v] of Object.entries(map)) {
        if (props[k]) {
            t.innerHTML += `<tr><td class="font-medium">${v}</td><td>${props[k]}</td></tr>`;
        }
    }
}

function populateGHS(ghsData) {
    const pictoDiv = document.getElementById('ghs-pictograms');
    const stmtDiv = document.getElementById('ghs-statements');
    pictoDiv.innerHTML = '';
    stmtDiv.innerHTML = '';
    
    if (!ghsData || ghsData.length === 0) {
        pictoDiv.innerHTML = '<span class="text-slate-500 italic">Data bahaya GHS tidak tersedia di PubChem.</span>';
        return;
    }
    
    const pictos = new Set();
    const stmts = new Set();
    
    ghsData.forEach(info => {
        if (info.Name === 'Pictogram(s)' && info.Value && info.Value.StringWithMarkup) {
            info.Value.StringWithMarkup.forEach(m => {
                const match = m.String.match(/GHS\d+/);
                if (match) pictos.add(match[0]);
            });
        }
        if (info.Name === 'GHS Hazard Statements' && info.Value && info.Value.StringWithMarkup) {
            info.Value.StringWithMarkup.forEach(m => {
                stmts.add(m.String);
            });
        }
    });
    
    if (pictos.size === 0 && stmts.size === 0) {
        pictoDiv.innerHTML = '<span class="text-slate-500 italic">Data bahaya GHS tidak tersedia di PubChem.</span>';
        return;
    }
    
    pictos.forEach(pcode => {
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

// ------------------------------------------------------------------
// Event Listeners
// ------------------------------------------------------------------
document.getElementById('search-btn').addEventListener('click', () => {
    const q = document.getElementById('search-input').value.trim();
    if (q) processSearch(q);
});

document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) processSearch(q);
    }
});

document.querySelectorAll('.hl-chk').forEach(chk => {
    chk.addEventListener('change', () => {
        render2D();
    });
});

document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.style-btn').forEach(b => b.dataset.active = 'false');
        e.target.dataset.active = 'true';
        set3DStyle(e.target.dataset.style);
    });
});

document.getElementById('btn-spin').addEventListener('click', () => {
    if (viewer3D) {
        isSpinning = !isSpinning;
        viewer3D.spin(isSpinning ? 'y' : false, 1.2);
        document.getElementById('btn-spin').classList.toggle('bg-slate-200', isSpinning);
    }
});

document.getElementById('btn-reset').addEventListener('click', () => {
    if (viewer3D) {
        viewer3D.zoomTo();
        viewer3D.render();
    }
});

function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById('btn-dl-2d').addEventListener('click', () => {
    if (currentMol) {
        const svg = document.getElementById('svg-wrap').innerHTML;
        downloadBlob(svg, 'struktur-2d.svg', 'image/svg+xml');
    }
});

document.getElementById('btn-dl-mol').addEventListener('click', () => {
    if (currentSDF) {
        downloadBlob(currentSDF, 'struktur-3d.mol', 'chemical/x-mdl-molfile');
    }
});

document.getElementById('btn-dl-png').addEventListener('click', () => {
    if (viewer3D) {
        const pngURI = viewer3D.pngURI();
        const a = document.createElement('a');
        a.href = pngURI;
        a.download = 'struktur-3d.png';
        a.click();
    }
});
