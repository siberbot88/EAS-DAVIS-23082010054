# Executive Sales & Anomaly Dashboard (Sales BY Category)

Dashboard analitik penjualan berbasis AI (AI-Augmented Dashboard) yang dirancang khusus untuk eksekutif level C (C-Suite) dengan filosofi desain "Semantic"—ringkas, bersih, dan berorientasi cerita dalam alur narasi **Setup-Conflict-Resolution (SCR)**.

Proyek ini dibangun menggunakan **D3.js (v7)** untuk visualisasi data interaktif secara langsung, dikombinasikan dengan **Google Gemini API** untuk memproduksi narasi naratif bisnis dan alert anomali secara real-time.

---

## 🚀 Cara Menjalankan Proyek

1. **Jalankan Web Server Lokal**:
   Dashboard memuat berkas CSV secara lokal, sehingga harus dijalankan melalui server web lokal (karena pembatasan keamanan CORS browser).
   Jalankan perintah berikut pada direktori proyek Anda:
   ```bash
   npx http-server -p 8081 -c-1
   ```
   *Atau gunakan ekstensi "Live Server" di VS Code.*

2. **Akses Dashboard**:
   Buka peramban (browser) Anda dan akses:
   [http://localhost:8081](http://localhost:8081)

3. **Konfigurasi API Key Gemini**:
   Buka berkas `config.js` dan masukkan API Key Gemini Anda:
   ```javascript
   GEMINI_API_KEY: 'MASUKKAN_API_KEY_GEMINI_ANDA',
   ```

---

## 🏛️ Arsitektur Proyek

Proyek ini terbagi menjadi modul-modul modular berikut:
* **`index.html`**: Halaman utama yang dibagi menjadi 3 Zona SCR, dilengkapi tab-bar atas untuk berpindah antara *AI Dashboard* (D3 + LLM) dan *Tableau Public* (lazy load).
* **`style.css`**: Sistem desain visual bertema gelap modern yang sangat premium, menggunakan transisi mulus, indikator pemuatan animasi, dan palet warna semantik (Merah = Kritis, Hijau = Positif).
* **`app.js`**: Pusat orkestrasi pemuatan data, parsing format desimal/tanggal, pemanggilan visualisasi grafik D3, dan pengaturan pemanggilan narasi AI secara paralel menggunakan `Promise.allSettled`.
* **`config.js`**: Manajemen konfigurasi pusat (jenis provider AI, model API, model Groq/Ollama/Gemini, dan API key).
* **`anomalyDetector.js`**: Mesin statistik untuk mendeteksi data anomali (Z-score, IQR Outliers, MoM Spikes).
* **`storyEngine.js`**: Penyusun prompt narasi SCR (Setup, Conflict, Resolution) yang dinamis menyesuaikan statistik metrik yang tersedia.
* **`aiInsight.js`**: Komunikasi dengan API LLM (Ollama, Groq, Gemini) dan pemformatan teks insight ke dalam struktur HTML.

---

## 🚨 Metode Deteksi Anomali

Sistem ini mendeteksi 3 jenis anomali secara matematis:
1. **Outlier Metrik Utama per Sub-Kategori (Z-score)**: Mendeteksi jika ada subkategori yang margin profitabilitasnya melenceng jauh dari rata-rata industri dengan batas threshold `1.5`.
2. **Volatilitas Bulanan Ekstrem (MoM Spikes & Drops)**: Mendeteksi kenaikan atau penurunan pendapatan bulanan yang tidak wajar dengan threshold `25%` (seperti penurunan tajam `-97.8%` di Juli 2004).
3. **Penyebaran Transaksi Tidak Normal (IQR Outliers)**: Menganalisis sebaran nilai baris transaksi individual per subkategori menggunakan metode Interquartile Range (IQR) pagar $1.5 \times IQR$ untuk melacak pencilan ekstrim.

---

## 📊 Detail Dataset `Sales_BY_Category.csv`

* **Daftar Kolom**: `"SalesOrderID","OrderDate","ShipDate","ShipMethod","CustomerID","CustomerName","Segment","CountryRegion","City","Province","PostalCode","Territory","ProductName","SubCategory","Category","Qty","UnitPrice","Sales","Discount","ProductCost","TotalCost","Profit"`
* **Jumlah Transaksi**: 18.106 baris data.
* **Format Delimiter**: Koma ( `,` )
* **Format Desimal**: Titik ( `.` )
* **Kolom Profit**: **Ya** (`Profit`)
* **Kolom Tanggal**: **Ya** (`OrderDate`), format: `YYYY-MM-DD HH:MM:SS.MMM` (Contoh: `2001-07-01 00:00:00.000`)
* **Baris Contoh**:
  ```text
  43659,2001-07-01 00:00:00.000,2001-07-08 00:00:00.000,CARGO TRANSPORT 5,676,,Shop,United States,Austell,Georgia,"30106",Southeast,AWC Logo Cap,Caps,Clothing,2,5.1865,10.373,0.0,5.7052,11.4104,-1.0373999999999999
  43661,2001-07-01 00:00:00.000,2001-07-08 00:00:00.000,CARGO TRANSPORT 5,442,,Shop,Canada,Toronto,Ontario,M4B 1V5,Canada,AWC Logo Cap,Caps,Clothing,4,5.1865,20.746,0.0,5.7052,22.8208,-2.0747999999999998
  ```
