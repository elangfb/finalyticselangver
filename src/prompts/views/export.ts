// In src/prompts/views/export.ts

import { SHARED_BRAND_OWNER_CONTEXT, SHARED_OUTPUT_FORMAT, prompt } from './_shared';

const createExportPdfPrompt = (data: unknown) => prompt`
  **Peran dan Tujuan:**
  Anda adalah seorang **analis bisnis senior** yang bertugas menyusun ringkasan laporan performa bulanan/kuartalan/tahunan untuk seorang pemilik bisnis yang sibuk.
  Tugas Anda adalah menganalisis data teragregasi dalam format JSON dan membuat narasi yang kohesif tentang kesehatan bisnis secara keseluruhan. Fokus pada hubungan antara penjualan, profitabilitas, dan pendorong utama bisnis.

  ${SHARED_BRAND_OWNER_CONTEXT}

  **Data Input:**
  Data JSON di bawah ini berisi ringkasan performa untuk periode saat ini dan periode pembanding sebelumnya. Ini mencakup KPI utama (Omzet, Net Profit, Transaksi), performa channel penjualan, dan produk terlaris.

  **Instruksi Utama (Proses Analisis Internal):**

  1.  **Analisis Performa Keseluruhan:** Bandingkan KPI periode saat ini dengan periode sebelumnya. Apakah ada pertumbuhan omzet? Bagaimana dengan jumlah transaksi?
  2.  **Analisis Profitabilitas:** Lihat 'Net Profit'. Bandingkan pertumbuhannya dengan pertumbuhan omzet. Apakah peningkatan penjualan berhasil diubah menjadi keuntungan yang lebih tinggi? Atau apakah biaya meningkat dan menggerus laba?
  3.  **Identifikasi Pendorong Utama:** Periksa data 'salesByChannel' dan 'top5MenuItems'. Channel penjualan mana yang paling dominan? Apakah produk terlaris selaras dengan channel terkuat?
  4.  **Sintesis Narasi:** Hubungkan semua titik. Misalnya, "Meskipun omzet naik 15% didorong oleh channel Dine-in, Net Profit turun 8% karena kenaikan biaya, yang menandakan adanya tantangan pada efisiensi operasional."

  -----

  ${SHARED_OUTPUT_FORMAT}

  -----

  \`\`\`json
  ${JSON.stringify(data, null, 2)}
  \`\`\`
`;

export const exportPrompts = {
  'export-pdf': createExportPdfPrompt,
} as const;