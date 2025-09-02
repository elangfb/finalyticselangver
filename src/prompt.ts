import { trimMultiline } from './utils/string'

function formatPromptForPage(params: { shortDescription: string, data: unknown }): string {
  return trimMultiline(`
    **Peran dan Tujuan:**
    Anda adalah seorang analis bisnis senior yang sangat terampil dalam menerjemahkan data mentah menjadi wawasan strategis. Tugas utama Anda adalah menganalisis data dalam format JSON yang diberikan dan menyusun ringkasan yang sangat padat dan langsung ke intinya untuk para pemangku kepentingan (C-level executive).

    **Konteks:**
    Ringkasan ini bertujuan untuk memberikan gambaran paling krusial dari data dalam waktu kurang dari 30 detik. Audiensnya adalah para pengambil keputusan yang sangat sibuk dan hanya membutuhkan sorotan utama serta rekomendasi paling penting.

    **Data Input:**
    Data akan diberikan dalam format JSON di bawah ini. Data ini berisi ${params.shortDescription}.

    **Instruksi Utama (Proses Analisis Internal):**

    1.  **Identifikasi Metrik Kunci (KPI):** Secara otomatis, identifikasi dan ekstrak metrik-metrik paling vital dari data (contoh: total pendapatan, produk terlaris, wilayah dengan pertumbuhan tertinggi/terendah).
    2.  **Analisis Tren dan Pola:** Temukan tren paling signifikan (pertumbuhan/penurunan) dan pola yang paling menonjol.
    3.  **Sintesis Wawasan (Insight):** Tentukan 1-2 wawasan paling penting (apa arti dari angka ini?) dan 1 tantangan utama.
    4.  **Rumuskan Rekomendasi Utama:** Berdasarkan analisis, tentukan satu tindakan prioritas yang paling mendesak atau berdampak.

    -----

    ### **Format dan Batasan Output (WAJIB DIIKUTI):**

    Gunakan format DUA bagian yang ketat di bawah ini. Jangan menambahkan judul atau bagian lain.

    1.  **Paragraf Ringkasan (1 Paragraf Tunggal):**
        Tulis **satu paragraf naratif** yang ringkas (sekitar 4-6 kalimat). Paragraf ini harus secara padat merangkum performa keseluruhan, menyebutkan metrik utama, pendorong keberhasilan, dan tantangan paling signifikan yang ditemukan dalam data.

    2.  **Poin-Poin Kunci (Key Points):**
        Tepat di bawah paragraf, sediakan daftar **3-4 *bullet points***. Setiap poin harus sangat singkat. **Wajib** awali bagian ini dengan header yang ditulis tebal persis seperti ini: \`**Key Points:**\`

    <!-- end list -->

      * **Penggunaan Format Tebal (Bold):** **Gunakan format tebal (\`**kata**\`) secara bebas** pada kedua bagian (paragraf dan poin kunci) untuk menyoroti angka-angka penting, nama produk, tren signifikan (seperti **pertumbuhan luar biasa** atau **penurunan**), dan kata kunci lainnya yang memerlukan perhatian segera. Ini sangat penting untuk mempermudah pembacaan cepat.
      * **Gaya Bahasa:** Profesional, langsung ke intinya (to the point), dan berbasis data.
      * **Panjang Total:** Keseluruhan output (paragraf + poin kunci) idealnya **tidak lebih dari 150 kata**.
      * **Penting:** JANGAN hanya menyalin data mentah. Lakukan sintesis dan interpretasi untuk menghasilkan output yang bernilai.

    -----

    \`\`\`json
    ${JSON.stringify(params.data, null, 2)}
    \`\`\`
  `)
}

export const prompts = Object.freeze({})

export const chartPrompts = Object.freeze({
  dailyOmzetHeatmap: '<EMPTY PROMPT>',
  omzetJamHariHeatmap: '<EMPTY PROMPT>',
  salesTrendHourlyDaily: '<EMPTY PROMPT>',
  tcApcHarian: '<EMPTY PROMPT>',
  omzetHarian: '<EMPTY PROMPT>',
  omzetMingguan: '<EMPTY PROMPT>',
  omzetOutlet: '<EMPTY PROMPT>',
  penjualanBulanan: '<EMPTY PROMPT>',
  penjualanChannel: '<EMPTY PROMPT>',
  orderByCategory: '<EMPTY PROMPT>',
  topMakanan: '<EMPTY PROMPT>',
  topMinuman: '<EMPTY PROMPT>',
  cabangOmzetCheck: '<EMPTY PROMPT>',
  yoyOmzet: '<EMPTY PROMPT>',
  cabangApc: '<EMPTY PROMPT>',
  cabangDetail: '<EMPTY PROMPT>',
  yoyDetail: '<EMPTY PROMPT>',
  generalPdfInsights: '<EMPTY PROMPT>',
})

export const viewPromptCreators = Object.freeze({
  'general-keuangan': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data perbandingan target dan aktual Laba & Rugi, tabel historis Laba & Rugi, grafik Omzet, Beban, dan Laba, serta rasio-rasio keuangan (COGS, GPM, NPM)',
    data
  }),
  'general-penjualan': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data ringkasan penjualan (total omzet, total transaksi, rata-rata belanja), grafik omzet harian dan mingguan, grafik tren transaksi harian (TC & APC), serta heatmap penjualan per hari dan per jam',
    data
  }),
  'general-produk-channel': (data: unknown) => formatPromptForPage({
    shortDescription: 'Grafik tren penjualan menu, komposisi penjualan per channel, komposisi penjualan per kategori menu, serta daftar 5 produk makanan dan minuman terlaris',
    data
  }),
  'general-investasi': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data investasi perusahaan, termasuk ROI (Return on Investment) dan analisis risiko',
    data
  }),
  'waktu-keuangan': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data keuangan perusahaan berdasarkan waktu, termasuk tren dan pola',
    data
  }),
  'waktu-penjualan': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data penjualan perusahaan berdasarkan waktu, termasuk tren dan pola',
    data
  }),
  'waktu-produk-channel': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data produk dan saluran distribusi berdasarkan waktu, termasuk tren dan pola',
    data
  }),
  'cabang-keuangan': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data keuangan perusahaan berdasarkan cabang, termasuk pendapatan, pengeluaran, dan profitabilitas',
    data
  }),
  'cabang-penjualan': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data penjualan perusahaan berdasarkan cabang, termasuk produk terlaris dan saluran distribusi',
    data
  }),
  'cabang-produk-channel': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data produk dan saluran distribusi berdasarkan cabang, termasuk performa per kategori',
    data
  }),
  'cabang-investasi': (data: unknown) => formatPromptForPage({
    shortDescription: 'Data investasi perusahaan berdasarkan cabang',
    data
  }),
})
