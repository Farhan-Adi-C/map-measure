let wrapper = document.getElementById("map-wrapper")
let container = document.getElementById("zoom-container")

let start = { x: 0, y: 0 }
let scale = 1;
let clickStartX = 0, clickStartY = 0;
let limitMovement = 5;
let pointX = 0, pointY = 0;
let MAX_SCALE = 5, MIN_SCALE = 1;
let isPanning = false;
let points = [];
let nextId = 1;
let connectMode = false;
let connectSourceId = null;
let tempConnectionData = null;
let pendingCoord = null;

// ─── ZOOM & PAN ────────────────────────────────────────────
function updateContainer() {
    container.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
}

function clampPan() {
    let wrapperW = wrapper.clientWidth, wrapperH = wrapper.clientHeight;
    let containerW = container.scrollWidth, containerH = container.scrollHeight;
    pointX = Math.min(0, Math.max(wrapperW - containerW * scale, pointX));
    pointY = Math.min(0, Math.max(wrapperH - containerH * scale, pointY));
}

wrapper.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    let xs = (e.clientX - pointX) / scale;
    let ys = (e.clientY - pointY) / scale;
    let newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    pointX = e.clientX - xs * newScale;
    pointY = e.clientY - ys * newScale;
    scale = newScale;
    updateContainer();
    clampPan();
}, { passive: false });

wrapper.addEventListener("mousedown", (e) => {
    isPanning = true;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
    start = { x: e.clientX - pointX, y: e.clientY - pointY };
    clampPan();
});

wrapper.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    pointX = e.clientX - start.x;
    pointY = e.clientY - start.y;
    clampPan();
    updateContainer();
});

wrapper.addEventListener("mouseup", () => { isPanning = false; });

container.addEventListener("click", (e) => {
    const deltaX = Math.abs(e.clientX - clickStartX);
    const deltaY = Math.abs(e.clientY - clickStartY);
    if (deltaX > limitMovement || deltaY > limitMovement) return;

    const coorX = (e.clientX - pointX) / scale;
    const coorY = (e.clientY - pointY) / scale;
    showModal(coorX, coorY);
});

// ─── MODAL NAMA KOTA ───────────────────────────────────────
document.body.insertAdjacentHTML("beforeend", `
    <div id="modal-overlay" style="
        display:none; position:fixed; inset:0;
        background:rgba(0,0,0,0.4); z-index:9999;
        align-items:center; justify-content:center;">
        <div style="background:white; border-radius:12px; padding:24px;
            min-width:280px; font-family:sans-serif;
            box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <p style="margin:0 0 10px; font-weight:700;">📍 Nama Kota</p>
            <input id="modal-input" type="text" placeholder="Masukkan nama kota..."
                style="width:100%; padding:8px 12px; border:1.5px solid #ddd;
                border-radius:8px; font-size:14px; box-sizing:border-box;" />
            <div style="display:flex; gap:8px; margin-top:16px; justify-content:flex-end;">
                <button id="modal-cancel" style="padding:8px 16px; border:1.5px solid #ddd;
                    border-radius:8px; background:white; cursor:pointer;">Batal</button>
                <button id="modal-submit" style="padding:8px 16px; border:none;
                    border-radius:8px; background:#2563eb; color:white;
                    font-weight:600; cursor:pointer;">Tambah</button>
            </div>
        </div>
    </div>
`);

// ─── MODAL TRANSPORTASI ────────────────────────────────────
document.body.insertAdjacentHTML("beforeend", `
    <div id="connection-modal" style="
        display:none; position:fixed; inset:0;
        background:rgba(0,0,0,0.5); z-index:10000;
        align-items:center; justify-content:center;">
        <div style="background:white; border-radius:12px; padding:24px;
            min-width:320px; font-family:sans-serif;">
            <h3 style="margin-top:0;">Detail Transportasi</h3>
            <label style="display:block; margin-bottom:5px; font-size:14px;">Jarak (km):</label>
            <input id="conn-distance" type="number" style="width:100%; padding:8px;
                margin-bottom:15px; border:1px solid #ddd; border-radius:5px;">
            <label style="display:block; margin-bottom:5px; font-size:14px;">Mode Transportasi:</label>
            <select id="conn-mode" style="width:100%; padding:8px; margin-bottom:20px;
                border:1px solid #ddd; border-radius:5px;">
                <option value="train">Train (#33E339 - 120km/h)</option>
                <option value="bus">Bus (#A83BE8 - 80km/h)</option>
                <option value="airplane">Airplane (#000000 - 800km/h)</option>
            </select>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="conn-cancel" style="padding:8px 16px; border:1px solid #ddd;
                    background:white; border-radius:5px; cursor:pointer;">Batal</button>
                <button id="conn-submit" style="padding:8px 16px; border:none;
                    background:#2563eb; color:white; border-radius:5px;
                    font-weight:600; cursor:pointer;">Simpan Koneksi</button>
            </div>
        </div>
    </div>
`);

const overlay     = document.getElementById("modal-overlay");
const modalInput  = document.getElementById("modal-input");
const connModal   = document.getElementById("connection-modal");
const connDistance = document.getElementById("conn-distance");
const connMode    = document.getElementById("conn-mode");
const svg         = document.getElementById("indonesia-map");

const TRANSPORT_MODES = {
    train:    { color: "#33E339", speed: 120, cost: 500 },
    bus:      { color: "#A83BE8", speed: 80,  cost: 100 },
    airplane: { color: "#000000", speed: 800, cost: 1000 }
};

// ─── MODAL HANDLERS ────────────────────────────────────────
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
    saveToStorage(); // ← BARU: save setelah tambah titik
    hideModal();
});
modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("modal-submit").click();
    if (e.key === "Escape") hideModal();
});

document.getElementById("conn-cancel").addEventListener("click", () => {
    connModal.style.display = "none";
    cancelConnect();
});

document.getElementById("conn-submit").addEventListener("click", () => {
    const distance = parseFloat(connDistance.value);
    const modeKey = connMode.value;
    if (!distance || distance <= 0) { alert("Masukkan jarak yang valid"); return; }

    const { source, target } = tempConnectionData;
    const mode = TRANSPORT_MODES[modeKey];

    const connectionObj = { to: target.id, distance, mode: modeKey, ...mode };
    source.connections.push(connectionObj);
    target.connections.push({ ...connectionObj, to: source.id });

    drawLine(source, target, modeKey, distance);
    saveToStorage(); // ← BARU: save setelah tambah koneksi

    connModal.style.display = "none";
    cancelConnect();
});

// ─── MARKER ────────────────────────────────────────────────
// PERUBAHAN: tambah parameter forceId untuk keperluan load
function addMarker(x, y, name, forceId = null) {
    const id = forceId !== null ? forceId : nextId++;

    const el = document.createElement("div");
    el.style.cssText = `
        position:absolute; left:${x}px; top:${y}px;
        transform:translate(-50%, -100%);
        display:flex; flex-direction:column;
        align-items:center; gap:4px; cursor:default;
    `;

    el.innerHTML = `
        <div style="background:#f1f1f1; color:black; padding:3px 10px;
            border-radius:20px; font-size:12px; font-weight:600;
            font-family:sans-serif; display:flex; align-items:center; gap:6px;
            white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            <span>${name}</span>
            <div style="width:1px; height:15px; background:#000;"></div>
            <button class="btn-connect" style="background:#3b82f6; border:none; color:white;
                border-radius:50%; width:15px; height:15px; font-size:9px;
                cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center;">🔗</button>
            <div style="width:1px; height:15px; background:#000;"></div>
            <button class="btn-delete" style="background:#ef4444; border:none; color:white;
                border-radius:50%; width:15px; height:15px; font-size:10px;
                cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center;">✕</button>
        </div>
        <img src="./location3.png" style="width:28px; height:auto; pointer-events:none;" />
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
        startConnect(id);
    });
}

function deleteMarker(id) {
    const index = points.findIndex(p => p.id === id);
    if (index === -1) return;

    svg.querySelectorAll("line, text").forEach(el => {
        if (el.dataset.connects) {
            const ids = el.dataset.connects.split("-");
            if (ids.includes(String(id))) el.remove();
        }
    });

    points.forEach(p => {
        p.connections = p.connections.filter(c => c.to !== id);
    });

    points[index].el.remove();
    points.splice(index, 1);
    saveToStorage(); // ← BARU: save setelah hapus titik
}

// ─── KONEKSI ───────────────────────────────────────────────
function startConnect(sourceId) {
    if (connectMode && connectSourceId === sourceId) { cancelConnect(); return; }
    if (connectMode && connectSourceId !== null) { finishConnect(sourceId); return; }

    connectMode = true;
    connectSourceId = sourceId;
    points.find(p => p.id === sourceId).el.style.filter = "drop-shadow(0 0 6px purple)";
    wrapper.style.cursor = "crosshair";
}

function cancelConnect() {
    if (connectSourceId !== null) {
        const src = points.find(p => p.id === connectSourceId);
        if (src) src.el.style.filter = "";
    }
    connectMode = false;
    connectSourceId = null;
    wrapper.style.cursor = "default";
}

function finishConnect(targetId) {
    const source = points.find(p => p.id === connectSourceId);
    const target = points.find(p => p.id === targetId);
    if (!source || !target || source.id === target.id) { cancelConnect(); return; }

    tempConnectionData = { source, target };
    connDistance.value = "";
    connModal.style.display = "flex";
}

function drawLine(source, target, modeKey, distance) {
    const mode = TRANSPORT_MODES[modeKey];
    let offset = modeKey === "bus" ? -5 : modeKey === "airplane" ? 5 : 0;

    const x1 = source.x, y1 = source.y - 15 + offset;
    const x2 = target.x, y2 = target.y - 15 + offset;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("stroke", mode.color);
    line.setAttribute("stroke-width", "2");
    line.dataset.connects = `${source.id}-${target.id}`;
    line.dataset.mode = modeKey;
    svg.appendChild(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", (x1 + x2) / 2);
    text.setAttribute("y", (y1 + y2) / 2 - 5);
    text.setAttribute("fill", mode.color);
    text.setAttribute("font-size", "10px");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("style", "paint-order:stroke; stroke:white; stroke-width:3px;");
    text.textContent = `${distance} km`;
    text.dataset.connects = `${source.id}-${target.id}`;
    svg.appendChild(text);
}

// ─── LOCALSTORAGE ──────────────────────────────────────────
function saveToStorage() {
    // Simpan hanya data murni, tanpa el (DOM tidak bisa di-JSON-kan)
    const data = points.map(p => ({
        id: p.id, x: p.x, y: p.y,
        name: p.name, connections: p.connections
    }));
    localStorage.setItem("map-points", JSON.stringify(data));
}

function loadFromStorage() {
    const raw = localStorage.getItem("map-points");
    if (!raw) return;

    const data = JSON.parse(raw);
    if (data.length === 0) return;

    // Restore nextId agar tidak bentrok dengan id lama
    nextId = Math.max(...data.map(p => p.id)) + 1;

    // Buat ulang semua marker dengan id yang sama
    data.forEach(p => addMarker(p.x, p.y, p.name, p.id));

    // Gambar ulang semua garis
    // p.id < conn.to → cegah garis digambar 2x (A→B dan B→A)
    data.forEach(p => {
        p.connections.forEach(conn => {
            if (p.id < conn.to) {
                const source = points.find(pt => pt.id === p.id);
                const target = points.find(pt => pt.id === conn.to);
                if (source && target) drawLine(source, target, conn.mode, conn.distance);
            }
        });
    });
}

// Jalankan saat halaman pertama kali dibuka
loadFromStorage();