// storyEngine.js
// Menyusun narasi SCR dashboard dari summary + anomali secara dinamis
// Depends on: config.js, aiInsight.js (untuk callOllama/callGroq/callGemini)

// Helper untuk menyusun konteks data secara dinamis berdasarkan metrik yang tersedia
function buildStoryContext(summary, anomalies) {
  const hasProfit = summary.totalProfit !== undefined && +summary.totalProfit !== 0;

  const profitLines = anomalies.profitOutliers
    .map(a => `  - ${a.name}: ${hasProfit ? 'margin ' + a.margin + '%' : 'sales $' + Number(a.sales).toLocaleString()} (Z=${a.zScore}, ${a.severity})`)
    .join('\n') || '  Tidak ada';

  const momLines = anomalies.momSpikes
    .slice(0, 3)
    .map(a => `  - ${a.month}: ${a.changePct}% MoM (${a.severity})`)
    .join('\n') || '  Tidak ada';

  const catLines = summary.categories
    .map(c => `  - ${c.category || c.dimension || 'N/A'}: sales $${(c.sales/1000).toFixed(0)}K${hasProfit ? ', margin ' + c.margin + '%' : ''}`)
    .join('\n');

  let statsOverview = `Total Sales: $${Number(summary.totalSales).toLocaleString()}`;
  if (hasProfit) {
    statsOverview += `
  Total Profit: $${Number(summary.totalProfit).toLocaleString()}
  Profit Margin: ${summary.overallMargin}%`;
  }
  statsOverview += `
  Total Orders: ${summary.totalOrders}`;

  return {
    hasProfit,
    statsOverview,
    catLines,
    profitLines,
    momLines
  };
}

// ── Fungsi utama: generate full story ─────────────────────────
async function generateStory(summary, anomalies) {
  const prompt = buildStoryPrompt(summary, anomalies);
  if (CONFIG.AI_PROVIDER === 'ollama') return await callOllama(prompt);
  if (CONFIG.AI_PROVIDER === 'gemini') return await callGemini(prompt);
  return await callGroq(prompt);
}

// ── Generate judul naratif untuk dashboard ────────────────────
async function generateTitle(summary, anomalies) {
  const severeCount = anomalies.profitOutliers.filter(a => a.severity === 'severe').length
    + anomalies.momSpikes.filter(a => a.severity === 'severe').length;

  const worstAnomaly = anomalies.profitOutliers[0]
    || anomalies.momSpikes[0]
    || null;

  const ctx = buildStoryContext(summary, anomalies);

  const context = `
Data penjualan Sales BY Category:
- ${ctx.statsOverview}
- Anomali kritis terdeteksi: ${severeCount}
${worstAnomaly ? '- Anomali terparah: ' + JSON.stringify(worstAnomaly) : ''}`;

  const prompt = context + `

Tulis SATU judul dashboard dalam Bahasa Indonesia.
Judul harus naratif (mengandung insight utama, bukan sekadar deskriptif).
Maksimal 12 kata. Format: fakta kunci + implikasi atau rekomendasi.
Contoh baik: "Margin Turun 3 Kuartal Berturut — B2B Ritel Jadi Penyebab Utama"
Contoh buruk: "Dashboard Penjualan Sales BY Category Q3 2024"
Hanya tulis judulnya saja, tanpa tanda kutip dan tanpa penjelasan lain.`;

  if (CONFIG.AI_PROVIDER === 'ollama') return await callOllama(prompt);
  if (CONFIG.AI_PROVIDER === 'gemini') return await callGemini(prompt);
  return await callGroq(prompt);
}

// ── Build prompt untuk full story (SCR format) ────────────────
function buildStoryPrompt(summary, anomalies) {
  const ctx = buildStoryContext(summary, anomalies);

  return `Kamu adalah analis bisnis senior yang menulis ringkasan eksekutif.
Berdasarkan data Sales BY Category berikut, tulis narasi bisnis dengan format SCR:

DATA KESELURUHAN:
  ${ctx.statsOverview}

PERFORMA PER KATEGORI:
${ctx.catLines}

ANOMALI ${ctx.hasProfit ? 'PROFIT MARGIN' : 'SALES'} (Z-score):
${ctx.profitLines}

ANOMALI PERUBAHAN BULANAN:
${ctx.momLines}

Tulis narasi dalam Bahasa Indonesia dengan FORMAT PERSIS seperti ini:

**SETUP**
[1-2 kalimat konteks situasi bisnis saat ini]

**CONFLICT**
[1-2 kalimat masalah atau anomali paling kritis yang ditemukan]

**RESOLUTION**
[1-2 kalimat rekomendasi konkret yang bisa dilakukan]

Gunakan angka spesifik dari data. Maksimal 6 kalimat total. Langsung ke poin.`;
}

// ── Parse respons LLM menjadi objek SCR ───────────────────────
function parseStoryResponse(text) {
  const result = { setup: '', conflict: '', resolution: '', raw: text };

  const setupMatch    = text.match(/\*{0,2}SETUP\*{0,2}[\s\S]*?\n([\s\S]*?)(?=\*{0,2}CONFLICT|\*{0,2}RESOLUTION|$)/i);
  const conflictMatch = text.match(/\*{0,2}CONFLICT\*{0,2}[\s\S]*?\n([\s\S]*?)(?=\*{0,2}RESOLUTION|\*{0,2}SETUP|$)/i);
  const resolveMatch  = text.match(/\*{0,2}RESOLUTION\*{0,2}[\s\S]*?\n([\s\S]*?)(?=\*{0,2}SETUP|\*{0,2}CONFLICT|$)/i);

  if (setupMatch)    result.setup      = setupMatch[1].trim();
  if (conflictMatch) result.conflict   = conflictMatch[1].trim();
  if (resolveMatch)  result.resolution = resolveMatch[1].trim();

  // Fallback jika parsing gagal
  if (!result.setup && !result.conflict && !result.resolution) {
    result.setup = text.trim();
  }

  return result;
}

// Explicit window bindings untuk browser
window.generateStory = generateStory;
window.generateTitle = generateTitle;
window.parseStoryResponse = parseStoryResponse;