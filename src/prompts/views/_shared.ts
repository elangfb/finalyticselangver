import { trimMultiline } from '@/utils/string'

export const SHARED_OUTPUT_FORMAT = `
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
`

export const SHARED_BRAND_OWNER_CONTEXT = `
**Konteks:**
Ringkasan ini bertujuan untuk memberikan gambaran performa yang paling krusial berdasarkan data historis.
Audiensnya adalah pemilik brand yang membutuhkan pemahaman mendalam tentang **apa yang telah terjadi**, tanpa ada saran tentang apa yang harus dilakukan selanjutnya.
`

export const prompt = (strings: TemplateStringsArray, ...expr: any[]) => trimMultiline(String.raw({ raw: strings } as any, ...expr))
