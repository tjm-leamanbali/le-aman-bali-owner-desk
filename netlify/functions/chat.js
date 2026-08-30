// Netlify Function: proxy aman ke Anthropic API.
// API key TIDAK pernah dikirim ke browser — disimpan sebagai Environment Variable di Netlify.
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ANTHROPIC_API_KEY belum diatur di Environment Variables Netlify. Lihat CARA-AKTIFKAN-CHAT-AI.md."
      })
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");

    // Bangun body permintaan ke Anthropic. PENTING: teruskan "tools" dan "tool_choice"
    // apa adanya kalau dikirim dari frontend — sebelumnya dua field ini terbuang di sini,
    // sehingga AI tidak pernah benar-benar tahu ada tool yang bisa dipanggil (ia cuma
    // "mengarang" teks yang menyerupai pemanggilan tool, bukan benar-benar memanggilnya).
    const upstreamBody = {
      model: payload.model || "claude-sonnet-4-6",
      max_tokens: payload.max_tokens || 1000,
      system: payload.system,
      messages: payload.messages
    };
    if (payload.tools) upstreamBody.tools = payload.tools;
    if (payload.tool_choice) upstreamBody.tool_choice = payload.tool_choice;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(upstreamBody)
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Terjadi kesalahan pada server." })
    };
  }
};
