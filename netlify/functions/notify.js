// Netlify Function: kirim notifikasi WhatsApp NYATA ke tim terkait (front office,
// transportasi, keuangan, owner relations) memakai layanan Fonnte (fonnte.com).
//
// Kenapa Fonnte? Karena WhatsApp Business API resmi dari Meta butuh proses verifikasi
// bisnis yang panjang. Fonnte adalah layanan pihak ketiga asal Indonesia yang jauh lebih
// sederhana: cukup scan QR code sekali di dashboard mereka, dapat token, langsung bisa
// kirim pesan dari nomor WhatsApp biasa. Berbayar (mulai puluhan ribu rupiah per bulan),
// tapi setupnya jauh lebih ringan.
//
// Semua nomor tujuan & token disimpan sebagai Environment Variables di Netlify — TIDAK
// pernah ditulis di kode ini — supaya aman dan mudah diubah tanpa deploy ulang.

const KATEGORI_ENV_MAP = {
  booking_kamar: "WA_FRONT_OFFICE",
  antar_jemput: "WA_TRANSPORTASI",
  bagi_hasil: "WA_KEUANGAN",
  komplain: "WA_OWNER_RELATIONS" // dipakai kalau sub-kategori komplain tidak dikenali/kosong
};

// Komplain dipecah lagi ke sub-kategori, masing-masing bisa diteruskan ke nomor WA tim
// yang berbeda (mis. komplain legal ke tim legal, komplain keuangan ke tim keuangan).
const KOMPLAIN_SUBKATEGORI_ENV_MAP = {
  administrasi_legal: "WA_LEGAL",
  keuangan: "WA_KEUANGAN",
  operasional_hotel: "WA_OPERASIONAL",
  lain_lain: "WA_OWNER_RELATIONS"
};

const KATEGORI_LABEL = {
  booking_kamar: "Pemesanan Kamar",
  antar_jemput: "Antar Jemput Bandara",
  bagi_hasil: "Permintaan Info Bagi Hasil",
  komplain: "Komplain"
};

const SUB_KATEGORI_LABEL = {
  administrasi_legal: "Administrasi & Legal",
  keuangan: "Keuangan",
  operasional_hotel: "Layanan Operasional Hotel",
  lain_lain: "Lain-lain"
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const fonnteToken = process.env.FONNTE_TOKEN;
  if (!fonnteToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: "FONNTE_TOKEN belum diatur di Environment Variables Netlify. Lihat CARA-AKTIFKAN-NOTIFIKASI-WA.md."
      })
    };
  }

  async function sendFonnte(targetNumber, message){
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": fonnteToken,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ target: targetNumber, message: message }).toString()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === false) {
      throw new Error("Gagal mengirim via Fonnte: " + JSON.stringify(data));
    }
    return data;
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const { kategori, subKategori, ringkasan, pemilik } = payload;

    if (!kategori || !ringkasan || !pemilik) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "Data tidak lengkap (kategori/ringkasan/pemilik wajib diisi)." })
      };
    }

    let envKey;
    if (kategori === "komplain" && subKategori && KOMPLAIN_SUBKATEGORI_ENV_MAP[subKategori]) {
      envKey = KOMPLAIN_SUBKATEGORI_ENV_MAP[subKategori];
    } else {
      envKey = KATEGORI_ENV_MAP[kategori];
    }
    const targetNumber = envKey ? process.env[envKey] : null;

    if (!targetNumber) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: `Nomor WhatsApp tujuan untuk kategori "${kategori}"${subKategori ? ' / sub-kategori "' + subKategori + '"' : ''} belum diatur (Environment Variable ${envKey} kosong).`
        })
      };
    }

    const label = kategori === "komplain" && subKategori
      ? `Komplain — ${SUB_KATEGORI_LABEL[subKategori] || subKategori}`
      : (KATEGORI_LABEL[kategori] || kategori);
    const message =
      `*[${label}] Le Aman Bali Owner Desk*\n\n` +
      `Pemilik: ${pemilik.nama}\n` +
      `Unit: ${pemilik.unit}\n` +
      `No. HP: ${pemilik.phone}\n\n` +
      `Ringkasan permintaan:\n${ringkasan}\n\n` +
      `_Pesan ini dikirim otomatis oleh AI Concierge Le Aman Bali._`;

    // Kirim ke tim utama (sesuai kategori/sub-kategori) — kalau ini gagal, seluruh request dianggap gagal.
    try{
      await sendFonnte(targetNumber, message);
    }catch(err){
      return { statusCode: 502, body: JSON.stringify({ success: false, error: err.message }) };
    }
    const terkirimKe = [envKey];

    // KHUSUS komplain: selalu kirim TEMBUSAN ke owner rep juga, supaya owner rep punya
    // visibilitas penuh atas SEMUA komplain — bukan cuma kategori "lain_lain". Kalau target
    // utamanya memang sudah WA_OWNER_RELATIONS (kategori lain_lain), tidak perlu kirim dobel.
    if (kategori === "komplain" && envKey !== "WA_OWNER_RELATIONS") {
      const ownerRepNumber = process.env.WA_OWNER_RELATIONS;
      if (ownerRepNumber) {
        try{
          const tembusanMessage = message.replace(
            `*[${label}] Le Aman Bali Owner Desk*`,
            `*[${label}] Le Aman Bali Owner Desk* _(Tembusan ke Owner Relations)_`
          );
          await sendFonnte(ownerRepNumber, tembusanMessage);
          terkirimKe.push("WA_OWNER_RELATIONS (tembusan)");
        }catch(err){
          // tembusan gagal tidak menggagalkan keseluruhan request — tim utama tetap sudah menerima notifikasi
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sentTo: terkirimKe })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message || "Terjadi kesalahan pada server." })
    };
  }
};
