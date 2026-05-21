
import { compressFile, decompressFile } from "./bz2api.js";
// ── State ────────────────────────────────────────────────────────────────

let currentVol = null; // { vol, url } — set when a volume is open
const CACHE_NAME = 'nexplay-zips-v1';
const META_KEY = 'nexplay-vol-info'; // localforage key for volume metadata
const msg = {
  en: {
    crosswords: "Crosswords",
    failupl: "Upload failed",
    errformat: "Unsupported file format. only bz2, br, zip accepted",
    importOK: "Import Successful! Reloading page...",
    statunpl: "🎁",
    statinp: "In Progress...",
    statcomp: "Completed",
    sortFIL: "Sort by Filename",
    sortTIT: "Sort by Title",
    chooseVol: "Choose a collection",      
    sortlab: "Available: Filename or Title sorting"

  },
  fr: {
    crosswords: "Mots-Croisés",
    failupl: "Erreur durant l'export cloud",
    errformat: "Erreur: Le format de fichier doit être zip, bz2, br",
    importOK: "Import terminé, OK pour recharger",
    statunpl: "🎁",
    statinp: "En cours...",
    statcomp: "Terminé",
    sortFIL: "Trier par fichier",
    sortTIT: "Trier par titre",
    chooseVol: "Choix volume",      
    sortlab: "Tri par nom de fich ou par titre"
  }
};


// ── BACKUPS / RESTORE ────────────────────────────────────────────────────────────────

async function exportData() {
    const storageData = {};
    const isCloudExp = document.getElementById('cloud-check').checked;

    // 1. Collect all data from localforage
    const keys = await localforage.keys();
    for (const key of keys) {
        storageData[key] = await localforage.getItem(key);
    }
    const toast = document.getElementById("toast");
    toast.textContent = "creating export...";
    toast.className = "show";
    const jsonBytes = new TextEncoder().encode(JSON.stringify(storageData, null, 2));
    const compressed = await compressFile(new Uint8Array(jsonBytes));
    const content = new Blob([compressed], { type: 'application/octet-stream' });

    // 3. Generate Timestamped Filename
    const now = new Date();
    const datePart = now.toISOString().split('T')[0];
    const timePart = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
    const localfilename = `crosswords-${datePart}-${timePart}.bz2`;

    // ─── ALWAYS DO LOCAL EXPORT ───
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = localfilename;
    link.click();
    let toastMsg = `Saved to disk: ${localfilename}`;

    // ─── CONDITIONAL CLOUD EXPORT ───
    if (isCloudExp) {
        if (!navigator.onLine) {
            showToast("Cloud failed: You are offline.");
            return;
        }

        //const toast = document.getElementById("toast");
        toast.textContent = "Uploading to cloud...";
        toast.className = "show";

        try {
            const formData = new FormData();
            // append the zip blob as 'file', which your Worker expects , file name is ignored here
            formData.append("file", content, 'data.bz2');
            const uploadEndpoint = "/api/upload";
            const response = await fetch(uploadEndpoint, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                // Handle WAF blocks (403/413) or Worker errors (500)
                const errorText = await response.text();
                throw new Error(errorText || `Server returned ${response.status}`);
            }

            const result = await response.json();
            const downloadUrl = result.url; // The public R2 URL returned by backend
            // 1. Reset and Generate QR
            const qrDiv = document.getElementById("qrcode");
            qrDiv.innerHTML = "";
            new QRCode(document.getElementById("qrcode"), {
                text: downloadUrl,
                width: 170,
                height: 170
            });

            // 2. Set the text input value
            const linkInput = document.getElementById("qr-link");
            linkInput.value = downloadUrl;

            // 3. Reveal the container
            document.getElementById("qr-container").style.display = "block";

            toastMsg = `Cloud Link: ${downloadUrl}`;

            // Try Clipboard
            try {
                await navigator.clipboard.writeText(downloadUrl);
                toastMsg += " (url copied to clipboard)";
            } catch (clipErr) {
                console.warn("Clipboard copy blocked");
            }
        } catch (err) {
            // If the WAF blocks the file for being > 5MB, it ends up here
            const m = msg[window.currentLang]?.failupl ?? msg.en.failupl;
            toastMsg = `${m}: ${err.message}`;
            console.error(err);
        }
    }

    // 3. Show Toast & Blur
    //const toast = document.getElementById("toast");
    toast.textContent = toastMsg;
    toast.className = "show";

    setTimeout(() => { toast.className = ""; }, 5000);

    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
}
document.getElementById("export-btn").addEventListener("click", exportData);

//helper:
function showToast(msg, dur=5000) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.className = "show";
    setTimeout(() => { toast.className = ""; }, dur);
}

//==============
// Helper function to process the file blob (shared between local files and QR codes)
async function processFileBlob(file) {
    let data;

    if (file.name.endsWith('.br')) {
        const brotli = await brotliReady;
        const arrayBuffer = await file.arrayBuffer();
        const decompressed = brotli.decompress(new Uint8Array(arrayBuffer));
        const jsonString = new TextDecoder().decode(decompressed);
        data = JSON.parse(jsonString);

    } else if (file.name.endsWith('.bz2')) {
        const arrayBuffer = await file.arrayBuffer();
        const decompressed = bz2.decompress(new Uint8Array(arrayBuffer));
        const jsonString = new TextDecoder().decode(decompressed);
        data = JSON.parse(jsonString);

    } else if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const backupFile = zip.file("backup.json");
        if (!backupFile) {
            alert("Error: ZIP does not contain 'backup.json'");
            return;
        }
        const jsonString = await backupFile.async("string");
        data = JSON.parse(jsonString);

    } else {
        const m = msg[window.currentLang]?.errformat ?? msg.en.errformat;
        alert(m);
        return;
    }

    // Restore keys into localforage
    for (const k of Object.keys(data)) {
        await localforage.setItem(k, data[k]);
    }

    const m = msg[window.currentLang]?.importOK ?? msg.en.importOK;
    alert(m);
    location.reload();
}

async function importData() {
    const fromQRCode = document.getElementById('qrcode-check').checked;
    if (fromQRCode) {
        if (!navigator.onLine) {
            showToast("ERROR: You are offline.");
            return;
        }

        // --- QR Code Mode ---
        const readerEl = document.getElementById("readerdiv");
        if (readerEl) readerEl.style.display = 'block';

        // Initialize the scanner
        const scanner = new Html5QrcodeScanner("reader", {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        });

        // Expose scanner to the window object so our Cancel button can access it
        window.currentScanner = scanner;

        scanner.render(async (decodedUrl) => {
            try {
                // Clear scanner and hide UI immediately on success
                await scanner.clear();
                window.currentScanner = null;
                if (readerEl) readerEl.style.display = 'none';

                const response = await fetch(decodedUrl);
                if (!response.ok) throw new Error("Network response failed");

                const blob = await response.blob();
                const filename = decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1) || 'backup.bz2';
                const file = new File([blob], filename);

                await processFileBlob(file);
            } catch (err) {
                console.error(err);
                alert("Failed to download or process backup file from QR URL.");
            }
        }, (error) => {
            // Quietly catch scanning artifacts
        });
        return;
    }

    // --- Standard Local File Mode ---
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.br,.bz2';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await processFileBlob(file);
        } catch (err) {
            console.error(err);
            alert("Failed to process backup file. Invalid file");
        }
    };

    input.click();
}

document.getElementById("import-btn").addEventListener("click", importData);
// helper
async function cancelQRScanner() {
    const readerEl = document.getElementById("readerdiv");

    if (window.currentScanner) {
        try {
            // Gracefully kill camera hooks and clear DOM artifacts
            await window.currentScanner.clear();
        } catch (err) {
            console.error("Error clearing scanner during cancel:", err);
        }
        window.currentScanner = null;
    }

    // Hide the container panel cleanly
    if (readerEl) {
        readerEl.style.display = 'none';
    }
}
document.getElementById("btn-qrcancel").addEventListener("click", cancelQRScanner);

// ── Volume metadata helpers ──────────────────────────────────────────────

async function saveVolMeta(zipname, volmeta) {
    const all = (await localforage.getItem(META_KEY)) || {};
    all[zipname] = volmeta;
    await localforage.setItem(META_KEY, all);
}

async function loadVolMeta() {
    return (await localforage.getItem(META_KEY)) || {};
}

// Read source.meta title + count .puz files from an already-loaded JSZip
async function extractZipMeta(zip, zipname) {
    const nbfiles = Object.keys(zip.files)
        .filter(p => !zip.files[p].dir && p.toLowerCase().endsWith('.puz'))
        .length;

    let volname = zipname.replace(/\.zip$/i, ''); // fallback
    const metaEntry = zip.file('source.meta') || zip.file(/source\.meta$/i)[0];
    if (metaEntry) {
        try {
            const text = await metaEntry.async('string');
            const match = text.match(/^title\s*=\s*(.+)$/mi);
            volname = match ? match[1].trim() : (text.split('\n')[0].trim() || volname);
        } catch (e) { /* keep fallback */ }
    }

    return { zipname, volname, nbfiles };
}

// ── Cache priming ────────────────────────────────────────────────────────

async function cacheZip(url, sticker) {
    const zipname = url.split('/').pop();
    try {
        const cache = await caches.open(CACHE_NAME);
        let cached = await cache.match(url);

        if (!cached) {
            setStickerBadge(sticker, 'loading…', '#888');
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            await cache.put(url, resp.clone());
            cached = await cache.match(url);
        }

        // Extract metadata from zip if not yet stored
        const allMeta = await loadVolMeta();
        if (!allMeta[zipname]) {
            const blob = await cached.blob();
            const zip = await JSZip.loadAsync(blob);
            const volmeta = await extractZipMeta(zip, zipname);
            await saveVolMeta(zipname, volmeta);
            updateVolumeSticker(sticker, volmeta);
        }

        setStickerBadge(sticker, '✓ cached', '#27ae60');
    } catch (err) {
        setStickerBadge(sticker, '✗ error', '#e74c3c');
        console.warn('Cache failed for', url, err);
    }
}

function setStickerBadge(sticker, text, color) {
    if (!sticker) return;
    let badge = sticker.querySelector('.cache-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'cache-badge';
        sticker.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.color = color;
}

async function primeCache(zipnames, stickers) {
    for (let i = 0; i < zipnames.length; i++) {
        await cacheZip(`crosswords/${zipnames[i]}`, stickers[i]);
    }
}

// ── Volume picker ────────────────────────────────────────────────────────

async function loadVolumes() {
    const fileGrid = document.getElementById('file-grid');
    const loading = document.getElementById('loading');
    loading.textContent = 'Loading collections…';
    loading.style.display = '';
    fileGrid.innerHTML = '';

    try {
        // Fetch simple zip list from volumes.json
        const resp = await fetch('volumes.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        // (first key is comment) 
        const zipnames = data.volumes;

        loading.style.display = 'none';

        if (!zipnames.length) {
            fileGrid.innerHTML = '<div class="no-files">No zip files found in /crosswords.</div>';
            return;
        }

        document.getElementById('stats-files').textContent = `${zipnames.length} volumes`;

        // Build stickers — use localforage metadata if available, skeleton otherwise
        const allMeta = await loadVolMeta();
        const stickers = [];
        for (const zipname of zipnames) {
            const volmeta = allMeta[zipname] || { zipname, volname: zipname.replace(/\.zip$/i, ''), nbfiles: '?' };
            const s = createVolumeSticker(volmeta);
            // Show cached badge immediately if already in Cache API
            caches.open(CACHE_NAME)
                .then(c => c.match(`crosswords/${zipname}`))
                .then(hit => { if (hit) setStickerBadge(s, '✓ cached', '#27ae60'); });
            fileGrid.appendChild(s);
            stickers.push(s);
        }

        // Background: cache zips + fill in missing metadata
        primeCache(zipnames, stickers);

    } catch (err) {
        loading.textContent = 'Error: ' + err.message;
        console.error(err);
    }
}

function createVolumeSticker(vol) {
    const sticker = document.createElement('div');
    sticker.className = 'file-sticker volume-sticker';
    sticker.dataset.zipname = vol.zipname;

    const cw = msg[window.currentLang]?.crosswords ?? msg.en.crosswords;
    sticker.innerHTML = `
            <div class="file-title">${escapeHtml(vol.volname)}</div>
            <div class="file-details">
                <div class="file-size">${vol.nbfiles === '?' ? '…' : vol.nbfiles + ' ' + cw}</div>
                <div class="file-name">${escapeHtml(vol.zipname)}</div>
            </div>
        `;

    sticker.addEventListener('click', () => openVolume(vol));
    return sticker;
}

// Update sticker text in-place after voldata is freshly extracted
function updateVolumeSticker(sticker, vol) {
    const title = sticker.querySelector('.file-title');
    const size = sticker.querySelector('.file-size');
    if (title) title.textContent = vol.volname;
    if (size) size.textContent = `${vol.nbfiles} crosswords`;
    // Rebind click with fresh vol (remove old listener by replacing onclick)
    sticker.onclick = () => openVolume(vol);
}

function openVolume(vol) {
    const url = `crosswords/${vol.zipname}`;
    currentVol = { vol, url };

    document.getElementById('breadcrumb-sep').style.display = '';
    const bc = document.getElementById('breadcrumb-current');
    bc.textContent = vol.volname;
    bc.style.display = '';

    document.getElementById('breadcrumb-volumes').classList.remove('active');
    bc.classList.add('active');

    document.getElementById('page-title').textContent = vol.volname;
    document.getElementById('stats-files').textContent = '';

    document.getElementById('breadcrumb-volumes').style.cursor = 'pointer';
    document.getElementById('breadcrumb-volumes').onclick = goBackToVolumes;

    document.getElementById('btn-refresh').style.display = '';
    document.getElementById('btn-resort').style.display = '';

    loadVolume(url, vol.volname);
}

async function goBackToVolumes() {
    currentVol = null;

    // Hide refresh button
    document.getElementById('btn-refresh').style.display = 'none';
    document.getElementById('btn-resort').style.display = 'none';
    // Reset breadcrumb
    document.getElementById('breadcrumb-sep').style.display = 'none';
    const bc = document.getElementById('breadcrumb-current');
    bc.style.display = 'none';
    bc.classList.remove('active');

    const bcVols = document.getElementById('breadcrumb-volumes');
    bcVols.classList.add('active');
    bcVols.style.cursor = '';
    bcVols.onclick = null;

    const m = msg[window.currentLang]?.chooseVol ?? msg.en.chooseVol;
    document.getElementById('page-title').textContent = m;
    document.getElementById('stats-files').textContent = '';

    const loading = document.getElementById('loading');
    loading.textContent = 'Loading collections...';
    loading.style.display = 'none'; // will be shown if needed

    statusMap = await getStatusByFilename(); // load existing status from localStorage
    loadVolumes();
}

// ── Archive / puzzle loader ──────────────────────────────────────────────

async function loadVolume(url, volname, sortOrder = 'asc') {
    const fileGrid = document.getElementById('file-grid');
    const loading = document.getElementById('loading');

    fileGrid.innerHTML = '';
    loading.textContent = 'Loading archive...';
    loading.style.display = '';

    try {
        // Simple fetch: sw.js will intercept this and check BOTH caches
        const resp = await fetch(url);

        if (!resp.ok) throw new Error(`HTTP ${resp.status} - Not in cache/network`);

        const blob = await resp.blob();
        const zip = await JSZip.loadAsync(blob);

        let puzzles = await processZip(zip);

        puzzles.sort((a, b) => {
            if (sortOrder === 'title') {
                const tA = (a.title || '').toLowerCase();
                const tB = (b.title || '').toLowerCase();
                return tA.localeCompare(tB);
            }
            const fileA = (a.path || '').split('/').pop().toLowerCase();
            const fileB = (b.path || '').split('/').pop().toLowerCase();
            return sortOrder === 'asc' ? fileA.localeCompare(fileB) : fileB.localeCompare(fileA);
        });

        loading.style.display = 'none';

        if (puzzles.length === 0) {
            fileGrid.innerHTML = '<div class="no-files">No .puz files found in archive</div>';
            return;
        }

        const cw = msg[window.currentLang]?.crosswords ?? msg.en.crosswords;
        document.getElementById('stats-files').textContent = `${cw}: ${puzzles.length}`;

        for (const puzfile of puzzles) {
            fileGrid.appendChild(createPuzSticker(puzfile, volname));
        }

    } catch (error) {
        // If airplane mode and not cached, this catch block handles it cleanly
        loading.textContent = 'Error: ' + error.message;
        console.error('Archive loading error:', error);
    }
}

// Example Output: { "puzzle1.puz": 2, "puzzle2.puz": 1 }
async function getStatusByFilename() {
    const results = {};
    const keys = await localforage.keys();
    for (const key of keys) {
        if (key.endsWith("_misc")) {
            try {
                const miscData = await localforage.getItem(key);
                if (miscData && miscData.filename) {
                    results[miscData.filename] = { "status": miscData.status, "voltitle": miscData.voltitle };
                }
            } catch (e) {
                // Skip malformed entries
            }
        }
    }
    return results;
}

async function processZip(zip) {
    const fileEntries = Object.keys(zip.files)
        .filter(path => !zip.files[path].dir && path.toLowerCase().endsWith('.puz'))
        .map(path => ({ path, file: zip.files[path] }));

    return await Promise.all(fileEntries.map(async (entry) => {
        try {
            const buffer = await entry.file.async("uint8array");
            const puzData = parsePuzBuffer(buffer);
            return { path: entry.path, data: buffer, ...puzData };
        } catch (err) {
            console.error(`Error parsing ${entry.path}:`, err);
            return null;
        }
    })).then(results => results.filter(r => r !== null));
}

function parsePuzBuffer(data) {
    const decoder = new TextDecoder('iso-8859-15');
    const width = data[0x2c];
    const height = data[0x2d];
    const nbclues = data[0x2e] | (data[0x2f] << 8);

    const solStart = 0x34;
    const gridSize = width * height;
    const solEnd = solStart + gridSize;
    const layoutEnd = solEnd + gridSize;

    const sol = decoder.decode(data.slice(solStart, solEnd));
    const layout = decoder.decode(data.slice(solEnd, layoutEnd));

    let pos = layoutEnd;
    const readNullTerminated = () => {
        let end = pos;
        while (end < data.length && data[end] !== 0) end++;
        const str = decoder.decode(data.slice(pos, end));
        pos = end + 1;
        return str;
    };

    return {
        width, height, nbclues,
        title: readNullTerminated(),
        author: readNullTerminated(),
        sol, layout
    };
}


function createPuzSticker(puz, volname) {
    const filename = puz.path.split('/').pop();
    const sticker = document.createElement('div');
    sticker.className = 'file-sticker';

    const currentVolTitle = currentVol.vol.volname;
    let stat = 0; // Default to unplayed
    const unplayed = msg[window.currentLang]?.statunpl ?? msg.en.statunpl;
    const inprogress = msg[window.currentLang]?.statinp ?? msg.en.statinp;
    const completed = msg[window.currentLang]?.statcomp ?? msg.en.statcomp;
    let stat_str = unplayed;

    // 1. Check if the file exists in statusMap
    if (statusMap.hasOwnProperty(filename)) {
        const vt = statusMap[filename]["voltitle"];
        const recordedStat = statusMap[filename]["status"];

        // 2. Only apply the status if the volume title matches
        if (vt === currentVolTitle) {
            stat = recordedStat;
            if (stat === 1) {
                sticker.classList.add('status-1');
                stat_str = inprogress;
            } else if (stat === 2) {
                sticker.classList.add('status-2');
                stat_str = completed;
            }
        }
    }

    sticker.innerHTML = `
            <div class="file-title">${escapeHtml(puz.title || 'Untitled')}</div>
            <div class="file-details">
                <div class="file-author">${escapeHtml(puz.author || 'Unknown')}</div>
                <div class="file-type">${puz.width}x${puz.height}</div>
                <div class="file-name">${escapeHtml(filename)}</div>
                <div class="file-status">${stat_str}</div>
            </div>
        `;

    sticker.addEventListener('click', async () => {
        const blob = new Blob([puz.data], { type: 'application/x-crossword' });
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result.split(',')[1];
            const puzdata = encodeURIComponent(base64String);
            const puzfile = encodeURIComponent(filename);
            window.open(`./index.html?data=${puzdata}&fname=${filename}&voltitle=${volname}`, '_blank');
        };
        reader.readAsDataURL(blob);
    });

    return sticker;
}

// ── Utility ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

let sortOrder = 'date';
async function refreshVolume(sortOrder = 'asc') {
    if (!currentVol) return;
    statusMap = await getStatusByFilename();
    loadVolume(currentVol.url, currentVol.vol.volname, sortOrder = sortOrder);
}

document.getElementById("btn-refresh").addEventListener("click", () => { sortOrder = 'asc'; refreshVolume(sortOrder); });
//document.getElementById("btn-resort").addEventListener("click", () => { sortOrder = 'title'; refreshVolume(sortOrder); });
const btn = document.getElementById('btn-resort');
const sortFIL = msg[window.currentLang]?.sortFIL ?? msg.en.sortFIL;
const sortTIT = msg[window.currentLang]?.sortTIT ?? msg.en.sortTIT;
const sortlab = msg[window.currentLang]?.sortlab ?? msg.en.sortlab;
btn.addEventListener('click', () => {
    if (btn.dataset.sortKey === 'filename') { // actual val
        btn.dataset.sortKey = 'title';
        btn.textContent = sortFIL;
        btn.title = sortlab;
        sortOrder = 'title';
    } else {
        btn.dataset.sortKey = 'filename';
        btn.textContent = sortTIT;
        btn.title = sortlab;
        sortOrder = 'asc';
    }
    refreshVolume(sortOrder);    
});

// ── Boot ─────────────────────────────────────────────────────────────────
let statusMap = {};

(async () => {
    statusMap = await getStatusByFilename();
    loadVolumes();
})();
