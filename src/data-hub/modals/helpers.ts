import * as $store from '@/store'

export function renderPnlResults(pnlData: any, container: HTMLElement) {
  $store.setCurrentPnlData(pnlData)
  container.innerHTML = ''
  const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`

  let totalRevenue = 0
  let totalHPP = 0
  let totalOpex = 0
  let totalNonOpex = 0
  let totalDepresiasi = 0
  let totalBunga = 0
  let totalPajak = 0

  const renderCategory = (categoryName: string) => {
    const data = pnlData[categoryName] || {}
    const categoryTotal = Object.values(data).reduce((sum, value) => (sum as number) + (value as number), 0) as number

    if (categoryName === 'Pendapatan (Revenue)') totalRevenue = categoryTotal
    if (categoryName === 'Harga Pokok Produksi') totalHPP = categoryTotal
    if (categoryName === 'Beban Operasional (OPEX)') totalOpex = categoryTotal
    if (categoryName === 'Beban Non Operasional') totalNonOpex = categoryTotal
    if (categoryName === 'Depresiasi/ Amortisasi') totalDepresiasi = categoryTotal
    if (categoryName === 'Bunga') totalBunga = categoryTotal
    if (categoryName === 'Pajak (PB1)') totalPajak = categoryTotal

    const itemsHtml = Object.entries(data).map(([name, value]) => `
      <div class="flex justify-between text-sm text-gray-600 pl-4">
        <span>${name}</span>
        <span class="font-mono">${formatCurrency(value as number)}</span>
      </div>
    `).join('')

    const totalHtml = Object.keys(data).length > 0 ? `
      <div class="flex justify-between font-semibold pt-1 border-t mt-1">
        <span>Total ${categoryName}</span>
        <span class="font-mono">${formatCurrency(categoryTotal)}</span>
      </div>
    ` : ''

    return `
      <div class="mb-4">
        <h4 class="font-bold text-md text-gray-800">${categoryName}</h4>
        <div class="space-y-1 mt-2">${itemsHtml}</div>
        ${totalHtml}
      </div>
    `
  }

  const renderSubtotal = (label: string, value: number, colorClass: string) => {
    return `
      <div class="flex justify-between font-bold text-lg py-2 my-2 ${colorClass} rounded-md px-4">
        <span>${label}</span>
        <span class="font-mono">${formatCurrency(value)}</span>
      </div>
    `
  }

  let finalHtml = ''

  finalHtml += renderCategory('Pendapatan (Revenue)')
  finalHtml += renderCategory('Harga Pokok Produksi')
  const grossProfit = totalRevenue - totalHPP
  finalHtml += renderSubtotal('Laba Kotor (Gross Profit)', grossProfit, 'bg-yellow-100')

  finalHtml += renderCategory('Beban Operasional (OPEX)')
  const netOperatingIncome = grossProfit - totalOpex
  finalHtml += renderSubtotal('Pendapatan Bersih Operasional (Net Operating Income)', netOperatingIncome, 'bg-blue-100')

  finalHtml += renderCategory('Beban Non Operasional')
  const ebitda = netOperatingIncome - totalNonOpex
  finalHtml += renderSubtotal('Pendapatan Bersih Sebelum Deprisiasi/Amortisasi, Bunga & Pajak (EBITDA)', ebitda, 'bg-orange-100')

  finalHtml += renderCategory('Depresiasi/ Amortisasi')
  finalHtml += renderCategory('Bunga')
  finalHtml += renderCategory('Pajak (PB1)')

  const netIncome = ebitda - totalDepresiasi - totalBunga - totalPajak
  finalHtml += renderSubtotal('Pendapatan Bersih (Net Income)', netIncome, 'bg-green-200')

  container.innerHTML = finalHtml
}
