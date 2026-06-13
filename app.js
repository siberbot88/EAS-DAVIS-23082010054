// app.js — P15 Capstone
// Extend dari P14 yang sudah jalan: tambah zona SCR + storyEngine
// Semua fungsi P14 tetap ada, ditambah fungsi baru untuk story

// ── Helper: parse angka (koma sebagai desimal) ────────────────
function parseNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  const cleaned = String(val).trim().replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
const parseNum = parseNumber; // Alias untuk kompatibilitas

// ── Helper: parse tanggal secara fleksibel (DD/MM/YYYY, YYYY-MM-DD, M/D/YYYY) ──
function parseDate(str) {
  if (!str) return null;
  const clean = String(str).trim();

  // Coba format YYYY-MM-DD
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year  = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day   = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Coba format DD/MM/YYYY atau MM/DD/YYYY
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      
      let year = p2;
      let month = p0 - 1;
      let day = p1;
      
      // Jika angka pertama > 12, maka pasti format DD/MM/YYYY
      if (p0 > 12) {
        month = p1 - 1;
        day = p0;
      }
      
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Fallback ke Date.parse bawaan
  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) return new Date(parsed);

  return null;
}

// ── Variabel global ───────────────────────────────────────────
let rawData          = [];
let summaryStats     = {};
let currentAnomalies = {};

// ── Entry point: Deteksi delimiter secara dinamis ──────────────
d3.text('Sales_BY_Category.csv').then(async function(text) {
  if (!text) throw new Error("File Sales_BY_Category.csv kosong atau gagal dimuat.");
  
  // Tentukan delimiter: jika baris pertama mengandung ';' pakai ';', selain itu ','
  const firstLine = text.split('\n')[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  
  // Parse data
  const data = d3.dsvFormat(delimiter).parse(text);

  // == FASE 1: DATA (Robust case/space/hyphen-insensitive mapping) ==
  rawData = data.map(d => {
    const getVal = (possibleKeys) => {
      for (let k of possibleKeys) {
        if (d[k] !== undefined) return d[k];
        const klc = k.toLowerCase();
        if (d[klc] !== undefined) return d[klc];
        const kup = k.toUpperCase();
        if (d[kup] !== undefined) return d[kup];
        const kclean = k.replace(/[\s-_]/g, '').toLowerCase();
        for (let key in d) {
          if (key.replace(/[\s-_]/g, '').toLowerCase() === kclean) {
            return d[key];
          }
        }
      }
      return undefined;
    };

    return {
      category:  getVal(['category', 'Category']) || '',
      subcat:    getVal(['subcategory', 'SubCategory', 'Sub-Category', 'sub-category']) || '',
      region:    getVal(['region', 'Region', 'Territory', 'CountryRegion']) || '',
      segment:   getVal(['segment', 'Segment']) || '',
      sales:     parseNum(getVal(['sales', 'Sales'])),
      profit:    parseNum(getVal(['profit', 'Profit'])),
      quantity:  parseNum(getVal(['quantity', 'Quantity', 'qty', 'Qty'])),
      orderDate: parseDate(getVal(['orderdate', 'OrderDate', 'order date', 'Order Date']))
    };
  }).filter(d => !isNaN(d.sales) && !isNaN(d.profit) && d.orderDate !== null);

  // == FASE 2: HITUNG STATISTIK ==
  summaryStats     = computeSummary(rawData);
  currentAnomalies = detectAllAnomalies(rawData);

  // == FASE 3: RENDER VISUAL (sinkron — tampil dulu) ==
  displaySummaryCards(summaryStats);
  dispatchDataReady(summaryStats);

  // Render charts (langsung tampil tanpa menunggu AI)
  renderCategoryColumnChart(rawData);
  renderSubcatChart(rawData, buildAnomalyMap(currentAnomalies));
  renderRegionChart(rawData);
  renderTrendChart(rawData);

  // Alert panel
  const sevCount = countSeverity(currentAnomalies);
  document.getElementById('badge-severe').textContent  = sevCount.severe  + ' Kritis';
  document.getElementById('badge-warning').textContent = sevCount.warning + ' Peringatan';
  renderRawAnomalies(currentAnomalies);

  // Model badge
  let modelName = CONFIG.GROQ_MODEL;
  if (CONFIG.AI_PROVIDER === 'ollama') modelName = CONFIG.OLLAMA_MODEL;
  else if (CONFIG.AI_PROVIDER === 'gemini') modelName = CONFIG.GEMINI_MODEL;
  const mb = document.getElementById('model-badge');
  if (mb) mb.textContent = modelName;

  // == FASE 4: AI NARASI (asinkron — isi saat siap menggunakan Promise.allSettled) ==
  Promise.allSettled([
    window.generateTitle ? window.generateTitle(summaryStats, currentAnomalies) : Promise.resolve("Sales BY Category Dashboard"),
    window.generateStory ? window.generateStory(summaryStats, currentAnomalies) : Promise.resolve(""),
    getInsight(summaryStats, 'Berikan 3 insight paling penting dan rekomendasi konkret. Bahasa Indonesia.')
  ]).then(([titleResult, storyResult, insightResult]) => {

    // 1. Isi judul naratif
    if (titleResult.status === 'fulfilled') {
      const el = document.getElementById('narrative-title');
      if (el) {
        el.textContent = titleResult.value.trim();
        el.classList.add('loaded');
      }
    }

    // 2. Isi zona SCR
    if (storyResult.status === 'fulfilled' && storyResult.value) {
      const scr = parseStoryResponse(storyResult.value);
      fillZone('setup-text',      scr.setup);
      fillZone('conflict-text',   scr.conflict);
      fillZone('resolution-text', scr.resolution);
    }

    // 3. Isi insight panel
    if (insightResult.status === 'fulfilled') {
      const el = document.getElementById('insight-output');
      if (el) {
        el.innerHTML = formatInsight(insightResult.value);
      }
    }
  }).catch(err => {
    console.error("Gagal memproses narasi AI:", err);
  });
}).catch(function(err) {
  console.error("Gagal memproses dashboard:", err);
  const el = document.getElementById('narrative-title');
  if (el) el.textContent = "Error memuat data: " + err.message;
});

// ── fillZone: isi elemen teks dengan animasi + semantic highlight ──
function fillZone(id, text) {
  const el = document.getElementById(id);
  if (!el || !text) return;
  el.innerHTML = semanticHighlight(text);
  el.classList.add('ai-loaded');
}

// ── computeSummary ────────────────────────────────────────────
function computeSummary(data) {
  const totalSales  = d3.sum(data, d => d.sales);
  const totalProfit = d3.sum(data, d => d.profit);
  const margin      = (totalProfit / totalSales * 100).toFixed(1);
  const totalOrders = data.length;

  const byCategory = d3.rollup(
    data,
    v => ({ sales: d3.sum(v, d => d.sales), profit: d3.sum(v, d => d.profit) }),
    d => d.category
  );

  const catArray = [...byCategory.entries()].map(([cat, v]) => ({
    category: cat,
    sales:    v.sales,
    profit:   v.profit,
    margin:   (v.profit / v.sales * 100).toFixed(1)
  }));
  catArray.sort((a, b) => b.margin - a.margin);

  const byRegion = d3.rollup(data, v => d3.sum(v, d => d.sales), d => d.region);
  const regionArray = [...byRegion.entries()]
    .map(([r, s]) => ({ region: r, sales: s }))
    .sort((a, b) => b.sales - a.sales);

  return {
    totalSales:    totalSales.toFixed(2),
    totalProfit:   totalProfit.toFixed(2),
    overallMargin: margin,
    totalOrders:   totalOrders,
    categories:    catArray,
    regions:       regionArray,
    bestCategory:  catArray[0],
    worstCategory: catArray[catArray.length - 1],
    dimensionHeader: 'Kategori',
    metric1Header: 'Sales',
    metric2Header: 'Profit',
    ratioHeader: 'Margin',
    mainChartTitle: 'Profit Margin per Sub-Kategori',
    secondaryChart1Title: 'Sales per Kategori',
    secondaryChart2Title: 'Profit per Region',
    tableTitle: 'Ringkasan Performa per Kategori'
  };
}

// ── displaySummaryCards ───────────────────────────────────────
function displaySummaryCards(stats) {
  const cards = [
    { label: 'Total Sales',   value: `$${(stats.totalSales/1000000).toFixed(2)}M` },
    { label: 'Total Profit',  value: `$${(stats.totalProfit/1000).toFixed(0)}K` },
    { label: 'Profit Margin', value: `${stats.overallMargin}%` },
    { label: 'Total Orders',  value: stats.totalOrders.toLocaleString() }
  ];
  const el = document.getElementById('summary-cards');
  if (el) el.innerHTML = cards.map(c => `
    <div class="summary-card">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value">${c.value}</div>
    </div>`).join('');
}

// ── renderSecondaryChart1 ───────────────────────────────────────
function renderSecondaryChart1(data) {
  renderCategoryChart(data);
}

// ── renderCategoryChart ───────────────────────────────────────
function renderCategoryChart(data) {
  const margin = { top: 20, right: 20, bottom: 40, left: 80 };
  const w = 400 - margin.left - margin.right;
  const h = 220 - margin.top  - margin.bottom;

  const byCategory = d3.rollups(data,
    v => d3.sum(v, d => d.sales), d => d.category
  ).map(([cat, val]) => ({ category: cat, sales: val }))
   .sort((a, b) => b.sales - a.sales);

  d3.select('#chart-secondary1').selectAll('*').remove();
  const svg = d3.select('#chart-secondary1').append('svg')
    .attr('viewBox', `0 0 ${w+margin.left+margin.right} ${h+margin.top+margin.bottom}`)
    .style('width','100%').style('height','auto')
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(byCategory, d => d.sales)]).range([0, w]);
  const y = d3.scaleBand()
    .domain(byCategory.map(d => d.category)).range([0, h]).padding(0.3);

  svg.selectAll('.bar').data(byCategory).enter().append('rect')
    .attr('x', 0).attr('y', d => y(d.category))
    .attr('width', d => x(d.sales)).attr('height', y.bandwidth())
    .attr('fill', '#2563eb')
    .append('title').text(d => `${d.category}: $${(d.sales/1000).toFixed(1)}K`);

  svg.append('g').call(d3.axisLeft(y).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(d => `$${(d/1000).toFixed(0)}K`));
}

function renderCategoryColumnChart(data) {
  const byCategory = d3.rollups(data,
    v => d3.sum(v, d => d.sales), d => d.category
  ).map(([cat, val]) => ({ category: cat, sales: val }))
   .sort((a, b) => b.sales - a.sales);

  const container = d3.select('#chart-secondary1');
  container.selectAll('*').remove();

  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const w = 400 - margin.left - margin.right;
  const h = 220 - margin.top  - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${w+margin.left+margin.right} ${h+margin.top+margin.bottom}`)
    .style('width','100%').style('height','auto')
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(byCategory.map(d => d.category))
    .range([0, w])
    .padding(0.3);

  const yMax = d3.max(byCategory, d => d.sales);
  const y = d3.scaleLinear()
    .domain([0, yMax])
    .range([h, 0]);

  // Gradient or color
  const color = d3.scaleOrdinal()
    .domain(byCategory.map(d => d.category))
    .range(['#1d4ed8', '#3b82f6', '#93c5fd']);

  svg.selectAll('.bar').data(byCategory).enter().append('rect')
    .attr('class', 'bar')
    .attr('x', d => x(d.category))
    .attr('y', d => y(d.sales))
    .attr('width', x.bandwidth())
    .attr('height', d => h - y(d.sales))
    .attr('fill', d => color(d.category))
    .append('title').text(d => `${d.category}: $${(d.sales/1000).toFixed(1)}K`);

  // X axis
  svg.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('font-size', '10px')
    .attr('fill', '#6b7280');

  // Y axis
  svg.append('g')
    .call(d3.axisLeft(y).ticks(4).tickFormat(d => `$${(d/1000).toFixed(0)}K`))
    .call(g => g.select('.domain').remove())
    .selectAll('text')
    .attr('font-size', '10px')
    .attr('fill', '#6b7280');
}

// ── renderRegionChart ─────────────────────────────────────────
function renderRegionChart(data) {
  const containerEl = document.getElementById('chart-secondary3');
  const containerW  = containerEl ? containerEl.clientWidth || 900 : 900;
  
  const margin = { top: 20, right: 32, bottom: 44, left: 100 };
  const W = Math.max(containerW - 4, 800) - margin.left - margin.right;
  const H = 260 - margin.top  - margin.bottom;

  const byRegion = d3.rollups(data,
    v => d3.sum(v, d => d.profit), d => d.region
  ).map(([r, p]) => ({ region: r, profit: p }))
   .sort((a, b) => b.profit - a.profit);

  d3.select('#chart-secondary3').selectAll('*').remove();
  const svg = d3.select('#chart-secondary3').append('svg')
    .attr('viewBox', `0 0 ${W+margin.left+margin.right} ${H+margin.top+margin.bottom}`)
    .style('width','100%').style('height','auto')
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(byRegion, d => d.profit)]).range([0, W]);
  const y = d3.scaleBand()
    .domain(byRegion.map(d => d.region)).range([0, H]).padding(0.3);

  svg.selectAll('.bar').data(byRegion).enter().append('rect')
    .attr('x', 0).attr('y', d => y(d.region))
    .attr('width', d => Math.max(0, x(d.profit))).attr('height', y.bandwidth())
    .attr('fill', d => d.profit >= 0 ? '#16a34a' : '#dc2626')
    .append('title').text(d => `${d.region}: $${(d.profit/1000).toFixed(1)}K`);

  svg.append('g').call(d3.axisLeft(y).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('transform', `translate(0,${H})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat(d => `$${(d/1000).toFixed(0)}K`))
    .selectAll('text')
    .attr('font-size', '10px')
    .attr('fill', '#6b7280');
}

// ── renderSubcatChart (dengan anomaly highlight) ──────────────
function renderSubcatChart(data, anomalyMap = new Map()) {
  d3.select('#chart-secondary2').selectAll('*').remove();

  const margin = { top: 20, right: 40, bottom: 20, left: 100 };
  const w = 400 - margin.left - margin.right;
  const h = 220 - margin.top  - margin.bottom;

  const bySubcat = d3.rollups(data,
    v => ({ margin: d3.sum(v, d => d.profit) / d3.sum(v, d => d.sales) * 100 }),
    d => d.subcat
  ).map(([name, v]) => ({ name, margin: +v.margin.toFixed(1) }))
   .sort((a, b) => a.margin - b.margin);

  // Warna semantis: biru untuk normal, merah/oranye hanya jika ada anomali
  const getColor = (d) => {
    if (!anomalyMap.has(d.name)) return '#2563eb';  // --color-accent: normal
    const a = anomalyMap.get(d.name);
    if (a.severity === 'severe')  return '#dc2626';  // --color-severe
    if (a.severity === 'warning') return '#ea580c';  // --color-warning
    return '#d97706';                                // --color-warn
  };

  const totalW = w + margin.left + margin.right;
  const totalH = h + margin.top  + margin.bottom;
  const svg = d3.select('#chart-secondary2').append('svg')
    .attr('viewBox', `0 0 ${totalW} ${totalH}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%').style('height', 'auto')
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([d3.min(bySubcat, d => d.margin) - 2, d3.max(bySubcat, d => d.margin) + 2])
    .range([0, w]);
  const y = d3.scaleBand()
    .domain(bySubcat.map(d => d.name)).range([0, h]).padding(0.25);

  // Garis nol
  svg.append('line')
    .attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', h)
    .attr('stroke', '#94a3b8').attr('stroke-dasharray', '4,3').attr('stroke-width', 1);

  // Bar
  svg.selectAll('.bar').data(bySubcat).enter().append('rect')
    .attr('x',      d => d.margin >= 0 ? x(0) : x(d.margin))
    .attr('y',      d => y(d.name))
    .attr('width',  d => Math.abs(x(d.margin) - x(0)))
    .attr('height', y.bandwidth())
    .attr('fill',   d => getColor(d))
    .append('title').text(d => {
      const tag = anomalyMap.has(d.name) ? ` [ANOMALI Z=${anomalyMap.get(d.name).zScore}]` : '';
      return `${d.name}: ${d.margin}%${tag}`;
    });

  // Label
  svg.selectAll('.label').data(bySubcat).enter().append('text')
    // Perbaikan bug teks bertumpuk: letakkan label negatif di KANAN bar (bukan kiri) atau dalam bar
    .attr('x', d => d.margin >= 0 ? x(d.margin) + 3 : x(0) + 3)
    .attr('y', d => y(d.name) + y.bandwidth() / 2)
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle').attr('font-size', 10)
    .attr('fill', d => anomalyMap.has(d.name) ? '#dc2626' : '#6b7280')
    .attr('font-weight', d => anomalyMap.has(d.name) ? '600' : '400')
    .text(d => `${d.margin}%`);

  svg.append('g').call(d3.axisLeft(y).tickSize(0)).select('.domain').remove();
}

// ── renderTrendChart — Line chart tren bulanan ────────────────
function renderTrendChart(data) {
  const container = d3.select('#chart-main');
  container.selectAll('*').remove();

  // === 1. Agregasi data per bulan ===
  const monthly = d3.rollups(
    data.filter(d => d.orderDate instanceof Date && !isNaN(d.orderDate)),
    v => d3.sum(v, d => d.sales),
    d => d3.timeFormat('%Y-%m')(d.orderDate)
  ).map(([month, sales]) => ({ month, sales, date: new Date(month + '-01') }))
   .sort((a, b) => a.date - b.date);

  if (monthly.length < 2) {
    container.append('p')
      .attr('class', 'placeholder-text')
      .text('Data tidak cukup untuk menampilkan tren bulanan.');
    return;
  }

  // === 2. Hitung MoM anomaly (dari anomali yang terdeteksi) ===
  const momAnomalySet = new Set(
    (currentAnomalies.momSpikes || []).map(a => a.month)
  );

  // === 3. Hitung 3-month moving average ===
  monthly.forEach((d, i) => {
    const window3 = monthly.slice(Math.max(0, i - 2), i + 1);
    d.movingAvg = d3.mean(window3, x => x.sales);
  });

  // === 4. Dimensi & margin ===
  const containerEl = document.getElementById('chart-main');
  const containerW  = containerEl ? containerEl.clientWidth || 900 : 900;
  const margin = { top: 24, right: 32, bottom: 44, left: 60 };
  const W = Math.max(containerW - 4, 800) - margin.left - margin.right;
  const H = 260 - margin.top - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${W + margin.left + margin.right} ${H + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%')
    .style('height', 'auto')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // === 5. Scales ===
  const x = d3.scaleTime()
    .domain(d3.extent(monthly, d => d.date))
    .range([0, W]);

  const yMax = d3.max(monthly, d => d.sales) * 1.12;
  const y = d3.scaleLinear()
    .domain([0, yMax])
    .range([H, 0])
    .nice();

  // === 6. Warna semantis dari CSS vars (inline untuk D3) ===
  const COLOR_ACCENT  = '#2563eb';  // --color-accent  (biru: tren utama)
  const COLOR_GOOD    = '#16a34a';  // --color-good    (hijau: moving avg)
  const COLOR_SEVERE  = '#dc2626';  // --color-severe  (merah: anomali)
  const COLOR_NORMAL  = '#94a3b8';  // --color-normal  (abu: grid)
  const COLOR_AREA    = 'rgba(37,99,235,0.07)'; // area fill transparan

  // === 7. Grid horizontal (tipis, subtil) ===
  const yTicks = y.ticks(4);
  svg.selectAll('.grid-h')
    .data(yTicks)
    .enter().append('line')
    .attr('class', 'grid-h')
    .attr('x1', 0).attr('x2', W)
    .attr('y1', d => y(d)).attr('y2', d => y(d))
    .attr('stroke', '#e2e5ea')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3');

  // === 8. Area fill di bawah tren ===
  const areaGen = d3.area()
    .x(d => x(d.date))
    .y0(H)
    .y1(d => y(d.sales))
    .curve(d3.curveCatmullRom.alpha(0.5));

  svg.append('path')
    .datum(monthly)
    .attr('fill', COLOR_AREA)
    .attr('d', areaGen);

  // === 9. Garis tren utama (biru: --color-accent) ===
  const lineGen = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.sales))
    .curve(d3.curveCatmullRom.alpha(0.5));

  svg.append('path')
    .datum(monthly)
    .attr('fill', 'none')
    .attr('stroke', COLOR_ACCENT)
    .attr('stroke-width', 2.5)
    .attr('d', lineGen);

  // === 10. Garis Moving Average (hijau: --color-good) ===
  const maData = monthly.filter(d => d.movingAvg !== undefined);
  const maLine = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.movingAvg))
    .curve(d3.curveCatmullRom.alpha(0.5));

  svg.append('path')
    .datum(maData)
    .attr('fill', 'none')
    .attr('stroke', COLOR_GOOD)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '5,4')
    .attr('opacity', 0.75)
    .attr('d', maLine);

  // === 11. Titik data (dots) ===
  svg.selectAll('.dot-bg')
    .data(monthly)
    .enter().append('circle')
    .attr('class', 'dot-bg')
    .attr('cx', d => x(d.date))
    .attr('cy', d => y(d.sales))
    .attr('r', 3.5)
    .attr('fill', '#fff')
    .attr('stroke', d => momAnomalySet.has(d.month) ? COLOR_SEVERE : COLOR_ACCENT)
    .attr('stroke-width', d => momAnomalySet.has(d.month) ? 2.5 : 1.5);

  // === 12. Pulse ring untuk titik anomali (merah: --color-severe) ===
  svg.selectAll('.dot-anomaly-ring')
    .data(monthly.filter(d => momAnomalySet.has(d.month)))
    .enter().append('circle')
    .attr('cx', d => x(d.date))
    .attr('cy', d => y(d.sales))
    .attr('r', 8)
    .attr('fill', 'none')
    .attr('stroke', COLOR_SEVERE)
    .attr('stroke-width', 1.5)
    .attr('opacity', 0.35);

  // === 13. Label nilai untuk titik anomali ===
  svg.selectAll('.label-anomaly')
    .data(monthly.filter(d => momAnomalySet.has(d.month)))
    .enter().append('text')
    .attr('x', d => x(d.date))
    .attr('y', d => y(d.sales) - 14)
    .attr('text-anchor', 'middle')
    .attr('font-size', 9.5)
    .attr('font-weight', '700')
    .attr('fill', COLOR_SEVERE)
    .text(d => `$${(d.sales / 1000).toFixed(0)}K`);

  // === 14. Tooltip (title tag) ===
  svg.selectAll('.dot-overlay')
    .data(monthly)
    .enter().append('circle')
    .attr('cx', d => x(d.date))
    .attr('cy', d => y(d.sales))
    .attr('r', 10)
    .attr('fill', 'transparent')
    .attr('cursor', 'pointer')
    .append('title')
    .text(d => {
      const anomalyFlag = momAnomalySet.has(d.month) ? ' ⚠ ANOMALI MoM' : '';
      return `${d.month}: $${Number(d.sales.toFixed(0)).toLocaleString()}${anomalyFlag}`;
    });

  // === 15. Axes ===
  // X axis: tick hanya untuk beberapa bulan agar tidak penuh
  const xTickCount = Math.min(monthly.length, 12);
  const xAxis = d3.axisBottom(x)
    .ticks(xTickCount)
    .tickFormat(d3.timeFormat('%b %y'))
    .tickSize(4);

  svg.append('g')
    .attr('transform', `translate(0,${H})`)
    .call(xAxis)
    .call(g => g.select('.domain').attr('stroke', '#e2e5ea'))
    .call(g => g.selectAll('.tick line').attr('stroke', '#e2e5ea'))
    .call(g => g.selectAll('.tick text')
      .attr('font-size', 10)
      .attr('fill', '#6b7280')
      .attr('dy', '1.2em'));

  // Y axis
  const yAxis = d3.axisLeft(y)
    .ticks(4)
    .tickFormat(d => `$${(d / 1000).toFixed(0)}K`)
    .tickSize(4);

  svg.append('g')
    .call(yAxis)
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line').attr('stroke', '#e2e5ea'))
    .call(g => g.selectAll('.tick text')
      .attr('font-size', 10)
      .attr('fill', '#6b7280'));
}

// ── buildAnomalyMap ───────────────────────────────────────────
function buildAnomalyMap(anomalies) {
  const map = new Map();
  anomalies.profitOutliers.forEach(a => {
    map.set(a.name, { severity: a.severity, zScore: a.zScore, direction: a.direction });
  });
  return map;
}

// ── renderRawAnomalies ────────────────────────────────────────
function renderRawAnomalies(anomalies) {
  const container = document.getElementById('alert-tab-raw');
  if (!container) return;

  const items = [];

  anomalies.profitOutliers.forEach(a => {
    items.push({
      severity: a.severity,
      label:    `Profit Margin Anomali: ${a.name}`,
      detail:   `margin ${a.margin}%  |  Z-score ${a.zScore}  |  ${a.direction === 'low' ? 'jauh di bawah' : 'jauh di atas'} rata-rata`
    });
  });

  anomalies.momSpikes.forEach(a => {
    items.push({
      severity: a.severity,
      label:    `Revenue ${a.direction === 'drop' ? 'Turun' : 'Naik'} Drastis: ${a.month}`,
      detail:   `${a.changePct}% MoM  |  $${Number(a.current).toLocaleString()} vs $${Number(a.previous).toLocaleString()} bulan lalu`
    });
  });

  // IQR outliers — sub-kategori dengan banyak transaksi nilai ekstrem
  const iqrSubcats = anomalies.iqrOutliers?.bySubcat || [];
  iqrSubcats.forEach(a => {
    items.push({
      severity: a.severity,
      label:    `Distribusi Tidak Normal: ${a.subcat}`,
      detail:   `${a.count} transaksi outlier  |  rata-rata $${Number(a.avgSales).toLocaleString()}  |  nilai ${a.direction === 'high' ? 'sangat tinggi' : 'sangat rendah'}`
    });
  });

  if (items.length === 0) {
    container.innerHTML = '<p class="placeholder-text">Tidak ada anomali signifikan terdeteksi.</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="alert-item">
      <div class="ai-dot ${item.severity}"></div>
      <div>
        <div class="ai-label">${item.label}</div>
        <div class="ai-detail">${item.detail}</div>
      </div>
    </div>`).join('');
}

// ── requestAlertNarration ─────────────────────────────────────
async function requestAlertNarration() {
  const btn    = document.getElementById('btn-narrate');
  const output = document.getElementById('ai-narration-output');
  if (!btn || !output) return;

  btn.disabled    = true;
  btn.textContent = 'Memproses...';
  switchAlertTab('ai', document.querySelector('.alert-tab:last-child'));

  output.innerHTML = `<p class="loading-text"><span class="spinner-inline"></span>Mengirim data anomali ke AI...</p>`;

  try {
    const narration = await narrateAllAlerts(currentAnomalies);
    output.innerHTML = narration
      .split('\n').filter(l => l.trim())
      .map(l => `<div class="narration-line">${semanticHighlight(l)}</div>`)
      .join('');
  } catch (err) {
    output.innerHTML = `<p style="color:#dc2626">Error: ${err.message}</p>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Narasi AI';
    // Re-hydrate feather icons if any were injected
    document.dispatchEvent(new CustomEvent('feather-rerender'));
  }
}

// ── switchAlertTab ────────────────────────────────────────────
function switchAlertTab(tab, btnEl) {
  document.querySelectorAll('.alert-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.alert-tab-content').forEach(c => c.style.display = 'none');
  if (btnEl) btnEl.classList.add('active');
  const target = document.getElementById('alert-tab-' + tab);
  if (target) target.style.display = 'block';
}

// ── requestInsight (dari P13, tetap ada) ─────────────────────
async function requestInsight() {
  const btn      = document.getElementById('btn-insight');
  const output   = document.getElementById('insight-output');
  const question = document.getElementById('custom-question');
  if (!btn || !output) return;

  btn.disabled    = true;
  btn.textContent = 'Memproses...';
  output.innerHTML = `<div class="insight-loading"><div class="spinner"></div><span>Mengirim data ke AI...</span></div>`;

  try {
    const qText = question ? question.value.trim() : '';
    const result = await getInsight(summaryStats, qText);
    
    let html = '';
    if (qText) {
      html += `<div style="text-align:right;"><div class="user-query-bubble">${qText}</div></div>`;
    }
    html += `<div class="insight-response-wrapper">${formatInsight(result)}</div>`;
    
    output.innerHTML = html;
    
    // Auto-scroll to bottom of the chat view
    setTimeout(() => {
      output.scrollTop = output.scrollHeight;
    }, 100);
  } catch (err) {
    output.innerHTML = `<div class="insight-error"><strong>Error:</strong> ${err.message}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Minta Insight →';
  }
}

function quickAsk(q) {
  const el = document.getElementById('custom-question');
  if (el) el.value = q;
  requestInsight();
}

// ── askCustomQ (untuk input di resolution zone) ───────────────
async function askCustomQ() {
  const q      = document.getElementById('custom-q');
  const output = document.getElementById('insight-output');
  if (!q || !q.value.trim() || !output) return;

  output.innerHTML = `<p class="loading-text"><span class="spinner-inline"></span>Memproses...</p>`;
  try {
    const resp = await getInsight(summaryStats, q.value.trim());
    output.innerHTML = formatInsight(resp);
  } catch (e) {
    output.innerHTML = `<p style="color:#dc2626">${e.message}</p>`;
  }
}

// ── semanticHighlight — beri warna semantis pada teks AI ─────
// Merah  (hl-bad)   : kata/frasa negatif / buruk
// Hijau  (hl-good)  : kata/frasa positif / bagus
// Biru   (hl-action): rekomendasi / tindakan / pendapat
function semanticHighlight(text) {
  if (!text) return '';

  // Escape HTML untuk keamanan
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // ── Daftar kata kunci (sorted panjang → pendek dalam tiap grup) ──
  const BAD = [
    'tidak menguntungkan','jauh di bawah','sangat rendah','sangat turun',
    'paling rendah','lebih rendah','sangat buruk','tidak efisien',
    'kerugian','merugi','kehilangan','menggerus','tergerus','terancam',
    'terpuruk','penurunan','menurun','berbahaya','kritis','krisis',
    'defisit','stagnan','negatif','overstock','anjlok','drop','rugi',
    'buruk','lemah','gagal','masalah','rendah','turun','minus','loss'
  ];
  const GOOD = [
    'sangat menguntungkan','sangat tinggi','paling tinggi','sangat baik',
    'lebih tinggi','luar biasa','paling efisien','sangat efisien',
    'menguntungkan','peningkatan','berkembang','outperform','tertinggi',
    'meningkat','berhasil','dominan','unggul','surplus','optimal',
    'terbaik','signifikan','efisien','positif','profit','sukses',
    'tumbuh','tinggi','naik','kuat','baik','untung'
  ];
  const ACTION = [
    'sebaiknya segera','perlu segera','sesegera mungkin',
    'rekomendasikan','direkomendasikan','disarankan','pertimbangkan',
    'implementasikan','optimalkan','manfaatkan','kembangkan','alokasikan',
    'targetkan','eksplorasi','prioritaskan','fokuskan','tingkatkan',
    'kurangi','perbaiki','monitor','pastikan','dorong','capai',
    'strategi','prioritas','tindakan','langkah','solusi','evaluasi',
    'audit','fokus','perlu','harus','sebaiknya','lakukan'
  ];

  // Gabungkan semua term dengan class-nya, urutkan panjang → pendek
  const terms = [
    ...BAD.map(w    => ({ w, cls: 'hl-bad'    })),
    ...GOOD.map(w   => ({ w, cls: 'hl-good'   })),
    ...ACTION.map(w => ({ w, cls: 'hl-action' }))
  ].sort((a, b) => b.w.length - a.w.length);

  // Buat map lowercase → class untuk callback
  const clsMap = {};
  terms.forEach(({ w, cls }) => { clsMap[w.toLowerCase()] = cls; });

  // Bangun satu regex gabungan (single-pass, longest-match first)
  const pattern = terms
    .map(({ w }) => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // kata tunggal: word boundary; frasa multi-kata: cukup escaped
      return w.includes(' ') ? esc : `\\b${esc}\\b`;
    })
    .join('|');

  const regex = new RegExp(`(${pattern})`, 'gi');

  return safe.replace(regex, (match) => {
    const cls = clsMap[match.toLowerCase()] || 'hl-action';
    return `<span class="${cls}">${match}</span>`;
  });
}

// ── formatInsight — bersihkan markdown, render + highlight ────
function formatInsight(text) {
  // 1. Tangani markdown: **bold** (jadikan hitam tebal), *italic*, ## heading, dll.
  let t = text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*(.+?)\*\*/g,   '<strong style="color: var(--navy); font-weight: 700;">$1</strong>')
    .replace(/\*(.+?)\*/g,        '<i>$1</i>')
    .replace(/^#{1,3}\s*/gm,       '')
    .replace(/^---+$/gm,            '')
    .replace(/`(.+?)`/g,            '<code style="background:#e2e8f0;padding:2px 4px;border-radius:4px;">$1</code>');

  // 2. Render per baris
  const lines = t.split('\n');
  let html = '';
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Baris kosong
    if (!line) { 
      if (inTable) { html += '</tbody></table></div>'; inTable = false; }
      html += '<div class="insight-gap"></div>'; 
      continue; 
    }

    // Deteksi Markdown Table: mulai dengan | dan diakhiri dengan | (atau ada di dalamnya)
    if (line.startsWith('|') && line.endsWith('|')) {
      // Abaikan baris separator seperti |---|---| atau |:--:|
      if (/^[|\-\s:]+$/.test(line)) {
        continue;
      }
      
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      
      if (!inTable) {
        inTable = true;
        html += '<div class="table-wrapper"><table class="insight-table"><thead><tr>';
        cells.forEach(c => html += `<th>${c}</th>`);
        html += '</tr></thead><tbody>';
      } else {
        html += '<tr>';
        cells.forEach(c => html += `<td>${c}</td>`);
        html += '</tr>';
      }
      continue;
    } else if (inTable) {
      // Tutup tabel jika baris berikutnya bukan tabel
      html += '</tbody></table></div>';
      inTable = false;
    }

    // Baris nomor "1. ..." "2. ..." — heading item
    if (/^\d+\.\s/.test(line)) {
      const clean = line.replace(/^(\d+\.\s*)(insight\s*:\s*)?/i, '');
      const num   = line.match(/^(\d+\.)/)[1];
      html += `<div class="insight-item"><b>${num}</b> ${clean}</div>`;
      continue;
    }

    // Bullet "* ..." atau "- ..."
    if (/^[*\-]\s/.test(line)) {
      const txt = line.replace(/^[*\-]\s+/, '');
      html += `<div class="insight-bullet">&#x2022;&nbsp;${txt}</div>`;
      continue;
    }

    // Baris biasa
    html += `<div class="insight-line">${line}</div>`;
  }

  // Tutup tabel jika berada di baris paling akhir
  if (inTable) {
    html += '</tbody></table></div>';
  }

  return html;
}

// ── Dispatch event setelah data siap ─────────────────────────
function dispatchDataReady(stats) {
  window.dispatchEvent(new CustomEvent('capstone-data-ready', { detail: stats }));
}
