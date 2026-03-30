// ============================================================
// ELEMEN DOM
// ============================================================

const wrapper = document.getElementById("map-wrapper");
// wrapper  = elemen terluar (.map-wrapper), berfungsi sebagai
//            "jendela" / viewport yang terlihat oleh user.
//            Semua event listener dipasang di sini.

const container = document.getElementById("zoom-container");
// container = elemen yang benar-benar digeser & di-zoom.
//             Kita manipulasi CSS transform-nya.


// ============================================================
// STATE / VARIABEL UTAMA
// ============================================================

let scale  = 1;
// scale = tingkat zoom saat ini.
// 1   → ukuran normal (100%)
// 2   → 2× zoom in
// 0.5 → zoom out 50%
// Nilai ini dikalikan ke properti CSS scale(...)

let pointX = 0;
let pointY = 0;
// pointX, pointY = posisi offset (geseran) container
// terhadap pojok kiri-atas wrapper, dalam satuan piksel.
// (0, 0)  → tidak digeser sama sekali
// (100, 0) → container bergeser 100px ke kanan

let isPanning = false;
// isPanning = flag boolean.
// true  → user sedang menahan mouse dan menggeser (drag)
// false → mouse tidak ditekan / drag sudah selesai

let start = { x: 0, y: 0 };
// start = menyimpan posisi "awal" saat mousedown.
// Digunakan untuk menghitung seberapa jauh mouse bergerak
// dari titik awal drag, sehingga map ikut bergeser sejumlah itu.

const MIN_SCALE = 1;
// MIN_SCALE = batas minimum zoom.
// Nilai 1 artinya map tidak boleh lebih kecil dari ukuran asli.
// Ini juga memastikan map selalu memenuhi layar (tidak ada ruang kosong).

const MAX_SCALE = 5;
// MAX_SCALE = batas maksimum zoom (5× dari ukuran asli).
// Bisa diubah sesuai kebutuhan.


// ============================================================
// FUNGSI UTAMA
// ============================================================

/**
 * clampPan()
 * 
 * Fungsi ini memastikan map TIDAK bisa digeser keluar dari batas layar.
 * Setiap kali pointX atau pointY diubah, fungsi ini dipanggil untuk
 * "menjepit" nilai tersebut agar tetap dalam rentang yang valid.
 *
 * Cara kerjanya:
 *   - Ukuran map setelah di-zoom = ukuran asli × scale
 *   - Map tidak boleh bergeser ke kanan melewati x=0  → maxX = 0
 *   - Map tidak boleh bergeser ke kiri sehingga sisi kanan map
 *     masuk ke dalam layar → minX = lebar_layar - lebar_map_zoom
 */
function clampPan() {
    const wrapperW = wrapper.clientWidth;
    const wrapperH = wrapper.clientHeight;
    // clientWidth/clientHeight = ukuran wrapper (jendela tampilan) dalam px.

    const mapW = container.scrollWidth;
    const mapH = container.scrollHeight;
    // scrollWidth/scrollHeight = ukuran asli container sebelum di-zoom.
    // Ini adalah lebar/tinggi SVG yang sebenarnya.

    // Batas geser horizontal:
    // minX → map tidak boleh bergeser terlalu ke kiri
    //        (sisi kanan map tidak boleh masuk ke dalam layar)
    // maxX → map tidak boleh bergeser ke kanan melewati tepi layar
    //        (sisi kiri map tidak boleh masuk ke dalam layar)
    const minX = wrapperW - mapW * scale;
    const maxX = 0;

    // Batas geser vertikal (logika sama seperti horizontal):
    const minY = wrapperH - mapH * scale;
    const maxY = 0;

    // Math.min dan Math.max digunakan untuk "menjepit" (clamp) nilai:
    // Jika pointX < minX → paksa jadi minX
    // Jika pointX > maxX (0) → paksa jadi 0
    pointX = Math.min(maxX, Math.max(minX, pointX));
    pointY = Math.min(maxY, Math.max(minY, pointY));
}

/**
 * updateView()
 * 
 * Fungsi ini menerapkan nilai pointX, pointY, dan scale ke DOM
 * melalui CSS transform. 
 *
 * Urutan transform SANGAT PENTING:
 *   translate DULU, baru scale.
 *   Jika dibalik (scale dulu), pergerakan pan akan terasa "melompat"
 *   karena translate akan ikut di-scale juga.
 */
function updateView() {
    container.style.transform =
        `translate(${pointX}px, ${pointY}px) scale(${scale})`;
}


// ============================================================
// EVENT: ZOOM dengan scroll mouse (Ctrl + Scroll)
// ============================================================

wrapper.addEventListener("wheel", (e) => {
    // Hanya proses jika user menahan tombol Ctrl saat scroll.
    // Ini mencegah konflik dengan scroll halaman normal.
    if (!e.ctrlKey) return;

    e.preventDefault();
    // Mencegah browser melakukan zoom default (misalnya zoom browser).

    // --- 1. Posisi mouse relatif terhadap viewport ---
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    // clientX/clientY = koordinat mouse di layar (viewport),
    // dihitung dari pojok kiri-atas browser, dalam piksel.

    // --- 2. Hitung posisi mouse di "dunia" SVG (sebelum transform) ---
    // Ini adalah rumus invers dari transform CSS:
    //   layar  = (dunia × scale) + point
    //   dunia  = (layar - point) / scale
    //
    // xs, ys = titik di SVG yang sedang berada tepat di bawah kursor.
    // Kita perlu tahu ini agar setelah zoom, titik yang sama
    // tetap berada di bawah kursor (bukan melompat).
    const xs = (mouseX - pointX) / scale;
    const ys = (mouseY - pointY) / scale;

    // --- 3. Hitung scale baru ---
    // deltaY > 0 → scroll ke bawah → zoom out (scale lebih kecil)
    // deltaY < 0 → scroll ke atas  → zoom in  (scale lebih besar)
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    // zoomFactor = 0.9 → kurangi scale 10%
    // zoomFactor = 1.1 → tambah scale 10%

    // Kalikan scale lama dengan faktor zoom
    let newScale = scale * zoomFactor;

    // Batasi scale agar tidak keluar dari MIN_SCALE dan MAX_SCALE
    // Ini yang salah di kode aslimu: kamu menulis Math.max(1, delta)
    // yang berarti scale selalu di-set ke delta (0.9 atau 1.1), bukan
    // dibatasi dengan benar.
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

    // --- 4. Hitung pointX/Y baru agar titik xs,ys tetap di bawah kursor ---
    // Dari rumus invers tadi:
    //   dunia = (layar - point) / scale
    // Kita balik untuk mencari point:
    //   point = layar - (dunia × newScale)
    //
    // Dengan cara ini, titik xs (di dunia SVG) yang tadinya ada di
    // mouseX (layar) akan tetap ada di mouseX setelah zoom.
    pointX = mouseX - xs * newScale;
    pointY = mouseY - ys * newScale;

    // Update scale ke nilai baru
    scale = newScale;

    // --- 5. Terapkan batas pan agar tidak keluar layar ---
    clampPan();

    // --- 6. Render perubahan ke DOM ---
    updateView();

}, { passive: false });
// passive: false wajib agar e.preventDefault() bisa bekerja.


// ============================================================
// EVENT: MULAI PAN (mousedown)
// ============================================================

wrapper.addEventListener("mousedown", (e) => {
    isPanning = true;
    // Tandai bahwa user sedang mulai drag.

    wrapper.style.cursor = "grabbing";
    // Ubah cursor menjadi tangan menggenggam sebagai feedback visual.

    // Simpan posisi "acuan" drag.
    // Kenapa (e.clientX - pointX)?
    //   Karena saat mouse bergerak, kita akan menghitung:
    //     pointX_baru = e.clientX - start.x
    //   Substitusi:
    //     pointX_baru = e.clientX - (e.clientX_awal - pointX_awal)
    //   Artinya: pointX baru = delta gerakan mouse + posisi awal map.
    //   Dengan cara ini map bergerak sejumlah yang sama dengan gerakan mouse.
    start = {
        x: e.clientX - pointX,
        y: e.clientY - pointY
    };
});


// ============================================================
// EVENT: GERAK PAN (mousemove)
// ============================================================

window.addEventListener("mousemove", (e) => {
    // Jika tidak sedang drag, abaikan event ini.
    if (!isPanning) return;

    // Hitung posisi baru berdasarkan posisi mouse sekarang
    // dikurangi titik acuan yang disimpan saat mousedown.
    // Hasilnya: container bergerak mengikuti mouse secara 1:1.
    pointX = e.clientX - start.x;
    pointY = e.clientY - start.y;

    // Terapkan batas agar map tidak bisa digeser keluar layar.
    clampPan();

    // Render perubahan ke DOM.
    updateView();
});


// ============================================================
// EVENT: SELESAI PAN (mouseup)
// ============================================================

window.addEventListener("mouseup", () => {
    isPanning = false;
    // Tandai bahwa drag sudah selesai.

    wrapper.style.cursor = "grab";
    // Kembalikan cursor ke tangan terbuka.
});


// ============================================================
// INISIALISASI AWAL
// ============================================================

// Terapkan transform awal (0, 0, scale 1) ke DOM
// agar CSS dan state JS sinkron dari awal.
updateView();