let wrapper = document.getElementById("map-wrapper");
let container = document.getElementById("zoom-container");
let svg = document.getElementById("indonesia-map");

let start = { x: 0, y: 0 };
let scale = 1;
let clickStartX = 0, clickStartY = 0;
let limitMovement = 5;
let pointX = 0, pointY = 0;
let MAX_SCALE = 5, MIN_SCALE = 1;
let isPanning = false;     
let points = [];
let nextId = 1;
let connectSourceId = null;
let tempConnectionData = null;
let pendingCoord = null;
let selectedLine = null;

// SVG koordinat harus 1:1 dengan koordinat CSS marker
function fixSvgSize() {
    const w = container.scrollWidth;
    const h = container.scrollHeight;
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.width = w + "px";
    svg.style.height = h + "px";
    svg.style.pointerEvents = "none";
    svg.removeAttribute("viewBox");
}

function updateContainer() {
    container.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
}

function clampPan() {
    let wrapperW = wrapper.clientWidth, wrapperH = wrapper.clientHeight;
    let containerW = container.scrollWidth, containerH = container.scrollHeight;
    pointX = Math.min(0, Math.max(wrapperW - containerW * scale, pointX));
    pointY = Math.min(0, Math.max(wrapperH - containerH * scale, pointY));
}

function zoomAt(cx, cy, factor) {
    let newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    let xs = (cx - pointX) / scale;
    let ys = (cy - pointY) / scale;
    pointX = cx - xs * newScale;
    pointY = cy - ys * newScale;
    scale = newScale;
    updateContainer();
    clampPan();
}
   
// Ctrl+Scroll zoom mengikuti posisi kursor
wrapper.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

// Cegah browser zoom native sepenuhnya
window.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.key === "+" || e.key === "=" || e.key === "NumpadAdd")) {
        e.preventDefault();
        zoomAt(wrapper.clientWidth / 2, wrapper.clientHeight / 2, 1.1);
    }
    if (e.ctrlKey && (e.key === "-" || e.key === "NumpadSubtract")) {
        e.preventDefault();
        zoomAt(wrapper.clientWidth / 2, wrapper.clientHeight / 2, 0.9);
    }
    if (e.ctrlKey && e.key === "0") e.preventDefault();
    if ((e.key === "Delete" || e.key === "Backspace") && selectedLine) {
        e.preventDefault();
        deleteSelectedConnection();
    }
});

wrapper.addEventListener("mousedown", (e) => {
    isPanning = true;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
    start = { x: e.clientX - pointX, y: e.clientY - pointY };
});

wrapper.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    pointX = e.clientX - start.x;
    pointY = e.clientY - start.y;
    clampPan();
    updateContainer();
});

wrapper.addEventListener("mouseup", () => { isPanning = false; });

container.addEventListener("dblclick", (e) => {
    if (Math.abs(e.clientX - clickStartX) > limitMovement || Math.abs(e.clientY - clickStartY) > limitMovement) return;
    if (e.target.closest(".marker-el")) return;
    showModal((e.clientX - pointX) / scale, (e.clientY - pointY) / scale);
});  

wrapper.addEventListener("click", (e) => {
    if (!e.target.closest("line")) deselectLine();
});

// ─── MODAL NAMA KOTA ───────────────────────────────────────
document.body.insertAdjacentHTML("beforeend", `
    <div id="modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;align-items:center;justify-content:center;">
        <div style="background:white;border-radius:12px;padding:24px;min-width:280px;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <p style="margin:0 0 10px;font-weight:700;">📍 Nama Kota</p>
            <input id="modal-input" type="text" placeholder="Masukkan nama kota..."
                style="width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;" />
            <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                <button id="modal-cancel" style="padding:8px 16px;border:1.5px solid #ddd;border-radius:8px;background:white;cursor:pointer;">Batal</button>
                <button id="modal-submit" style="padding:8px 16px;border:none;border-radius:8px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Tambah</button>
            </div>
        </div>
    </div>
`);

// ─── MODAL TRANSPORTASI ────────────────────────────────────
document.body.insertAdjacentHTML("beforeend", `
    <div id="connection-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;">
        <div style="background:white;border-radius:12px;padding:24px;min-width:320px;font-family:sans-serif;">
            <h3 style="margin:0 0 16px 0;">Detail Transportasi</h3>
            <label style="display:block;margin-bottom:5px;font-size:14px;">Jarak (km):</label>
            <input id="conn-distance" type="number" min="1" style="width:100%;padding:8px;margin-bottom:15px;border:1px solid #ddd;border-radius:5px;box-sizing:border-box;">
            <label style="display:block;margin-bottom:5px;font-size:14px;">Mode Transportasi:</label>
            <select id="conn-mode" style="width:100%;padding:8px;margin-bottom:20px;border:1px solid #ddd;border-radius:5px;box-sizing:border-box;">
                <option value="train">🚆 Train (hijau - 120km/h - Rp500/km)</option>
                <option value="bus">🚌 Bus (ungu - 80km/h - Rp100/km)</option>
                <option value="airplane">✈️ Airplane (hitam - 800km/h - Rp1000/km)</option>
            </select>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="conn-cancel" style="padding:8px 16px;border:1px solid #ddd;background:white;border-radius:5px;cursor:pointer;">Batal</button>
                <button id="conn-submit" style="padding:8px 16px;border:none;background:#2563eb;color:white;border-radius:5px;font-weight:600;cursor:pointer;">Simpan Koneksi</button>
            </div>
        </div>
    </div>
`);

// ─── FIND ROUTE PANEL ──────────────────────────────────────
document.body.insertAdjacentHTML("beforeend", `
    <div id="find-route-panel" style="position:fixed;top:20px;left:20px;z-index:8000;background:white;border-radius:16px;padding:20px;width:300px;font-family:sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.18);max-height:calc(100vh - 40px);overflow-y:auto;">
        <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:800;">Find Route</h2>
        <div style="position:relative;margin-bottom:10px;">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:16px;">📍</span>
            <input id="route-from" type="text" placeholder="From..." autocomplete="off"
                style="width:100%;padding:10px 10px 10px 34px;border:1.5px solid #ddd;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;" />
        </div>
        <div style="position:relative;margin-bottom:14px;">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:16px;">📍</span>
            <input id="route-to" type="text" placeholder="To..." autocomplete="off"
                style="width:100%;padding:10px 10px 10px 34px;border:1.5px solid #ddd;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;" />
        </div>
        <button id="route-search" disabled style="width:100%;padding:11px;border:none;border-radius:10px;background:#a855f7;color:white;font-weight:700;font-size:15px;cursor:not-allowed;opacity:0.5;transition:opacity 0.2s;">Search</button>
        <div style="display:flex;align-items:center;gap:8px;margin:14px 0 10px 0;font-size:13px;color:#888;">
            <span>Sort By</span>
            <button id="sort-fastest" style="background:none;border:none;cursor:pointer;font-size:13px;font-weight:700;color:#a855f7;text-decoration:underline;">Fastest</button>
            <button id="sort-cheapest" style="background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#888;">Cheapest</button>
        </div>
        <div id="route-results"></div>
    </div>
`);

// ─── REFS ──────────────────────────────────────────────────
const overlay      = document.getElementById("modal-overlay");
const modalInput   = document.getElementById("modal-input");
const connModal    = document.getElementById("connection-modal");
const connDistance = document.getElementById("conn-distance");
const connMode     = document.getElementById("conn-mode");
const routeFrom    = document.getElementById("route-from");
const routeTo      = document.getElementById("route-to");
const routeSearch  = document.getElementById("route-search");
const routeResults = document.getElementById("route-results");
const sortFastest  = document.getElementById("sort-fastest");
const sortCheapest = document.getElementById("sort-cheapest");

let sortMode   = "fastest";
let lastRoutes = [];

const TRANSPORT_MODES = {
    train:    { color: "#33E339", speed: 120, cost: 500,  label: "Train"    },
    bus:      { color: "#A83BE8", speed: 80,  cost: 100,  label: "Bus"      },
    airplane: { color: "#000000", speed: 800, cost: 1000, label: "Airplane" }
};

// ─── MODAL KOTA ────────────────────────────────────────────
function showModal(x, y) {
    pendingCoord = { x, y };
    modalInput.value = "";
    overlay.style.display = "flex";
    setTimeout(() => modalInput.focus(), 50);
}

function hideModal() {
    overlay.style.display = "none";
    pendingCoord = null;
}

document.getElementById("modal-cancel").addEventListener("click", hideModal);
document.getElementById("modal-submit").addEventListener("click", () => {
    const name = modalInput.value.trim();
    if (!name) return modalInput.focus();
    addMarker(pendingCoord.x, pendingCoord.y, name);
    saveToStorage();
    hideModal();
});
modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("modal-submit").click();
    if (e.key === "Escape") hideModal();
});

// ─── MODAL TRANSPORTASI ────────────────────────────────────
document.getElementById("conn-cancel").addEventListener("click", () => {
    connModal.style.display = "none";
    cancelConnect();
});

document.getElementById("conn-submit").addEventListener("click", () => {
    const distance = parseFloat(connDistance.value);
    const modeKey  = connMode.value;
    if (!distance || distance <= 0) { alert("Masukkan jarak yang valid"); return; }

    const { source, target } = tempConnectionData;
    const mode = TRANSPORT_MODES[modeKey];

    if (source.connections.find(c => c.to === target.id && c.mode === modeKey)) {
        alert(`Koneksi ${mode.label} antara kota ini sudah ada!`);
        return;
    }

    const conn = { to: target.id, distance, mode: modeKey, color: mode.color, speed: mode.speed, cost: mode.cost };
    source.connections.push(conn);
    target.connections.push({ ...conn, to: source.id });

    drawLine(source, target, modeKey, distance);
    saveToStorage();
    connModal.style.display = "none";
    cancelConnect();
});

// ─── FIND ROUTE ────────────────────────────────────────────
function getPointByName(name) {
    if (!name || !name.trim()) return null;
    return points.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase()) || null;
}
function validateRouteInputs() {
    const fromVal = routeFrom.value.trim();
    const toVal   = routeTo.value.trim();
    
    const fromPoint = getPointByName(fromVal);
    const toPoint   = getPointByName(toVal);
    
    // Update border colors
    routeFrom.style.borderColor = !fromVal ? "#ddd" : (fromPoint ? "#22c55e" : "#ef4444");
    routeTo.style.borderColor   = !toVal   ? "#ddd" : (toPoint   ? "#22c55e" : "#ef4444");
    
    // Enable/disable search button
    const isValid = fromPoint && toPoint && fromVal.toLowerCase() !== toVal.toLowerCase();
    routeSearch.disabled = !isValid;
    routeSearch.style.opacity = isValid ? "1" : "0.5";
    routeSearch.style.cursor  = isValid ? "pointer" : "not-allowed";
}

routeFrom.addEventListener("input", validateRouteInputs);
routeTo.addEventListener("input",   validateRouteInputs);

function getAllRoutes(fromId, toId) {
    // Pastikan input adalah number
    fromId = Number(fromId);
    toId = Number(toId);
    
    const results = [];
    // Queue menyimpan path (array ID) dan edges (detail perjalanan)
    const queue = [{ path: [fromId], edges: [] }];
    const visited = new Set();
    
    // Batasi pencarian agar tidak infinite loop atau membebani browser
    let iterations = 0;
    const maxIterations = 2000;

    while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        const { path, edges } = queue.shift();
        const current = Number(path[path.length - 1]);

        // Jika sampai ke tujuan
        if (current === toId) {
            results.push({ path, edges });
            if (results.length >= 10) break; // Ambil 10 rute pertama yang ditemukan
            continue;
        }

        const point = points.find(p => Number(p.id) === current);
        if (!point || !point.connections) continue;

        for (const conn of point.connections) {
            const nId = Number(conn.to);
            
            // Cegah cycling (memutar di kota yang sama dalam satu rute)
            if (path.includes(nId)) continue;

            const modeData = TRANSPORT_MODES[conn.mode];
            queue.push({
                path: [...path, nId],
                edges: [...edges, {
                    from: current,
                    to: nId,
                    mode: conn.mode,
                    distance: Number(conn.distance),
                    speed: modeData.speed,
                    cost: modeData.cost * Number(conn.distance)
                }]
            });
        }
    }
    return results;
}

function routeStats(edges) {
    return edges.reduce((acc, e) => ({
        totalDuration: acc.totalDuration + e.distance / e.speed,
        totalCost:     acc.totalCost     + e.cost
    }), { totalDuration: 0, totalCost: 0 });
}

function fmtDuration(h) {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return hh === 0 ? `${mm}m` : mm === 0 ? `${hh}h` : `${hh}h ${mm}m`;
}

function fmtCost(c) { return "Rp" + c.toLocaleString("id-ID"); }

function renderRoutes(routes) {
    if (!routes.length) {
        routeResults.innerHTML = `<p style="color:#888;font-size:13px;text-align:center;margin-top:12px;">Tidak ada rute ditemukan.</p>`;
        return;
    }
    routeResults.innerHTML = routes.map(r => {
        const fromName = points.find(p => p.id === r.path[0])?.name || "";
        const toName   = points.find(p => p.id === r.path[r.path.length - 1])?.name || "";
        const { totalDuration, totalCost } = routeStats(r.edges);
        const steps = r.edges.map((e, idx) => {
            const fn = points.find(p => p.id === e.from)?.name || e.from;
            const tn = points.find(p => p.id === e.to)?.name   || e.to;
            const m  = TRANSPORT_MODES[e.mode];
            return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#444;margin-bottom:3px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${m.color};border:1px solid #ccc;flex-shrink:0;"></span>
                <span>${idx + 1}. ${fn} → ${tn} (${m.label})</span>
            </div>`;
        }).join("");
        return `
        <div style="background:#f9f9fb;border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid #ede9fe;">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px;">
                ${fromName} - ${toName}
                <span style="float:right;font-size:13px;font-weight:600;color:#6b7280;">${fmtDuration(totalDuration)}</span>
            </div>
            <div style="margin-bottom:8px;">${steps}</div>
            <div style="font-weight:700;font-size:13px;color:#6b21a8;">${fmtCost(totalCost)}</div>
        </div>`;
    }).join("");
}

function doSearch() {
    const fromName = routeFrom.value.trim();
    const toName   = routeTo.value.trim();
    
    const fromPoint = getPointByName(fromName);
    const toPoint   = getPointByName(toName);
    
    if (!fromPoint || !toPoint) {
        routeResults.innerHTML = `<p style="color:#ef4444;font-size:13px;text-align:center;margin-top:12px;">
            Kota tidak ditemukan! Pastikan nama kota sesuai dengan yang terdaftar.
        </p>`;
        return;
    }
    
    if (fromName.toLowerCase() === toName.toLowerCase()) {
        routeResults.innerHTML = `<p style="color:#ef4444;font-size:13px;text-align:center;margin-top:12px;">
            Asal dan tujuan tidak boleh sama!
        </p>`;
        return;
    }
    
    const routes = getAllRoutes(fromPoint.id, toPoint.id);
    
    if (!routes.length) {
        routeResults.innerHTML = `<p style="color:#888;font-size:13px;text-align:center;margin-top:12px;">
            Tidak ada rute ditemukan antara ${fromPoint.name} dan ${toPoint.name}.<br>
            Pastikan kedua kota terhubung dengan koneksi transportasi.
        </p>`;
        return;
    }
    
    // Filter unique routes
    const seen = new Set();
    const uniqueRoutes = routes.filter(r => {
        const key = r.edges.map(e => `${e.from}-${e.to}-${e.mode}`).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    
    uniqueRoutes.sort((a, b) => {
        const sa = routeStats(a.edges), sb = routeStats(b.edges);
        return sortMode === "fastest"
            ? sa.totalDuration - sb.totalDuration
            : sa.totalCost - sb.totalCost;
    });
    
    lastRoutes = uniqueRoutes.slice(0, 10);
    renderRoutes(lastRoutes);
}

routeSearch.addEventListener("click", doSearch);

function setSortMode(mode) {
    sortMode = mode;
    sortFastest.style.color          = mode === "fastest"  ? "#a855f7" : "#888";
    sortFastest.style.textDecoration = mode === "fastest"  ? "underline" : "none";
    sortFastest.style.fontWeight     = mode === "fastest"  ? "700" : "600";
    sortCheapest.style.color         = mode === "cheapest" ? "#a855f7" : "#888";
    sortCheapest.style.textDecoration= mode === "cheapest" ? "underline" : "none";
    sortCheapest.style.fontWeight    = mode === "cheapest" ? "700" : "600";
    if (lastRoutes.length) doSearch();
}

sortFastest.addEventListener("click",  () => setSortMode("fastest"));
sortCheapest.addEventListener("click", () => setSortMode("cheapest"));

// ─── MARKER ────────────────────────────────────────────────
function addMarker(x, y, name, forceId = null) {
    const id = Number(forceId !== null ? forceId : nextId++);
    if (forceId !== null && Number(forceId) >= nextId) nextId = Number(forceId) + 1;

    const el = document.createElement("div");
    el.className = "marker-el";
    el.dataset.id = id;
    el.style.cssText = `
        position:absolute;left:${x}px;top:${y}px;
        transform:translate(-50%,-100%);
        display:flex;flex-direction:column;align-items:center;gap:4px;
        cursor:default;z-index:10;
    `;

    el.innerHTML = `
        <div style="background:#f1f1f1;color:black;padding:3px 10px;
            border-radius:20px;font-size:12px;font-weight:600;
            font-family:sans-serif;display:flex;align-items:center;gap:6px;
            white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            <span>${name}</span>
            <div style="width:1px;height:15px;background:#000;"></div>
            <button class="btn-connect" style="background:#3b82f6;border:none;color:white;
                border-radius:50%;width:15px;height:15px;font-size:9px;
                cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;">🔗</button>
            <div style="width:1px;height:15px;background:#000;"></div>
            <button class="btn-delete" style="background:#ef4444;border:none;color:white;
                border-radius:50%;width:15px;height:15px;font-size:10px;
                cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <img src="./location3.png" style="width:28px;height:auto;pointer-events:none;" />
    `;

    const point = { id, x, y, name, el, connections: [] };
    points.push(point);
    container.append(el);

    el.querySelector(".btn-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteMarker(id);
    });

    el.querySelector(".btn-connect").addEventListener("click", (e) => {
        e.stopPropagation();
        if (connectSourceId !== null && connectSourceId !== id) finishConnect(id);
        else    (id);
    });

    return point;
}

function deleteMarker(id) {
    const index = points.findIndex(p => p.id === id);
    if (index === -1) return;
    svg.querySelectorAll("[data-connects]").forEach(el => {
        if (el.dataset.connects.split("-").includes(String(id))) el.remove();
    });
    points.forEach(p => { p.connections = p.connections.filter(c => c.to !== id); });
    points[index].el.remove();
    points.splice(index, 1);
    saveToStorage();
    validateRouteInputs();
}

// ─── KONEKSI ───────────────────────────────────────────────
function startConnect(sourceId) {
    if (connectSourceId === sourceId) { cancelConnect(); return; }
    cancelConnect();
    connectSourceId = sourceId;
    points.find(p => p.id === sourceId).el.style.filter = "drop-shadow(0 0 8px #a855f7)";
    wrapper.style.cursor = "crosshair";
}

function cancelConnect() {
    if (connectSourceId !== null) {
        const src = points.find(p => p.id === connectSourceId);
        if (src) src.el.style.filter = "";
    }
    connectSourceId = null;
    wrapper.style.cursor = "default";
}

function finishConnect(targetId) {
    const source = points.find(p => p.id === connectSourceId);
    const target = points.find(p => p.id === targetId);
    if (!source || !target || source.id === target.id) { cancelConnect(); return; }
    tempConnectionData = { source, target };
    connDistance.value = "";
    connMode.value = "train";
    connModal.style.display = "flex";
    cancelConnect();
}

// ─── DRAW LINE ─────────────────────────────────────────────
// Offset PERPENDICULAR terhadap arah garis agar bus/airplane tidak meleset
const LINE_OFFSETS  = { train: 0, bus: -8, airplane: 8 };
const LABEL_OFFSETS = { train: -12, bus: 10, airplane: -24 };

function drawLine(source, target, modeKey, distance) {
    const mode       = TRANSPORT_MODES[modeKey];
    const connectKey = `${source.id}-${target.id}`;

    const dx  = target.x - source.x;
    const dy  = target.y - source.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Vektor tegak lurus (rotasi 90°)
    const px  = -dy / len;
    const py  =  dx / len;

    const lineOff = LINE_OFFSETS[modeKey] ?? 0;
    const x1 = source.x + px * lineOff;
    const y1 = source.y + py * lineOff;
    const x2 = target.x + px * lineOff;
    const y2 = target.y + py * lineOff;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("stroke", mode.color);
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("stroke-linecap", "round");
    line.style.cursor = "pointer";
    line.style.pointerEvents = "stroke";
    line.dataset.connects = connectKey;
    line.dataset.mode = modeKey;
    line.addEventListener("click", (e) => { e.stopPropagation(); selectLine(line); });
    svg.appendChild(line);

    // Label berjejeran tegak lurus dari midpoint
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const labelOff = LABEL_OFFSETS[modeKey] ?? -12;

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", mx + px * labelOff);
    text.setAttribute("y", my + py * labelOff);
    text.setAttribute("fill", mode.color);
    text.setAttribute("font-size", "11px");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("style", "paint-order:stroke;stroke:white;stroke-width:3px;pointer-events:none;");
    text.textContent = `${distance} km`;
    text.dataset.connects = connectKey;
    text.dataset.mode = modeKey;
    svg.appendChild(text);
}

// ─── SELECT/HAPUS GARIS ────────────────────────────────────
function selectLine(lineEl) {
    deselectLine();
    selectedLine = lineEl;
    lineEl.style.strokeWidth = "4";
    lineEl.style.filter = "drop-shadow(0 0 4px rgba(0,0,0,0.5))";
}

function deselectLine() {
    if (!selectedLine) return;
    selectedLine.style.strokeWidth = "2.5";
    selectedLine.style.filter = "";
    selectedLine = null;
}

function deleteSelectedConnection() {
    if (!selectedLine) return;
    const connects = selectedLine.dataset.connects;
    const modeKey  = selectedLine.dataset.mode;
    const [idA, idB] = connects.split("-").map(Number);
    const pA = points.find(p => p.id === idA);
    const pB = points.find(p => p.id === idB);
    if (pA) pA.connections = pA.connections.filter(c => !(c.to === idB && c.mode === modeKey));
    if (pB) pB.connections = pB.connections.filter(c => !(c.to === idA && c.mode === modeKey));
    svg.querySelectorAll(`[data-connects="${connects}"][data-mode="${modeKey}"],
                          [data-connects="${idB}-${idA}"][data-mode="${modeKey}"]`)
        .forEach(el => el.remove());
    selectedLine = null;
    saveToStorage();
}

// ─── LOCALSTORAGE ──────────────────────────────────────────
function saveToStorage() {
    localStorage.setItem("map-points", JSON.stringify(
        points.map(p => ({ id: p.id, x: p.x, y: p.y, name: p.name, connections: p.connections }))
    ));
}

function loadFromStorage() {
    let data;
    try { 
        data = JSON.parse(localStorage.getItem("map-points")); 
    } catch { return; }
    
    if (!data || !data.length) return;

    // 1. Bersihkan points lama jika ada
    points = [];
    nextId = Math.max(...data.map(p => Number(p.id))) + 1;

    // 2. Gambar ulang semua marker
    data.forEach(p => {
        const pt = addMarker(p.x, p.y, p.name, p.id);
        // Penting: Masukkan kembali data koneksi ke objek point di memori
        pt.connections = p.connections || [];
    });

    // 3. Gambar garis SVG (hanya sekali per pasangan)
    const drawn = new Set();
    data.forEach(p => {
        (p.connections || []).forEach(conn => {
            const pairKey = [p.id, conn.to].sort().join('-') + conn.mode;
            if (!drawn.has(pairKey)) {
                const src = points.find(pt => Number(pt.id) === Number(p.id));
                const tgt = points.find(pt => Number(pt.id) === Number(conn.to));
                if (src && tgt) {
                    drawLine(src, tgt, conn.mode, conn.distance);
                    drawn.add(pairKey);
                }
            }
        });
    });
}

window.addEventListener("load", () => {
    fixSvgSize();
    loadFromStorage();
});