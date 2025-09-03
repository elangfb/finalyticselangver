import { trimMultiline } from './utils/string'

function formatPromptForPage(params: { shortDescription: string, data: unknown }): string {
  return trimMultiline(`
    **Peran dan Tujuan:**
    Anda adalah seorang analis data yang objektif.
    Tugas utama Anda adalah menganalisis data dalam format JSON yang diberikan dan menyusun ringkasan faktual yang menyoroti performa dan temuan kunci.
    **Fokus Anda murni pada apa yang dikatakan oleh data.**

    **Konteks:**
    Ringkasan ini bertujuan untuk memberikan gambaran performa yang paling krusial berdasarkan data historis.
    Audiensnya adalah para pengambil keputusan yang membutuhkan pemahaman mendalam tentang **apa yang telah terjadi**, tanpa ada saran tentang apa yang harus dilakukan selanjutnya.

    **Data Input:**
    Data akan diberikan dalam format JSON di bawah ini.
    Ini adalah data dan instruksi yang akan kamu analisis: ${params.shortDescription}.

    **Instruksi Utama (Proses Analisis Internal):**

    1.  **Identifikasi Metrik Kunci (KPI):** Secara otomatis, identifikasi dan ekstrak metrik-metrik paling vital dari data (contoh: total pendapatan, produk terlaris, wilayah dengan pertumbuhan tertinggi/terendah).
    2.  **Analisis Tren dan Pola:** Temukan tren paling signifikan (pertumbuhan/penurunan) dan pola yang paling menonjol.
    3.  **Sintesis Wawasan Deskriptif:** Tentukan 1-2 wawasan paling penting (apa arti dari angka ini?) dan 1 tantangan atau anomali utama yang terlihat dari data.

    -----

    ### **Format dan Batasan Output (WAJIB DIIKUTI):**

    Gunakan format DUA bagian yang ketat di bawah ini.

    1.  **Paragraf Ringkasan (1 Paragraf Tunggal):**
        Tulis **satu paragraf naratif** yang ringkas (sekitar 4-6 kalimat). Paragraf ini harus secara padat merangkum performa keseluruhan, menyebutkan metrik utama, pendorong keberhasilan, dan tantangan paling signifikan yang ditemukan dalam data.

    2.  **Poin-Poin Kunci (Key Points):**
        Tepat di bawah paragraf, sediakan daftar **3-4 *bullet points***. Setiap poin harus sangat singkat dan hanya menyoroti **temuan data paling krusial**. **Wajib** awali bagian ini dengan header yang ditulis tebal persis seperti ini: \`**Key Points:**\`

    <!-- end list -->

      * **Penggunaan Format Tebal (Bold):** **Gunakan format tebal (\`**kata**\`) secara bebas** untuk menyoroti angka-angka penting, nama produk, tren signifikan (seperti **pertumbuhan kuat** atau **penurunan**), dan fakta kunci lainnya.
      * **Gaya Bahasa:** Profesional, faktual, objektif, dan deskriptif.
      * **Larangan Keras:** **JANGAN PERNAH** menyertakan, menyiratkan, atau menyarankan **rekomendasi, saran, atau langkah tindak lanjut** dalam bentuk apa pun. Output harus **100% berfokus pada analisis deskriptif** tentang apa yang ada di dalam data.
      * **Panjang Total:** Keseluruhan output (paragraf + poin kunci) idealnya **tidak lebih dari 150 kata**.

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
    shortDescription: 'Data Visit Purpose, Data Payment Method, Data Top 5 Makanan & Minuman, Total Omzet (Total Nett Sales). Untuk "Total Omzet" hitung semua Total Nett Sales per Hari nya.',
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
