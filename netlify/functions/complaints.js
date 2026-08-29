// Netlify Function: catat komplain secara PERMANEN (Netlify Blobs) supaya bisa
// benar-benar ditindaklanjuti oleh owner rep — bukan sekadar tenggelam di riwayat chat.
//
// Setiap komplain dikelompokkan ke sub-kategori: administrasi_legal, keuangan,
// operasional_hotel, atau lain_lain — supaya bisa diteruskan ke tim yang tepat DAN
// supaya owner rep bisa melihat pola/jumlah komplain per kategori.
//
// Endpoint ini dipakai bersamaan dengan notify.js: notify.js mengirim WA sekali (real-time),
// complaints.js ini menyimpan catatannya secara permanen supaya bisa dipantau statusnya
// (Baru / Sedang Diproses / Selesai) lewat panel Admin.

const { getStore } = require("@netlify/blobs");

const SUB_KATEGORI_LABEL = {
  administrasi_legal: "Administrasi & Legal",
  keuangan: "Keuangan",
  operasional_hotel: "Layanan Operasional Hotel",
  lain_lain: "Lain-lain"
};

function generateId(){
  const now = new Date();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KMP-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${rand}`;
}

exports.handler = async (event) => {
  try {
    const store = getStore("komplain-log");

    if (event.httpMethod === "GET") {
      const { blobs } = await store.list();
      const items = await Promise.all(
        blobs.map(async (b) => await store.get(b.key, { type: "json" }))
      );
      // urutkan terbaru dulu
      items.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      };
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const { action } = payload;

      if (action === "update_status") {
        const { id, status } = payload;
        if (!id || !status) {
          return { statusCode: 400, body: JSON.stringify({ success: false, error: "id dan status wajib diisi." }) };
        }
        const existing = await store.get(id, { type: "json" });
        if (!existing) {
          return { statusCode: 404, body: JSON.stringify({ success: false, error: "Komplain tidak ditemukan." }) };
        }
        existing.status = status;
        existing.terakhirDiubah = new Date().toISOString();
        await store.setJSON(id, existing);
        return { statusCode: 200, body: JSON.stringify({ success: true, item: existing }) };
      }

      // default: buat catatan komplain baru
      const { unit, nama, phone, subKategori, ringkasan } = payload;
      if (!unit || !nama || !subKategori || !ringkasan) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: "unit, nama, subKategori, dan ringkasan wajib diisi." }) };
      }

      const id = generateId();
      const record = {
        id,
        tanggal: new Date().toISOString(),
        unit,
        nama,
        phone: phone || "",
        subKategori,
        subKategoriLabel: SUB_KATEGORI_LABEL[subKategori] || subKategori,
        ringkasan,
        status: "Baru",
        terakhirDiubah: new Date().toISOString()
      };
      await store.setJSON(id, record);

      return { statusCode: 200, body: JSON.stringify({ success: true, item: record }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message || "Terjadi kesalahan pada server." })
    };
  }
};
