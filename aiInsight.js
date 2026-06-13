// aiInsight.js
// Modul untuk komunikasi dengan LLM (Ollama atau Groq)
// Pastikan config.js sudah di-load sebelum file ini

// ── Build prompt dari ringkasan data ─────────────────────────
// Fungsi ini mengubah objek summaryStats menjadi teks yang
// bisa dipahami LLM sebagai konteks bisnis
function buildPrompt(stats, focusQuestion = '') {
  // Tentukan metrik apa saja yang ada di stats
  const hasProfit = stats.totalProfit !== undefined && +stats.totalProfit !== 0;
  
  let statsOverview = `KESELURUHAN:
  - Total Sales  : $${Number(stats.totalSales).toLocaleString()}`;
  
  if (hasProfit) {
    statsOverview += `
  - Total Profit : $${Number(stats.totalProfit).toLocaleString()}
  - Profit Margin: ${stats.overallMargin}%`;
  }
  
  statsOverview += `
  - Total Orders : ${stats.totalOrders}`;

  const catLines = stats.categories.map(c => {
    let line = `  - ${c.category || c.dimension || 'N/A'}: Sales $${(c.sales/1000).toFixed(1)}K`;
    if (hasProfit && c.profit !== undefined) {
      line += `, Profit $${(c.profit/1000).toFixed(1)}K`;
    }
    if (hasProfit && c.margin !== undefined) {
      line += `, Margin ${c.margin}%`;
    }
    if (c.quantity !== undefined) {
      line += `, Qty ${c.quantity}`;
    }
    return line;
  }).join('\n');

  let regionLines = '';
  if (stats.regions && stats.regions.length > 0) {
    regionLines = `REVENUE PER REGION (diurutkan dari tertinggi):
` + stats.regions.map(r => `  - ${r.region}: Sales $${(r.sales/1000).toFixed(1)}K`).join('\n');
  }

  const bestCatName = stats.bestCategory ? (stats.bestCategory.category || stats.bestCategory.dimension) : 'N/A';
  const bestCatVal = stats.bestCategory ? (hasProfit ? `${stats.bestCategory.margin}% Margin` : `$${(stats.bestCategory.sales/1000).toFixed(1)}K Sales`) : 'N/A';
  
  const worstCatName = stats.worstCategory ? (stats.worstCategory.category || stats.worstCategory.dimension) : 'N/A';
  const worstCatVal = stats.worstCategory ? (hasProfit ? `${stats.worstCategory.margin}% Margin` : `$${(stats.worstCategory.sales/1000).toFixed(1)}K Sales`) : 'N/A';

  const context = `
Berikut adalah ringkasan data penjualan Sales BY Category:

${statsOverview}

PERFORMA PER KATEGORI:
${catLines}

${regionLines}

Kategori terbaik: ${bestCatName} (${bestCatVal})
Kategori terburuk: ${worstCatName} (${worstCatVal})
`;

  const question = focusQuestion ||
    'Berikan insight bisnis yang paling penting dari data ini dalam 3 poin singkat. ' +
    'Sertakan rekomendasi konkret untuk tiap poin. Gunakan Bahasa Indonesia.';

  return context + '\n---\nPertanyaan: ' + question;
}

// ── Panggil LLM dan dapatkan insight ─────────────────────────
async function getInsight(stats, focusQuestion = '') {
  const prompt = buildPrompt(stats, focusQuestion);
  if (CONFIG.AI_PROVIDER === 'ollama') {
    return await callOllama(prompt);
  } else if (CONFIG.AI_PROVIDER === 'gemini') {
    return await callGemini(prompt);
  } else {
    return await callGroq(prompt);
  }
}

// ── Implementasi Ollama ───────────────────────────────────────
async function callOllama(prompt) {
  const res = await fetch(CONFIG.OLLAMA_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      model:  CONFIG.OLLAMA_MODEL,
      prompt: prompt,
      stream: false,     // false = tunggu respons penuh, bukan streaming
      options: {
        temperature: 0.3, // rendah = lebih konsisten, kurang kreatif
        num_predict: 800  // max token output
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.response; // Ollama mengembalikan di field 'response'
}

// ── Implementasi Groq ─────────────────────────────────────────
async function callGroq(prompt) {
  const res = await fetch(CONFIG.GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.GROQ_MODEL,
      messages: [
        {
          role:    'system',
          content: 'Kamu adalah analis bisnis yang memberi insight singkat, ' +
                   'praktis, dan langsung ke poin. Gunakan Bahasa Indonesia.'
        },
        {
          role:    'user',
          content: prompt
        }
      ],
      max_tokens:  500,
      temperature: 0.3
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Groq error: ${err.error?.message || res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
  // Groq (OpenAI-compatible) mengembalikan di choices[0].message.content
}

// ── Fungsi baru: narrateAlert() ───────────────────────────────
// Berbeda dari getInsight() yang umum, narrateAlert() fokus
// pada satu anomali spesifik dan menghasilkan alert singkat
async function narrateAlert(anomaly) {
  const prompt = buildAlertPrompt(anomaly);
  if (CONFIG.AI_PROVIDER === 'ollama') {
    return await callOllama(prompt);
  } else if (CONFIG.AI_PROVIDER === 'gemini') {
    return await callGemini(prompt);
  }
  return await callGroq(prompt);
}

// ── Build prompt untuk satu anomali ──────────────────────────
function buildAlertPrompt(anomaly) {
  let context = '';

  if (anomaly.type === 'profit_outlier') {
    context = `
Sub-kategori produk "${anomaly.name}" memiliki profit margin ${anomaly.margin}%
yang sangat ${anomaly.direction === 'low' ? 'rendah' : 'tinggi'} dibanding rata-rata
(Z-score: ${anomaly.zScore}, severity: ${anomaly.severity}).
Total profit untuk sub-kategori ini: $${anomaly.profit}.`;
  }

  else if (anomaly.type === 'mom_spike') {
    context = `
Revenue bulan ${anomaly.month} mengalami ${anomaly.direction === 'drop' ? 'penurunan' : 'kenaikan'}
sebesar ${Math.abs(anomaly.changePct)}% dibanding bulan sebelumnya (${anomaly.prevMonth}).
Revenue bulan ini: $${Number(anomaly.current).toLocaleString()},
bulan lalu: $${Number(anomaly.previous).toLocaleString()}.
Severity: ${anomaly.severity}.`;
  }

  else if (anomaly.type === 'iqr_outlier') {
    context = `
Sub-kategori "${anomaly.subcat}" memiliki ${anomaly.count} transaksi yang bernilai
sangat ${anomaly.direction === 'high' ? 'tinggi' : 'rendah'} secara statistik (outlier IQR).
Rata-rata nilai transaksi outlier: $${anomaly.avgSales.toLocaleString()}.`;
  }

  return `Kamu adalah analis data bisnis. Berikan ALERT singkat (maksimal 2 kalimat) 
dalam Bahasa Indonesia tentang anomali berikut di data penjualan Sales BY Category:
${context}

Format alert: mulai dengan angka kunci yang mengejutkan, jelaskan implikasinya,
dan sertakan satu rekomendasi tindakan konkret.
Jangan gunakan kata "Alert:" di awal. Langsung ke poin.`;
}

// ── Narasi batch: generate alert untuk semua anomali sekaligus ─
async function narrateAllAlerts(anomalies) {
  // Kumpulkan semua anomali jadi satu konteks
  const allItems = [];

  anomalies.profitOutliers.forEach(a => {
    allItems.push({
      type: 'profit',
      severity: a.severity,
      name: `Sub-kategori ${a.name}`,
      text: `${a.margin !== undefined ? 'Margin keuntungan ' + (a.margin < 0 ? 'turun' : 'naik') + ' drastis sebesar ' + Math.abs(a.margin) + '%' : 'penjualan sebesar $' + Number(a.sales).toLocaleString()} (Z=${a.zScore})`
    });
  });

  anomalies.momSpikes.forEach(a => {
    allItems.push({
      type: 'mom',
      severity: a.severity,
      name: `Revenue ${a.month}`,
      text: `Pendapatan ${a.direction === 'drop' ? 'turun drastis' : 'melonjak tajam'} sebesar ${Math.abs(a.changePct)}% MoM`
    });
  });

  if (anomalies.iqrOutliers && anomalies.iqrOutliers.bySubcat) {
    anomalies.iqrOutliers.bySubcat.forEach(a => {
      allItems.push({
        type: 'iqr',
        severity: a.severity,
        name: `Sub-kategori ${a.subcat}`,
        text: `Terdeteksi ${a.count} transaksi outlier bernilai ekstrim (rata-rata sales $${Number(a.avgSales).toLocaleString()})`
      });
    });
  }

  // Urutkan: severe terlebih dahulu, lalu warning, baru info
  const severityOrder = { severe: 0, warning: 1, info: 2 };
  allItems.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Ambil maksimal 6 item teratas (paling penting/kritis)
  const topItems = allItems.slice(0, 6);

  if (topItems.length === 0) return 'Tidak ada anomali signifikan terdeteksi.';

  const itemLines = topItems.map((a, i) => {
    const severityTag = a.severity === 'severe' ? 'Severe' : `[${a.severity.toUpperCase()}]`;
    return `${i+1}. ${severityTag} ${a.name}: ${a.text}`;
  }).join('\n');

  const prompt = `Kamu adalah analis data bisnis yang memberikan alert singkat dan actionable.
Berikut adalah daftar anomali paling kritis yang terdeteksi di data penjualan Sales BY Category:

${itemLines}

Tulis ulang daftar anomali tersebut ke dalam Bahasa Indonesia dengan format persis seperti contoh referensi berikut:
• [Kategori/Bulan]: [fakta singkat] — [1 kata rekomendasi tindakan]

Contoh format:
• Severe Revenue 2026-03: Pendapatan melonjak 199.1% MoM — Investigasi.
• Sub-kategori Paper: Margin keuntungan turun drastis sebesar 8.5% — Perbaiki.
• [WARNING] Sub-kategori Tables: Margin keuntungan turun drastis sebesar 8.5% (Z=-1.64) — Optimalkan.

Aturan penting:
- Hanya tulis list item bertanda bullet (•), jangan gunakan angka penomoran.
- Jangan tambahkan kalimat pembuka seperti "Berikut adalah..." atau kalimat penutup. Langsung berikan list bullet-nya saja.
- Rekomendasi di ujung harus berupa 1 kata kerja (seperti: Investigasi, Perbaiki, Audit, Evaluasi, Optimalkan, Validasi).`;

  if (CONFIG.AI_PROVIDER === 'ollama') return await callOllama(prompt);
  if (CONFIG.AI_PROVIDER === 'gemini') return await callGemini(prompt);
  return await callGroq(prompt);
}

// ── Implementasi Gemini ───────────────────────────────────────
async function callGemini(prompt) {
  const hasLocalKey = typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY && !CONFIG.GEMINI_API_KEY.includes('ganti_dengan_');
  
  let url = '';
  if (hasLocalKey) {
    url = `${CONFIG.GEMINI_URL}${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  } else {
    url = `/api/gemini?model=${CONFIG.GEMINI_MODEL || 'gemini-3.1-flash-lite'}`;
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800
      }
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${res.statusText} - ${errData.error?.message || errData.error || 'Unknown error'}`);
  }

  const data = await res.json();
  try {
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    return "Maaf, format respons AI tidak bisa diproses.";
  }
}
