import { trimMultiline } from './utils/string'

/**
 * Format AI prompt with standardized Indonesian language instructions and output guidelines.
 *
 * @description
 * Appends comprehensive formatting instructions to base prompts for consistent AI
 * output generation. Includes Indonesian language requirements, markdown formatting
 * rules, bullet point standards, and structured conclusion format with key-value
 * pairs. Ensures AI responses follow business communication standards for
 * restaurant managers and outlet owners.
 *
 * @param prompt - Base prompt string containing business analysis request.
 * @returns Formatted prompt with appended instruction footer and formatting guidelines.
 *
 * @example
 * // Format business analysis prompt with standard instructions
 * const basePrompt = "Analisis penjualan harian berdasarkan data terlampir.";
 * const formattedPrompt = formatPrompt(basePrompt);
 * // Returns prompt with Indonesian language rules, formatting guidelines,
 * // and structured conclusion requirements
 */
function formatPrompt(prompt: string): string {
  const footer = `
        **Instruksi Format:**
        * Gunakan **bahasa Indonesia**
        * Tujukan hasil analisis kepada pemilik atau manajer outlet
        * Gunakan \`*\` untuk bullet point dan **penekanan** dengan \`**\`
        * **Jangan gunakan kode, tabel, atau format markdown lainnya**
        * Tidak perlu menggunakan pembukaan. Contoh pembukaan yang tidak perlu: "Kepada Yth. Bapak/Ibu Pemilik/Manajer Outlet"

        **Sebelum menampilkan hasil:**
        * Pastikan seluruh jawaban ditulis dalam **bahasa Indonesia saja**.
        * Gunakan hanya \`*\` sebagai bullet point dan **penekanan** teks dengan \`**\`.
        * **Jangan tampilkan kode, tabel, atau format Markdown lainnya.**
        * **Jangan tampilkan output dalam bahasa Inggris.**
        * Jika ada format yang tidak sesuai, perbaiki sebelum menampilkan hasil.

        **PENTING:**
        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format key-value.

        **Data:**
        {data}
    `

  return trimMultiline(prompt + footer)
}

export const prompts = {
  dailyOmzetHeatmap: formatPrompt(`
        Anda adalah analis data restoran yang memberikan laporan kepada pemilik atau manajer outlet.

        Analisis data **penjualan harian** berikut dalam format heatmap kalender, di mana setiap entri adalah tanggal dan nilai total pendapatan dalam Rupiah (IDR).

        Tugas Anda:
        * Identifikasi **hari tersibuk dalam seminggu** berdasarkan pola penjualan.
        * Temukan **pola mingguan atau siklus**, seperti perbedaan hari kerja dan akhir pekan.
        * Berikan **rekomendasi praktis** yang dapat diterapkan manajer untuk penjadwalan, promosi, atau penyesuaian menu.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainInsight: <insight_utama_dari_analisis_heatmap>
    `),

  omzetJamHariHeatmap: formatPrompt(`
        Anda adalah analis operasional restoran yang membantu manajer outlet memahami pola penjualan harian.

        Analisis data penjualan berdasarkan **jam dan hari** dalam format heatmap, di mana nilai menunjukkan pendapatan untuk setiap jam pada hari tertentu.

        Tugas Anda:
        * Temukan **jam-jam sibuk** dan **periode sepi** sepanjang minggu.
        * Bedakan pola penjualan antara **hari kerja dan akhir pekan**.
        * Berikan **saran konkret** untuk mengoptimalkan jadwal staf, promosi waktu tertentu, atau penyusunan menu.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainJamHariInsight: <insight_utama_dari_analisis_heatmap_jam_vs_hari>
    `),

    salesTrendHourlyDaily: formatPrompt(`
        Anda adalah analis operasional restoran yang membantu manajer outlet memahami pola penjualan harian.

        Analisis data penjualan berdasarkan jam dan hari, di mana setiap entri adalah dataset untuk satu hari dalam seminggu, menunjukkan total pendapatan per jam.

        Tugas Anda:
        * Temukan **jam-jam sibuk** dan **periode sepi** berdasarkan total pendapatan sepanjang minggu.
        * Bandingkan pola penjualan antara **hari kerja dan akhir pekan**.
        * Berikan **saran konkret** untuk mengoptimalkan jadwal staf, promosi pada jam-jam tertentu, atau penyesuaian menu berdasarkan tren pendapatan.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainSalesTrendHourlyDailyInsight: <insight_utama_dari_analisis_tren_penjualan_per_jam_dan_hari>
    `),

  tcApcHarian: formatPrompt(`
        Anda adalah analis kinerja restoran yang memberikan saran langsung kepada pemilik outlet.

        Analisis tren harian untuk **Total Checks (TC)** dan **Average Per Check (APC)**.

        Tugas Anda:
        * Tinjau hubungan antara volume transaksi dan rata-rata nilai per transaksi.
        * Identifikasi pola naik-turun pada TC dan APC dari waktu ke waktu.
        * Berikan **strategi praktis** agar restoran dapat meningkatkan keduanya secara bersamaan.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainTcApcInsight: <insight_utama_dari_analisis_TC_dan_APC>
    `),

  omzetHarian: formatPrompt(`
        Anda adalah analis bisnis restoran yang memberikan laporan kepada manajer outlet.

        Analisis data penjualan harian dalam Rupiah (IDR) berdasarkan tanggal.

        Tugas Anda:
        * Temukan **tren mingguan atau bulanan** yang konsisten.
        * Identifikasi **lonjakan atau penurunan tiba-tiba**.
        * Soroti hari-hari dengan pendapatan tertinggi dan kemungkinan penyebabnya.
        * Berikan **minimal 3 rekomendasi nyata** untuk menjaga atau meningkatkan penjualan.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainOmzetHarianInsight: <insight_utama_dari_analisis_omzet_harian>
    `),

  omzetMingguan: formatPrompt(`
        Anda adalah analis bisnis restoran yang memantau tren mingguan untuk pemilik usaha.

        Analisis data omzet mingguan, di mana setiap entri mencerminkan total pendapatan dalam satu minggu kalender.

        Tugas Anda:
        * Identifikasi **tren jangka panjang** (naik, turun, stabil).
        * Temukan **minggu dengan performa ekstrem** (tinggi atau rendah).
        * Berikan **analisis kemungkinan faktor eksternal**.
        * Sajikan **rekomendasi strategis** untuk mempertahankan pertumbuhan atau melakukan perbaikan.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainOmzetMingguanInsight: <insight_utama_dari_analisis_omzet_mingguan>
    `),

  omzetOutlet: formatPrompt(`
        Anda adalah analis bisnis yang mengukur performa outlet restoran.

        Data berikut menunjukkan total omzet masing-masing outlet.

        Tugas Anda:
        * Identifikasi outlet **berkinerja terbaik** dan **terendah**.
        * Bandingkan perbedaan antar outlet secara kuantitatif.
        * Berikan **rekomendasi tindakan** yang relevan untuk meningkatkan outlet yang lemah.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        topOmzetOutletName: <nama_outlet_omzet_tertinggi>
    `),

  penjualanBulanan: formatPrompt(`
        Anda adalah analis performa restoran bulanan.

        Data mencakup **pendapatan dan jumlah transaksi bulanan**.

        Tugas Anda:
        * Temukan pola **pertumbuhan atau penurunan** dari bulan ke bulan.
        * Analisis apakah pertumbuhan berasal dari peningkatan volume atau nilai per transaksi.
        * Sajikan insight yang membantu pemilik dalam merencanakan strategi jangka panjang.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainPenjualanBulananInsight: <insight_utama_dari_analisis_penjualan_bulanan>
    `),

  penjualanChannel: formatPrompt(`
        Anda adalah analis kanal penjualan restoran yang bertugas memberikan saran kepada pemilik usaha.

        Data berikut menampilkan omzet berdasarkan saluran (dine-in, takeaway, delivery).

        Tugas Anda:
        * Tentukan **channel dengan kontribusi tertinggi dan terendah**.
        * Soroti perbedaan performa antar saluran.
        * Berikan **strategi optimasi** untuk masing-masing channel agar lebih efektif dan efisien.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        topChannelName: <nama_channel_penjualan_tertinggi>
    `),

  orderByCategory: formatPrompt(`
        Anda adalah konsultan strategi menu restoran.

        Data berikut menunjukkan **jumlah penjualan per kategori menu**.

        Tugas Anda:
        * Identifikasi kategori **paling laris** dan **kurang laku**.
        * Analisis preferensi pelanggan berdasarkan data tersebut.
        * Rancang strategi untuk meningkatkan performa kategori lemah, seperti bundling atau promo.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        topCategoryName: <nama_kategori_menu_terlaris>
    `),

  topMakanan: formatPrompt(`
        Anda adalah pakar pemasaran makanan yang membantu restoran meningkatkan penjualan menu andalan.

        Data menunjukkan **5 makanan terlaris** berdasarkan jumlah unit terjual.

        Tugas Anda:
        * Jelaskan apa yang ditunjukkan oleh popularitas menu terhadap **selera pelanggan**.
        * Sarankan **pasangan menu (makanan & minuman)** untuk mendorong pembelian tambahan.
        * Berikan ide promosi kreatif berdasarkan kekuatan tiap menu.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        topMakananName: <nama_makanan_terlaris>
    `),

  topMinuman: formatPrompt(`
        Anda adalah analis minuman dan perilaku konsumen restoran.

        Data berikut menunjukkan **5 minuman terlaris**.

        Tugas Anda:
        * Identifikasi preferensi minuman pelanggan (rasa, suhu, gaya penyajian).
        * Rekomendasikan makanan pendamping untuk tiap minuman.
        * Tawarkan strategi upselling seperti promo bundling atau jam tertentu.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        topMinumanName: <nama_minuman_terlaris>
    `),

  cabangOmzetCheck: formatPrompt(`
        Anda adalah analis performa cabang restoran.

        Data menunjukkan **omzet dan jumlah transaksi** untuk masing-masing cabang.

        Tugas Anda:
        * Identifikasi cabang **paling dan paling tidak produktif**.
        * Tinjau efisiensi berdasarkan rasio omzet per transaksi.
        * Berikan saran spesifik agar cabang berkinerja rendah dapat meningkat.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        topCabangOmzetCheckName: <nama_cabang_omzet_tertinggi>
    `),

  yoyOmzet: formatPrompt(`
        Anda adalah analis keuangan yang memantau performa omzet tahunan restoran.

        Data membandingkan omzet bulanan **tahun ini dan tahun sebelumnya**.

        Tugas Anda:
        * Identifikasi bulan dengan **pertumbuhan besar** dan **penurunan drastis**.
        * Uraikan kemungkinan penyebabnya.
        * Tawarkan strategi agar bisnis dapat menindaklanjuti tren ini.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainYoyOmzetInsight: <insight_utama_dari_analisis_YoY_omzet>
    `),

  cabangApc: formatPrompt(`
        Anda adalah konsultan performa cabang restoran.

        Data berikut menunjukkan **rata-rata pembelanjaan per transaksi (APC)** untuk setiap cabang.

        Tugas Anda:
        * Temukan cabang dengan **APC tertinggi dan terendah**.
        * Bandingkan dan analisis selisih antar cabang.
        * Berikan strategi khusus untuk meningkatkan nilai transaksi di cabang yang kurang optimal.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        topCabangApcName: <nama_cabang_APC_tertinggi>
    `),

  cabangDetail: formatPrompt(`
        Anda adalah analis operasional untuk restoran multi-cabang.

        Data mencakup omzet, jumlah transaksi, dan APC untuk tiap cabang.

        Tugas Anda:
        * Ringkas performa utama tiap cabang.
        * Soroti kekuatan dan kelemahan cabang berdasarkan metrik.
        * Rekomendasikan langkah-langkah yang bisa segera diterapkan per outlet.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainCabangDetailInsight: <insight_utama_dari_analisis_detail_cabang>
    `),

  yoyDetail: formatPrompt(`
        Anda adalah analis keuangan restoran yang fokus pada tren tahunan.

        Data berikut menunjukkan perbandingan omzet bulanan tahun ini dan tahun sebelumnya.

        Tugas Anda:
        * Temukan bulan dengan perubahan paling signifikan (baik positif maupun negatif).
        * Berikan penjelasan yang masuk akal untuk tiap perubahan besar.
        * Jelaskan bagaimana tren ini harus memengaruhi keputusan bisnis.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format berikut:
        mainYoyDetailInsight: <insight_utama_dari_analisis_detail_YoY>
    `),

  generalPdfInsights: formatPrompt(`
        Anda adalah analis data utama yang bertugas menghitung semua metrik yang diperlukan untuk laporan PDF.

        Tugas Anda:
        Berdasarkan data yang diberikan, hitung dan kembalikan semua data poin yang diperlukan dalam format key-value. Pastikan setiap nilai sesuai dengan kunci yang diberikan di bawah.

        Setelah analisis, tambahkan baris pemisah '===' dan kemudian berikan kesimpulan dalam format key-value berikut:

        // Page 1: General Overview
        currentOmzetFormatted: <nilai>
        lastPeriodOmzetUpOrDown: <nilai>
        lastPeriodOmzetPercentage: <nilai>
        lastPeriodOmzetPlusOrMinus: <nilai>
        lastPeriodOmzetDifference: <nilai>
        currentCheckFormatted: <nilai>
        lastPeriodCheckUpOrDown: <nilai>
        lastPeriodCheckPercentage: <nilai>
        lastPeriodCheckPlusOrMinus: <nilai>
        lastPeriodCheckDifference: <nilai>
        currentAvgCheckFormatted: <nilai>
        lastPeriodAvgCheckUpOrDown: <nilai>
        lastPeriodAvgCheckPercentage: <nilai>
        lastPeriodAvgCheckPlusOrMinus: <nilai>
        lastPeriodAvgCheckDifference: <nilai>
        topOmzetPercentage: <nilai>
        topOmzetOutletName: <nilai>

        // Page 3: Customer Spending
        avgSpendLower: <nilai>
        avgSpendUpper: <nilai>
        highestSingleTransaction: <nilai>
        busiestTimeRange: <nilai>
        busiestDay: <nilai>
        upsellingTips: <nilai>

        // Page 4: Weekend Insights
        mainWeekendInsight: <nilai>
        tcTrendInsight: <nilai>
        salesChannelInsight: <nilai>

        // Page 5: Weekend Sales
        weekendSalesPercentage: <nilai>
        mainSalesInsight: <nilai>
        apcIncrease: <nilai>
        potentialBonusOmzet: <nilai>
        motivationalMessage: <nilai>

        // Page 6: Hourly Insights
        hourlyPageTitle: <nilai>
        tcInsightText: <nilai>
        tcSuggestionText: <nilai>
        apcInsightText: <nilai>
        peakHoursInsight: <nilai>
        mainHourPercentage: <nilai>
        mainHourInsight: <nilai>
        apcIncreaseAmount: <nilai>
        potentialBonusAmount: <nilai>
        proTip1: <nilai>
        proTip2: <nilai>

        // Page 7: Sales Channel Insights
        pageTitle: <nilai>
        hourlyChannelInsight: <nilai>
        mainChannelInsight: <nilai>
        monthlyChannelInsight: <nilai>

        // Page 8: More Channel Insights
        monthlyIncreasePercentage: <nilai>
        monthlyIncreaseInsight: <nilai>
        hourlyInsight: <nilai>
        hourlySuggestion: <nilai>
        weeklyInsight: <nilai>
        weeklySuggestion: <nilai>
        monthlyInsight: <nilai>

        // Page 9: GoFood Insights
        mainGoFoodInsight: <nilai>
        hourlyAPCInsightDinner: <nilai>
        hourlyAPCInsightDineIn: <nilai>
        weeklyAPCInsight: <nilai>
        monthlyAPCInsight: <nilai>

        // Page 10: Channel Comparison
        dineInIncreasePercentage: <nilai>
        dineInIncreaseInsight: <nilai>
        growthChan1Name: <nilai>
        growthChan1TC: <nilai>
        growthChan1APC: <nilai>
        growthChan1Percent: <nilai>
        growthChan2Name: <nilai>
        growthChan2TC: <nilai>
        growthChan2APC: <nilai>
        growthChan2Percent: <nilai>
        topSalesChan1Name: <nilai>
        topSalesChan1Nominal: <nilai>
        topSalesChan2Name: <nilai>
        topSalesChan2Nominal: <nilai>
        monthlyIncreaseChan1Name: <nilai>
        monthlyIncreaseChan1Percent: <nilai>
        monthlyIncreaseChan1Nominal: <nilai>
        monthlyIncreaseChan2Name: <nilai>
        monthlyIncreaseChan2Percent: <nilai>
        monthlyIncreaseChan2Nominal: <nilai>

        // Page 11: Food Analysis
        favoriteFoods: <nilai>
        podium1: <nilai>
        podium2: <nilai>
        podium3: <nilai>
        top5_1_name: <nilai>
        top5_1_percent: <nilai>
        top5_1_revenue: <nilai>
        top5_2_name: <nilai>
        top5_2_percent: <nilai>
        top5_2_revenue: <nilai>
        top5_3_name: <nilai>
        top5_3_percent: <nilai>
        top5_3_revenue: <nilai>
        top5_4_name: <nilai>
        top5_4_percent: <nilai>
        top5_4_revenue: <nilai>
        top5_5_name: <nilai>
        top5_5_percent: <nilai>
        top5_5_revenue: <nilai>
        superheroTitle: <nilai>
        superheroName: <nilai>
        superheroContributionPercent: <nilai>
        superheroContributionNominal: <nilai>
        timelineTitle: <nilai>
        hero_time1_name: <nilai>
        hero_time2_name: <nilai>
        hero_time3_name: <nilai>
        hero_time4_name: <nilai>

        // Page 12: Drink Analysis
        favoriteDrinks: <nilai>
        podium1_drink: <nilai>
        podium2_drink: <nilai>
        podium3_drink: <nilai>
        top5_drink_1_name: <nilai>
        top5_drink_1_percent: <nilai>
        top5_drink_1_revenue: <nilai>
        top5_drink_2_name: <nilai>
        top5_drink_2_percent: <nilai>
        top5_drink_2_revenue: <nilai>
        top5_drink_3_name: <nilai>
        top5_drink_3_percent: <nilai>
        top5_drink_3_revenue: <nilai>
        top5_drink_4_name: <nilai>
        top5_drink_4_percent: <nilai>
        top5_drink_4_revenue: <nilai>
        top5_drink_5_name: <nilai>
        top5_drink_5_percent: <nilai>
        top5_drink_5_revenue: <nilai>
        sidekickTitle: <nilai>
        sidekickName: <nilai>
        sidekickContributionPercent: <nilai>
        sidekickContributionNominal: <nilai>
        hero_drink_time1_name: <nilai>
        hero_drink_time2_name: <nilai>
        hero_drink_time3_name: <nilai>
        hero_drink_time4_name: <nilai>

        // Page 13: Outlet Comparison
        outletGrowth1Name: <nilai>
        outletGrowth1TC: <nilai>
        outletGrowth1APC: <nilai>
        outletGrowth1Percent: <nilai>
        outletGrowth2Name: <nilai>
        outletGrowth2TC: <nilai>
        outletGrowth2APC: <nilai>
        outletGrowth2Percent: <nilai>
        topOutlet1Name: <nilai>
        topOutlet1Nominal: <nilai>
        topOutlet2Name: <nilai>
        topOutlet2Nominal: <nilai>
        monthlyOutletIncrease1Name: <nilai>
        monthlyOutletIncrease1Percent: <nilai>
        monthlyOutletIncrease1Nominal: <nilai>
        monthlyOutletIncrease2Name: <nilai>
        monthlyOutletIncrease2Percent: <nilai>
        monthlyOutletIncrease2Nominal: <nilai>

        // Page 14: HPP Analysis
        totalHPP: <nilai>
        hppTrendPercent: <nilai>
        hppTrendNominal: <nilai>
        highlight1: <nilai>
        highlight2: <nilai>
        highlight3: <nilai>

        // Page 15: Food Cost
        foodCostTip: <nilai>
        foodCostAlertPercentage: <nilai>
        costOutlet1: <nilai>
        costOutlet1Value: <nilai>
        costOutlet2: <nilai>
        costOutlet2Value: <nilai>
        costOutlet3: <nilai>
        costOutlet3Value: <nilai>
        costOutlet4: <nilai>
        costOutlet4Value: <nilai>
        varianceOutlet1: <nilai>
        varianceOutlet1Value: <nilai>
        varianceOutlet2: <nilai>
        varianceOutlet2Value: <nilai>
        varianceOutlet3: <nilai>
        varianceOutlet3Value: <nilai>
        varianceOutlet4: <nilai>
        varianceOutlet4Value: <nilai>

        // Page 16: Customer Analysis
        topCustomerNames: <nilai>
        newCustomerCount: <nilai>
        newCustomerAvgSpend: <nilai>
        highSpenderCount: <nilai>
        highSpenderAvgSpend: <nilai>
        loyalCustomerCount: <nilai>
        loyalCustomerAvgSpend: <nilai>
        newestMember1: <nilai>
        newestMember2: <nilai>
        newestMember3: <nilai>
        newestMember4: <nilai>
        newestMember5: <nilai>
        newestMember6: <nilai>
        newestMember7: <nilai>
        newestMember8: <nilai>
        newestMember9: <nilai>
        newestMember10: <nilai>

        // Page 17: Branch Analysis
        branchName: <nilai>
        totalOmzetFormatted: <nilai>
        omzetUpOrDown: <nilai>
        omzetPercentage: <nilai>
        omzetPlusOrMinus: <nilai>
        omzetDifference: <nilai>
        trafficCountFormatted: <nilai>
        trafficUpOrDown: <nilai>
        trafficPercentage: <nilai>
        trafficPlusOrMinus: <nilai>
        trafficDifference: <nilai>
        avgSaleFormatted: <nilai>
        avgSaleUpOrDown: <nilai>
        avgSalePercentage: <nilai>
        avgSalePlusOrMinus: <nilai>
        avgSaleDifference: <nilai>
        branchNameForChart: <nilai>
        highlightBranchName1: <nilai>
        peakSaleDate1: <nilai>
        peakSaleDate2: <nilai>
        peakTrafficDate: <nilai>
        peakTrafficCount: <nilai>
        lowestTrafficDate: <nilai>
        highlightBranchName2: <nilai>

        // Page 18: YoY Table
        salesCurrent: <nilai>
        sales30Day: <nilai>
        salesYoY: <nilai>
        checkCurrent: <nilai>
        check30Day: <nilai>
        check30DayPercentage: <nilai>
        check30DayDiff: <nilai>
        checkYoY: <nilai>
        checkYoYPercentage: <nilai>
        checkYoYDiff: <nilai>
        trafficCurrent: <nilai>
        traffic30Day: <nilai>
        trafficYoY: <nilai>
        tipToolName: <nilai>

        // Page 19: Peak Hours
        peakHour1Start: <nilai>
        peakHour1End: <nilai>
        popularMenu1: <nilai>
        popularMenu2: <nilai>
        popularMenu3: <nilai>
        popularMenu4: <nilai>
        avgCheckPeak1Min: <nilai>
        avgCheckPeak1Max: <nilai>

        // Page 20: More Peak Hours
        peakHour2Start: <nilai>
        peakHour2End: <nilai>
        popularMenuDinner1: <nilai>
        popularMenuDinner2: <nilai>
        popularMenuDinner3: <nilai>
        popularMenuDinner4: <nilai>
        avgSpendingPeak1Min: <nilai>
        avgSpendingPeak1Max: <nilai>
        apcBreakfast: <nilai>
        popularMenuBreakfast: <nilai>
        apcPostLunch: <nilai>
        popularMenuPostLunch: <nilai>
        tipToolName2: <nilai>

        // Page 22: Peak Day
        avgCheckPeakDayMin: <nilai>
        avgCheckPeakDayMax: <nilai>
        apcWeekdayBreakfast: <nilai>
        popularMenuWeekdayBreakfast: <nilai>

        // Page 24: More Tips
        tipToolName3: <nilai>

        // Page 26: WhatsApp Number
        whatsappNumber: <nilai>
    `),
}
