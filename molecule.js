
window.addEventListener('error', function(e) {
    alert('Global Error: ' + e.message + ' at line ' + e.lineno);
});
window.addEventListener('unhandledrejection', function(e) {
    alert('Unhandled Promise Rejection: ' + e.reason);
});
let RDKitModule = null;
let currentMol = null;
let currentSmiles = '';
let currentSDF = '';
let viewer3D = null;
let isSpinning = false;

// OpenBabel & 3D Viewer Logic
let obReady = false;
let ObInstance = null;

function initOpenBabel() {
    if (window.OpenBabelModule || obReady) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/partridgejiang/cheminfo-to-web@master/OpenBabel3/OpenBabel-js/bin/openbabel.js';
    script.onload = () => {
        if (typeof OpenBabelModule === 'function') {
            try {
                const ob = OpenBabelModule();
                ob.onRuntimeInitialized = function () {
                    ObInstance = ob;
                    obReady = true;
                    console.log('OpenBabel initialized.');
                };
            } catch (e) {
                console.error('OpenBabel init error', e);
            }
        }
    };
    document.body.appendChild(script);
}

function gen3DWithOpenBabel(molblock2d) {
    if (!obReady || !ObInstance) return null;
    let conv = null;
    let mol = null;
    try {
        conv = new ObInstance.ObConversionWrapper();
        conv.setInFormat('', 'mol');
        mol = new ObInstance.OBMol();
        conv.readString(mol, molblock2d);

        const gen3d = ObInstance.OBOp.FindType('Gen3D');
        if (!gen3d || !gen3d.Do(mol, '')) throw new Error('Gen3D failed');

        conv.setOutFormat('', 'mol');
        return conv.writeString(mol, false);
    } catch (e) {
        return null;
    } finally {
        if (conv) conv.delete();
        if (mol && typeof mol.delete === 'function') mol.delete();
    }
}

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
                populateGHS([]);
                populatePhysChemCards([]);
                populateSynonyms([]);
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

// ------------------------------------------------------------------
// Functional Groups & Elemental Comp
// ------------------------------------------------------------------
const FUNCTIONAL_GROUPS = [
    { name: 'Asam Karboksilat', smarts: '[CX3](=O)[OX2H1]' },
    { name: 'Ester', smarts: '[CX3](=O)[OX2H0][#6]' },
    { name: 'Alkohol / Hidroksil', smarts: '[OX2H]' },
    { name: 'Amina', smarts: '[NX3;H2,H1;!$(NC=O)]' },
    { name: 'Amida', smarts: '[NX3][CX3](=[OX1])[#6]' },
    { name: 'Keton', smarts: '[#6][CX3](=O)[#6]' },
    { name: 'Aldehid', smarts: '[CX3H1](=O)[#6]' },
    { name: 'Eter', smarts: '[OD2]([#6])[#6]' },
    { name: 'Cincin Aromatik', smarts: 'a1aaaaa1' },
    { name: 'Halida (F, Cl, Br, I)', smarts: '[F,Cl,Br,I]' },
    { name: 'Nitro', smarts: '[$([NX3](=O)=O),$([NX3+](=O)[O-])]' },
    { name: 'Tiol / Sulfhidril', smarts: '[#16X2H]' }
];

function detectFunctionalGroups(mol) {
    if (!mol || !RDKitModule) return [];
    const found = [];
    FUNCTIONAL_GROUPS.forEach(fg => {
        try {
            const qmol = RDKitModule.get_qmol(fg.smarts);
            if (qmol && qmol.is_valid()) {
                const matchStr = mol.get_substruct_matches(qmol);
                if (matchStr && matchStr !== '{}' && matchStr !== '[]') {
                    found.push(fg.name);
                }
                qmol.delete();
            }
        } catch (e) { console.error("Error matching FG:", fg.name, e); }
    });
    return found;
}

const ATOMIC_WEIGHTS = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, P: 30.974, S: 32.06, Cl: 35.45, Br: 79.904, I: 126.90 };
const ATOM_COLORS = { C: '#4fd1c5', H: '#a0aec0', O: '#e2685a', N: '#4299e1', S: '#ecc94b', F: '#9f7aea', Cl: '#48bb78', Br: '#ed8936', I: '#805ad5', P: '#dd6b20' };

function calculateElementalComposition(formulaStr, totalMw) {
    if (!formulaStr) return [];
    const regex = /([A-Z][a-z]*)(\d*)/g;
    let match;
    const counts = {};
    while ((match = regex.exec(formulaStr)) !== null) {
        if (match[1]) {
            const elem = match[1];
            const count = parseInt(match[2] || '1', 10);
            counts[elem] = (counts[elem] || 0) + count;
        }
    }

    let calculatedTotal = 0;
    const weights = {};
    for (const elem in counts) {
        const w = (ATOMIC_WEIGHTS[elem] || 12.0) * counts[elem];
        weights[elem] = w;
        calculatedTotal += w;
    }
    const finalTotal = totalMw || calculatedTotal || 1;

    const result = [];
    for (const elem in counts) {
        const pct = (weights[elem] / finalTotal) * 100;
        result.push({ elem, count: counts[elem], weight: weights[elem], pct });
    }
    return result.sort((a, b) => b.pct - a.pct);
}

function renderElementalComposition(formulaStr, totalMw) {
    const items = calculateElementalComposition(formulaStr, totalMw);
    const bar = document.getElementById('elem-comp-bar');
    const legend = document.getElementById('elem-comp-legend');
    if (!items.length) {
        bar.innerHTML = '';
        legend.innerHTML = '<span class="text-slate-400 italic">Data tidak tersedia</span>';
        return;
    }

    bar.innerHTML = items.map(it => {
        const col = ATOM_COLORS[it.elem] || '#4fd1c5';
        return `<div style="width: ${it.pct}%; background: ${col}; height: 100%;" title="${it.elem}: ${it.pct.toFixed(1)}%"></div>`;
    }).join('');

    legend.innerHTML = items.map(it => {
        const col = ATOM_COLORS[it.elem] || '#4fd1c5';
        return `
            <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full" style="background:${col};"></span>
                <strong>${it.elem}</strong>: ${it.pct.toFixed(1)}%
            </span>
        `;
    }).join('');
}


function updateLocalUI(smiles, title, cidText) {
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('res-title').innerText = title;
    document.getElementById('res-cid').innerText = typeof cidText === 'number' ? `CID: ${cidText}` : cidText;
    document.getElementById('res-smiles').innerText = smiles;
    
    let mw = 0, exact = 0, logp = 0, tpsa = 0, hbd = 0, hba = 0, rotb = 0, formula = '';
    try {
        const desc = JSON.parse(currentMol.get_descriptors());
        mw = desc.amw || 0;
        exact = desc.exactmw || 0;
        logp = desc.CrippenClogP || 0;
        tpsa = desc.tpsa || 0;
        hbd = desc.NumHBD || 0;
        hba = desc.NumHBA || 0;
        rotb = desc.NumRotatableBonds || 0;
        formula = currentMol.get_molformula ? currentMol.get_molformula() : '';
    } catch(e) {}
    
    document.getElementById('m-logp').innerText = logp.toFixed(2);
    document.getElementById('m-hbd').innerText = hbd;
    document.getElementById('m-hba').innerText = hba;
    document.getElementById('m-tpsa').innerText = tpsa.toFixed(1);
    document.getElementById('m-rotb').innerText = rotb;
    document.getElementById('m-mass').innerText = exact.toFixed(4);
    
    // Functional Groups & Composition
    const fgList = detectFunctionalGroups(currentMol);
    const fgChips = document.getElementById('fg-chips');
    if (fgList.length) {
        fgChips.innerHTML = fgList.map(fg => `<span class="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md">${fg}</span>`).join('');
    } else {
        fgChips.innerHTML = '<span class="text-slate-400 italic">Hidrokarbon murni / Gugus umum sederhana</span>';
    }
    
    renderElementalComposition(formula, mw);
    
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
    
    document.getElementById('viewer-3d-wrap').innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Menyiapkan model 3D...</div>';
    viewer3D = null; // Destroy reference so $3Dmol recreates the canvas next time render3D is called
    
    // Try to render 3D instantly using OpenBabel WASM
    try {
        let molblock2d = '';
        if (currentMol.get_molblock) {
            molblock2d = currentMol.get_molblock();
        }
        if (molblock2d) {
            const ob3D = gen3DWithOpenBabel(molblock2d);
            if (ob3D) {
                currentSDF = ob3D;
                render3D(ob3D);
            }
        }
    } catch(e) { console.error('OpenBabel 3D sync crash', e); }
}

function render3DEmpty() {
    document.getElementById('viewer-3d-wrap').innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm italic">Struktur 3D tidak tersedia.</div>';
    viewer3D = null;
}

async function fetchExtraData(cid) {
    try {
        const [sdfRes, synData, physData, ghsData] = await Promise.all([
            fetch(`${PUG}/compound/cid/${cid}/SDF?record_type=3d`).catch(() => null),
            fetchJson(`${PUG}/compound/cid/${cid}/synonyms/JSON`).catch(() => ({})),
            fetchPugViewHeading(cid, 'Chemical and Physical Properties'),
            fetchPugViewHeading(cid, 'GHS Classification')
        ]);
        
        // Only update 3D if OpenBabel failed to render it immediately, or if we want PubChem's better conformer
        // Since PubChem has optimized 3D conformers, we can swap it in once it loads.
        if (sdfRes && sdfRes.ok) {
            const sdfText = await sdfRes.text();
            currentSDF = sdfText;
            render3D(sdfText);
        } else if (!currentSDF && sdfRes) {
            // fallback 2d
            const sdf2Res = await fetch(`${PUG}/compound/cid/${cid}/SDF`).catch(() => null);
            if (sdf2Res && sdf2Res.ok) {
                const sdf2Text = await sdf2Res.text();
                currentSDF = sdf2Text;
                render3D(sdf2Text);
            }
        }
        
        populateSynonyms(synData);
        populatePhysChemCards(physData);
        populateGHS(ghsData);
        
    } catch (e) {
        if (!currentSDF) render3DEmpty();
        populateGHS([]);
        populatePhysChemCards([]);
        populateSynonyms([]);
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

// Deep Walk for PUG View
async function fetchPugViewHeading(cid, heading) {
    try {
        const url = `${PUG_VIEW}/data/compound/${cid}/JSON?heading=${encodeURIComponent(heading)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const out = [];
        function walk(sections, parentHeading) {
            if (!Array.isArray(sections)) return;
            for (const sec of sections) {
                const heading2 = sec.TOCHeading || parentHeading;
                if (Array.isArray(sec.Information)) {
                    for (const info of sec.Information) {
                        const strs = [];
                        if (info.Value && Array.isArray(info.Value.StringWithMarkup)) {
                            for (const s of info.Value.StringWithMarkup) {
                                if (s.String) strs.push(s.String);
                            }
                        }
                        if (strs.length) out.push({ heading: heading2, strings: strs });
                    }
                }
                if (sec.Section) walk(sec.Section, heading2);
            }
        }
        if (data && data.Record && data.Record.Section) walk(data.Record.Section, heading);
        return out;
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
    
    try {
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
                    if (matchesStr && matchesStr !== '{}') {
                        const matches = JSON.parse(matchesStr);
                        matches.forEach(m => {
                            if (m.atoms) {
                                m.atoms.forEach(idx => {
                                    atomsToHighlight.add(idx);
                                    atomColors[idx] = color;
                                });
                            }
                        });
                    }
                    q.delete();
                }
            } catch(e){ console.error(e); }
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
            try {
                svg = currentMol.get_svg_with_highlights(details);
            } catch(e) {
                console.error('get_svg_with_highlights failed', e);
                svg = currentMol.get_svg(380, 380) || currentMol.get_svg();
            }
        } else {
            try {
                svg = currentMol.get_svg(380, 380);
            } catch(e) {
                console.error('get_svg(w, h) failed, trying get_svg()', e);
                svg = currentMol.get_svg();
            }
        }
        
        document.getElementById('svg-wrap').innerHTML = svg;
    } catch(e) {
        console.error('render2D global crash', e);
        document.getElementById('svg-wrap').innerHTML = '<div class="text-red-500 p-4">Error merender 2D</div>';
    }
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
// Populate Data
// ------------------------------------------------------------------
function populatePhysChemCards(physData) {
    const t = document.getElementById('physchem-cards');
    t.innerHTML = '';
    
    const KEY_MAP = {
        'Melting Point': 'Titik Leleh',
        'Boiling Point': 'Titik Didih',
        'Density': 'Densitas',
        'Solubility': 'Kelarutan',
        'Vapor Pressure': 'Tekanan Uap',
        'Flash Point': 'Titik Nyala'
    };
    
    const physProps = {};
    for (const item of physData) {
        const target = KEY_MAP[item.heading];
        if (target && !physProps[target] && item.strings && item.strings.length) {
            physProps[target] = item.strings.slice(0, 2).join('; ');
        }
    }
    
    let injected = 0;
    for (const [enKey, idKey] of Object.entries(KEY_MAP)) {
        const val = physProps[idKey] || '<span class="text-slate-400 italic">Tidak tersedia</span>';
        t.innerHTML += `
            <div class="p-4 flex flex-col justify-start">
                <div class="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">${idKey}</div>
                <div class="text-sm font-semibold text-slate-800 leading-snug">${val}</div>
            </div>
        `;
        injected++;
    }
}

function populateSynonyms(synData) {
    const list = document.getElementById('synonyms-list');
    const count = document.getElementById('syn-count');
    
    let synonyms = [];
    if (synData && synData.InformationList && synData.InformationList.Information) {
        const synInfo = synData.InformationList.Information.find(i => i.Synonym);
        if (synInfo) synonyms = synInfo.Synonym.slice(0, 30); // limit 30
    }
    
    count.innerText = `${synonyms.length} nama`;
    if (synonyms.length) {
        list.innerHTML = synonyms.map(s => `<span class="px-2 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-full">${s}</span>`).join('');
    } else {
        list.innerHTML = '<span class="text-slate-400 italic">Tidak ada nama sinonim tercatat di PubChem.</span>';
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
    
    ghsData.forEach(item => {
        if (item.heading && item.heading.includes('Pictogram') && item.strings) {
            item.strings.forEach(s => {
                const match = s.match(/GHS\d+/);
                if (match) pictos.add(match[0]);
            });
        }
        if (item.heading && item.heading.includes('Hazard Statement') && item.strings) {
            item.strings.forEach(s => stmts.add(s));
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
// Init & Event Listeners
// ------------------------------------------------------------------

// Initialize RDKit
window.initRDKitModule().then(function(instance) {
    RDKitModule = instance;
    console.log('RDKit version: ' + RDKitModule.version());
    initOpenBabel(); // Init OpenBabel right after RDKit
}).catch(e => {
    console.error('RDKit initialization failed', e);
});

const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
const drawBtn = document.getElementById('draw-btn');
const jsmeModal = document.getElementById('jsme-modal');
const closeJsmeBtn = document.getElementById('close-jsme-btn');
const jsmeCancelBtn = document.getElementById('jsme-cancel-btn');
const jsmeApplyBtn = document.getElementById('jsme-apply-btn');
let jsmeApplet = null;

window.jsmeOnLoad = function() {
    console.log("JSME Loaded");
};

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
    
    // Give JSME time to inject iframe and expose its methods
    setTimeout(() => {
        try {
            if (currentSmiles) {
                if (typeof jsmeApplet.readGenericMolecularInput === 'function') {
                    jsmeApplet.readGenericMolecularInput(currentSmiles);
                } else if (typeof jsmeApplet.readSMILES === 'function') {
                    jsmeApplet.readSMILES(currentSmiles);
                }
            } else {
                if (typeof jsmeApplet.reset === 'function') {
                    jsmeApplet.reset();
                }
            }
        } catch(e) {
            console.error("Error setting JSME smiles", e);
        }
    }, 600); // Wait 600ms for iframe to load
});

function closeJsme() {
    jsmeModal.classList.add('hidden');
}

closeJsmeBtn.addEventListener('click', closeJsme);
jsmeCancelBtn.addEventListener('click', closeJsme);

jsmeApplyBtn.addEventListener('click', () => {
    const smiles = jsmeApplet.smiles();
    if (smiles) {
        document.getElementById('search-input').value = smiles;
        closeJsme();
        processSearch(smiles);
    } else {
        alert('Struktur kosong. Silakan gambar sesuatu terlebih dahulu.');
    }
});

searchBtn.addEventListener('click', () => {
    const q = searchInput.value.trim();
    if (q) processSearch(q);
});

searchInput.addEventListener('keypress', (e) => {
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
