export function showPnlDataModal(data: any) {
  const modal = document.getElementById('pnl-data-modal')
  const titleEl = document.getElementById('pnl-data-modal-title')
  const bodyEl = document.getElementById('pnl-data-modal-body')

  if (!modal || !titleEl || !bodyEl) return

  const period = data.period
  const [year, month] = period.split('-')
  const formattedPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  titleEl.textContent = `P&L Statement for ${formattedPeriod}`

  const pnlData = data.pnlData || {}
  const formatCurrency = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`

  let totalRevenue = 0, totalHPP = 0, totalOpex = 0, totalNonOpex = 0
  let totalDepresiasi = 0, totalBunga = 0, totalPajak = 0

  const renderCategory = (categoryName: string) => {
    const categoryData = pnlData[categoryName] || {}
    const categoryTotal = Object.values(categoryData).reduce((sum, value) => (sum as number) + (value as number), 0) as number

    if (categoryName === 'Pendapatan (Revenue)') totalRevenue = categoryTotal
    if (categoryName === 'Harga Pokok Produksi') totalHPP = categoryTotal
    if (categoryName === 'Beban Operasional (OPEX)') totalOpex = categoryTotal
    if (categoryName === 'Beban Non Operasional') totalNonOpex = categoryTotal
    if (categoryName === 'Depresiasi/ Amortisasi') totalDepresiasi = categoryTotal
    if (categoryName === 'Bunga') totalBunga = categoryTotal
    if (categoryName === 'Pajak (PB1)') totalPajak = categoryTotal

    if (Object.keys(categoryData).length === 0) return ''

    const itemsHtml = Object.entries(categoryData).map(([name, value]) => `
      <div class="flex justify-between text-sm text-gray-600 pl-4">
        <span>${name}</span><span class="font-mono">${formatCurrency(value as number)}</span>
      </div>`).join('')

    return `
      <div class="mb-4">
        <h4 class="font-bold text-md text-gray-800">${categoryName}</h4>
        <div class="space-y-1 mt-2">${itemsHtml}</div>
        <div class="flex justify-between font-semibold pt-1 border-t mt-1">
          <span>Total ${categoryName}</span><span class="font-mono">${formatCurrency(categoryTotal)}</span>
        </div>
      </div>`
  }

  const renderSubtotal = (label: string, value: number, colorClass: string) => `
    <div class="flex justify-between font-bold text-lg py-2 my-2 ${colorClass} rounded-md px-4">
      <span>${label}</span><span class="font-mono">${formatCurrency(value)}</span>
    </div>`

  let finalHtml = ''
  finalHtml += renderCategory('Pendapatan (Revenue)')
  finalHtml += renderCategory('Harga Pokok Produksi')
  const grossProfit = totalRevenue - totalHPP
  finalHtml += renderSubtotal('Laba Kotor (Gross Profit)', grossProfit, 'bg-yellow-100 text-yellow-800')

  finalHtml += renderCategory('Beban Operasional (OPEX)')
  const netOperatingIncome = grossProfit - totalOpex
  finalHtml += renderSubtotal('Pendapatan Bersih Operasional', netOperatingIncome, 'bg-blue-100 text-blue-800')

  finalHtml += renderCategory('Beban Non Operasional')
  const ebitda = netOperatingIncome - totalNonOpex
  finalHtml += renderSubtotal('EBITDA', ebitda, 'bg-orange-100 text-orange-800')

  finalHtml += renderCategory('Depresiasi/ Amortisasi')
  finalHtml += renderCategory('Bunga')
  finalHtml += renderCategory('Pajak (PB1)')

  const netIncome = ebitda - totalDepresiasi - totalBunga - totalPajak
  finalHtml += renderSubtotal('Pendapatan Bersih (Net Income)', netIncome, 'bg-green-200 text-green-800')

  bodyEl.innerHTML = finalHtml
  modal.classList.remove('hidden')
}
