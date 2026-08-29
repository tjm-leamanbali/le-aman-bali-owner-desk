// Netlify Function: simpan & baca "poin terpakai" secara permanen memakai Netlify Blobs
// (database key-value bawaan Netlify, gratis, tidak perlu layanan pihak ketiga).
//
// Kenapa key-nya disertai TAHUN (mis. "12A-2026")? Supaya poin otomatis "mulai dari nol lagi"
// begitu tahun kalender berganti — sesuai aturan "poin hangus tiap akhir tahun" — TANPA admin
// perlu reset manual. Ini murni untuk poin yang terpotong OTOMATIS lewat konfirmasi di chat;
// kolom "Poin Terpakai Tahun Ini" di Excel tetap dihitung terpisah sebagai catatan manual admin
// (mis. untuk transaksi lama sebelum fitur ini aktif) — total yang ditampilkan ke pemilik adalah
// gabungan keduanya (lihat index.html).

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const unit = (event.queryStringParameters && event.queryStringParameters.unit) || null;

  try {
    const store = getStore("poin-menginap");
    const tahun = new Date().getFullYear();

    if (event.httpMethod === "GET") {
      if (!unit) {
        return { statusCode: 400, body: JSON.stringify({ error: "Parameter 'unit' wajib diisi." }) };
      }
      const key = `${unit.toUpperCase()}-${tahun}`;
      const data = await store.get(key, { type: "json" });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit, tahun, poinOtomatisTerpakai: (data && data.poin) || 0 })
      };
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const { unit: unitBody, tambahPoin, catatan } = payload;

      if (!unitBody || typeof tambahPoin !== "number" || tambahPoin <= 0) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: "unit dan tambahPoin (angka > 0) wajib diisi." }) };
      }

      const key = `${unitBody.toUpperCase()}-${tahun}`;
      const existing = (await store.get(key, { type: "json" })) || { poin: 0, riwayat: [] };
      const poinBaru = existing.poin + tambahPoin;
      const riwayat = (existing.riwayat || []).concat([
        { tanggal: new Date().toISOString(), tambah: tambahPoin, catatan: catatan || "" }
      ]).slice(-50); // simpan maksimal 50 riwayat terakhir per unit per tahun

      await store.setJSON(key, { poin: poinBaru, riwayat });

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, unit: unitBody, tahun, poinOtomatisTerpakai: poinBaru })
      };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message || "Terjadi kesalahan pada server." })
    };
  }
};
