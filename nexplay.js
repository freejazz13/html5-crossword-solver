
import { compressFile, decompressFile } from "./bz2api.js";
// ── State ────────────────────────────────────────────────────────────────

let currentVol = null; // { vol, url } — set when a volume is open
const CACHE_NAME = 'nexplay-zips-v1';
const META_KEY = 'nexplay-vol-info'; // localStorage key for volume metadata


// ── BACKUPS / RESTORE ────────────────────────────────────────────────────────────────

async function exportData() {
    const storageData = {};
    const isCloud = document.getElementById('cloud-check').checked;

    // 1. Collect Local Storage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        try {
            storageData[key] = JSON.parse(val);
        } catch (e) {
            storageData[key] = val;
        }
    }
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
    if (isCloud) {
        if (!navigator.onLine) {
            showToast("Cloud failed: You are offline.");
            return;
        }

        const toast = document.getElementById("toast");
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
                toastMsg += " (Copied!)";
            } catch (clipErr) {
                console.warn("Clipboard blocked");
            }
        } catch (err) {
            // If the WAF blocks the file for being > 5MB, it ends up here
            toastMsg = `Upload Failed: ${err.message}`;
            console.error(err);
        }
    }

    // 3. Show Toast & Blur
    const toast = document.getElementById("toast");
    toast.textContent = toastMsg;
    toast.className = "show";

    setTimeout(() => { toast.className = ""; }, 5000);

    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
}
document.getElementById("export-btn").addEventListener("click", exportData);

async function importData() {
    // 1. Create a hidden file input — accept both formats
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.br,.bz2';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            let data;

            if (file.name.endsWith('.br')) {
                // ── Brotli file ──
                const brotli = await brotliReady;
                const arrayBuffer = await file.arrayBuffer();
                const decompressed = brotli.decompress(new Uint8Array(arrayBuffer));
                const jsonString = new TextDecoder().decode(decompressed);
                data = JSON.parse(jsonString);

            } else if (file.name.endsWith('.bz2')) {
                // ── BZ2 file ──
                const arrayBuffer = await file.arrayBuffer();
                const decompressed = bz2.decompress(new Uint8Array(arrayBuffer));
                const jsonString = new TextDecoder().decode(decompressed);
                data = JSON.parse(jsonString);

            } else if (file.name.endsWith('.zip')) {
                // ── ZIP file ──
                const zip = await JSZip.loadAsync(file);
                const backupFile = zip.file("backup.json");
                if (!backupFile) {
                    alert("Error: ZIP does not contain 'backup.json'");
                    return;
                }
                const jsonString = await backupFile.async("string");
                data = JSON.parse(jsonString);

            } else {
                alert("Unsupported file format. Please select a .br or .zip backup file.");
                return;
            }

            // 2. Restore and re-pack keys
            Object.keys(data).forEach(k => {
                const val = data[k];
                const finalizedValue = typeof val === 'object' ? JSON.stringify(val) : val;
                localStorage.setItem(k, finalizedValue);
            });

            alert('Import Successful! Reloading page...');
            location.reload();

        } catch (err) {
            console.error(err);
            alert("Failed to process backup file. Is it a valid backup?");
        }
    };
    input.click();
}
document.getElementById("import-btn").addEventListener("click", importData);

// ── Volume metadata helpers ──────────────────────────────────────────────

function saveVolMeta(zipname, volmeta) {
    const all = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    all[zipname] = volmeta;
    localStorage.setItem(META_KEY, JSON.stringify(all));
}

function loadVolMeta() {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
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
        const allMeta = loadVolMeta();
        if (!allMeta[zipname]) {
            const blob = await cached.blob();
            const zip = await JSZip.loadAsync(blob);
            const volmeta = await extractZipMeta(zip, zipname);
            saveVolMeta(zipname, volmeta);
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
        const zipnames = await resp.json();

        loading.style.display = 'none';

        if (!zipnames.length) {
            fileGrid.innerHTML = '<div class="no-files">No zip files found in /crosswords.</div>';
            return;
        }

        document.getElementById('stats-files').textContent = `${zipnames.length} collections`;

        // Build stickers — use localStorage metadata if available, skeleton otherwise
        const allMeta = loadVolMeta();
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

    sticker.innerHTML = `
            <div class="file-title">${escapeHtml(vol.volname)}</div>
            <div class="file-details">
                <div class="file-size">${vol.nbfiles === '?' ? '…' : vol.nbfiles + ' crosswords'}</div>
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

function goBackToVolumes() {
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

    document.getElementById('page-title').textContent = 'Choose a collection:';
    document.getElementById('stats-files').textContent = '';

    const loading = document.getElementById('loading');
    loading.textContent = 'Loading collections...';
    loading.style.display = 'none'; // will be shown if needed

    statusMap = getStatusByFilename(); // load existing status from localStorage
    loadVolumes();
}

// ── Archive / puzzle loader ──────────────────────────────────────────────

// --- Replace your existing loadVolume function with this ---
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

        document.getElementById('stats-files').textContent = `Crosswords: ${puzzles.length}`;

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
function getStatusByFilename() {
    const results = {};
    //const voltitle = currentVol.vol.volname;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.endsWith("_misc")) {
            try {
                const miscData = JSON.parse(localStorage.getItem(key));
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
    let stat_str = "Unplayed";

    // 1. Check if the file exists in statusMap
    if (statusMap.hasOwnProperty(filename)) {
        const vt = statusMap[filename]["voltitle"];
        const recordedStat = statusMap[filename]["status"];

        // 2. Only apply the status if the volume title matches
        if (vt === currentVolTitle) {
            stat = recordedStat;
            if (stat === 1) {
                sticker.classList.add('status-1');
                stat_str = "In Progress...";
            } else if (stat === 2) {
                sticker.classList.add('status-2');
                stat_str = "COMPLETED";
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
function refreshVolume(sortOrder = 'asc') {
    if (!currentVol) return;
    statusMap = getStatusByFilename(); // load existing status from localStorage
    loadVolume(currentVol.url, currentVol.vol.volname, sortOrder = sortOrder);
}
document.getElementById("btn-refresh").addEventListener("click", refreshVolume);
document.getElementById("btn-resort").addEventListener("click", () => { sortOrder = 'title'; refreshVolume(sortOrder); });

// ── Boot ─────────────────────────────────────────────────────────────────

let statusMap = getStatusByFilename(); // load existing status from localStorage
loadVolumes();
