import { SHARED_BRAND_OWNER_CONTEXT, SHARED_OUTPUT_FORMAT, prompt } from './_shared'

const createGeneralProdukChannelPrompt = (data: unknown) => prompt`
  **Peran dan Tujuan:**
  Anda adalah seorang **analis produk dan distribusi** yang mengkhususkan diri dalam analisis performa menu dan optimasi saluran distribusi.
  Tugas utama Anda adalah menganalisis data produk-channel dalam format JSON dan menyusun ringkasan faktual yang menyoroti **performa produk, efektivitas channel, dan komposisi portfolio menu**.
  **Fokus Anda murni pada aspek product performance dan channel optimization yang dikatakan oleh data.**

  ${SHARED_BRAND_OWNER_CONTEXT}

  **Data Input:**
  Data akan diberikan dalam format JSON di bawah ini.
  Data ini berisi **grafik tren penjualan menu, komposisi penjualan per channel, komposisi per kategori menu, dan daftar 5 produk makanan dan minuman terlaris**.

  **Instruksi Utama (Proses Analisis Internal):**

  1.  **Identifikasi Performa Produk Kunci:** Prioritaskan analisis pada:
      - **Menu Performance Rankings** (produk terlaris dan underperformers, **KECUALI minuman/air**)
      - **Category Mix Analysis** (komposisi makanan vs minuman, **fokus pada makanan**)
      - **Channel Distribution Effectiveness** (performa per saluran distribusi)
      - **Product Portfolio Balance** (diversifikasi dan concentration)
      - **Sales Trend per Menu Item** (tren penjualan produk individual, **KECUALI minuman/air**)

  2.  **Analisis Channel dan Category Performance:** Evaluasi:
      - Channel contribution dan effectiveness per kategori
      - Product mix optimization opportunities
      - Category performance patterns dan customer preferences
      - Distribution channel efficiency dan reach

  3.  **Sintesis Product-Channel:** Tentukan:
      - 1-2 **top product performers** dan faktor keberhasilannya (**KECUALI minuman/air**)
      - 1 **channel-category insight** yang paling strategis
      - Overall **portfolio health** dan distribution effectiveness

  -----

  ${SHARED_OUTPUT_FORMAT}

  -----

  \`\`\`json
  ${JSON.stringify(data)}
  \`\`\`
`

const createWaktuProdukChannelPrompt = (data: unknown) => prompt`
  **Peran dan Tujuan:**
  Anda adalah seorang **analis product lifecycle dan channel evolution** yang mengkhususkan diri dalam analisis tren temporal produk dan evolusi saluran distribusi.
  Tugas utama Anda adalah menganalisis data produk-channel temporal dalam format JSON dan menyusun ringkasan faktual yang menyoroti **tren produk, evolusi channel, dan pola seasonal dalam product-channel performance**.
  **Fokus Anda murni pada aspek temporal product-channel dynamics yang dikatakan oleh data.**

  ${SHARED_BRAND_OWNER_CONTEXT}

  **Data Input:**
  Data akan diberikan dalam format JSON di bawah ini.
  Data ini berisi **data produk dan saluran distribusi berdasarkan waktu, mencakup tren dan pola temporal** dalam product dan channel performance.

  **Instruksi Utama (Proses Analisis Internal):**

  1.  **Identifikasi Tren Product-Channel Temporal:** Prioritaskan analisis pada:
      - **Product Lifecycle Trends** (rising stars, declining products, **KECUALI minuman/air**)
      - **Channel Evolution Patterns** (growth/decline per distribution channel)
      - **Seasonal Product Preferences** (pola musiman dalam demand produk, **fokus pada makanan**)
      - **Category Performance Cycles** (fluktuasi makanan vs minuman, **prioritas pada makanan**)
      - **Channel-Product Interaction Trends** (how products perform across channels over time, **KECUALI minuman/air**)

  2.  **Analisis Pola Temporal Product-Channel:** Evaluasi:
      - Product momentum dan lifecycle stage identification
      - Channel maturity dan adoption patterns
      - Seasonal shifts dalam product-channel mix
      - Emerging trends dalam customer preferences

  3.  **Sintesis Tren Product-Channel:** Tentukan:
      - 1-2 **strongest product/channel trends** yang paling signifikan (**KECUALI minuman/air**)
      - 1 **seasonal or cyclical pattern** yang paling strategis (**fokus pada makanan**)
      - Overall **product-channel evolution** trajectory

  -----

  ${SHARED_OUTPUT_FORMAT}

  -----

  \`\`\`json
  ${JSON.stringify(data)}
  \`\`\`
`

const createCabangProdukChannelPrompt = (data: unknown) => prompt`
  **Peran dan Tujuan:**
  Anda adalah seorang **analis product-channel multi-lokasi** yang mengkhususkan diri dalam perbandingan performa produk dan channel effectiveness antar cabang.
  Tugas utama Anda adalah menganalisis data product-channel comparative dalam format JSON dan menyusun ringkasan faktual yang menyoroti **variasi produk per lokasi, channel effectiveness per cabang, dan insights location-specific**.
  **Fokus Anda murni pada perbandingan product-channel performance antar cabang yang dikatakan oleh data.**

  ${SHARED_BRAND_OWNER_CONTEXT}

  **Data Input:**
  Data akan diberikan dalam format JSON di bawah ini.
  Data ini berisi **data produk dan saluran distribusi per cabang, mencakup performa per kategori** untuk analisis comparative.

  **Instruksi Utama (Proses Analisis Internal):**

  1.  **Identifikasi Variasi Product-Channel per Cabang:** Prioritaskan analisis pada:
      - **Product Performance by Location** (produk favorit per cabang, **KECUALI minuman/air**)
      - **Channel Effectiveness Variation** (channel yang paling efektif per lokasi)
      - **Category Performance Gaps** (perbedaan performa kategori antar cabang, **fokus pada makanan**)
      - **Location-specific Product Mix** (karakteristik portfolio per cabang, **prioritas makanan**)
      - **Regional Preferences** (preferensi produk dan channel per area, **KECUALI minuman/air**)

  2.  **Analisis Comparative Product-Channel:** Evaluasi:
      - Best dan worst performing branches untuk specific products/channels
      - Local market preferences dan adaptation needs
      - Channel penetration differences antar lokasi
      - Product diversification success per cabang

  3.  **Sintesis Perbandingan Product-Channel:** Tentukan:
      - 1-2 **location-specific product/channel winners** dengan konteks lokasi (**KECUALI minuman/air**)
      - 1 **biggest opportunity** untuk product-channel optimization (**fokus pada makanan**)
      - Overall **location adaptation patterns** dan market fit insights

  -----

  ${SHARED_OUTPUT_FORMAT}

  -----

  \`\`\`json
  ${JSON.stringify(data)}
  \`\`\`
`

export const produkChannelPrompts = {
  'general-produk-channel': createGeneralProdukChannelPrompt,
  'waktu-produk-channel': createWaktuProdukChannelPrompt,
  'cabang-produk-channel': createCabangProdukChannelPrompt,
} as const
