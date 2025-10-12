import { formatNumber, formatCurrency } from '@/utils/string'

// A helper function to generate both Top 10 tables
export function generateTop10MenuTable(summaries: any[], containerId: string, sortBy: 'quantity' | 'revenue') {
  const container = document.getElementById(containerId)
  if (!container) return

  const menuData = new Map<string, { quantity: number, revenue: number, category: string }>()

  // Aggregate data from all summaries
  summaries.forEach((summary) => {
    if (!summary.menuItemQuantities) return
    for (const category in summary.menuItemQuantities) {
      for (const itemName in summary.menuItemQuantities[category]) {
        const quantity = summary.menuItemQuantities[category][itemName]
        const price = summary.menuItemPrices?.[category]?.[itemName] || 0
        const revenue = quantity * price

        if (menuData.has(itemName)) {
          const existing = menuData.get(itemName)!
          existing.quantity += quantity
          existing.revenue += revenue
        } else {
          menuData.set(itemName, { quantity, revenue, category })
        }
      }
    }
  })

  // Convert map to array, sort, and take top 10
  const sortedData = Array.from(menuData.entries())
    .sort(([, a], [, b]) => b[sortBy] - a[sortBy])
    .slice(0, 10)

  if (sortedData.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No menu data available for this period.</p>'
    return
  }

  // Generate HTML table
  let tableHtml = `
        <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
                <thead class="text-left text-gray-500">
                    <tr>
                        <th class="p-2 font-medium">#</th>
                        <th class="p-2 font-medium">Menu Name</th>
                        <th class="p-2 font-medium">Category</th>
                        <th class="p-2 font-medium text-right">${sortBy === 'quantity' ? 'Quantity' : 'Revenue'}</th>
                    </tr>
                </thead>
                <tbody>`

  sortedData.forEach(([name, data], index) => {
    const value = sortBy === 'quantity' ? formatNumber(data.quantity) : formatCurrency(data.revenue)
    tableHtml += `
            <tr class="border-t">
                <td class="p-2">${index + 1}</td>
                <td class="p-2 font-medium text-gray-800">${name}</td>
                <td class="p-2 text-gray-600">${data.category}</td>
                <td class="p-2 text-right font-mono">${value}</td>
            </tr>`
  })

  tableHtml += `</tbody></table></div>`
  container.innerHTML = tableHtml
}

// Add this new function to src/analysis/premium/sales-tables.ts
export function generateTop10ComparisonTable(periodAData: any[], periodBData: any[], containerId: string, sortBy: 'quantity' | 'revenue') {
  const container = document.getElementById(containerId)
  if (!container) return

  const hasRevenueData = (periodAData.length > 0 && periodAData[0]?.menuItemRevenues) || (periodBData.length > 0 && periodBData[0]?.menuItemRevenues)

  // If we need to sort by revenue but don't have the data, show a specific message and exit.
  if (sortBy === 'revenue' && !hasRevenueData) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">Revenue data per menu item is not available in the summaries.</p>'
    return
  }

  const aggregateData = (summaries: any[]): Map<string, { quantity: number, revenue: number, category: string }> => {
    const menuData = new Map()
    summaries.forEach((summary) => {
      // Only require menuItemQuantities to proceed
      if (!summary.menuItemQuantities) return

      for (const category in summary.menuItemQuantities) {
        for (const itemName in summary.menuItemQuantities[category]) {
          const quantity = summary.menuItemQuantities[category][itemName]
          // Safely get revenue, defaulting to 0 if not available
          const revenue = summary.menuItemRevenues?.[category]?.[itemName] || 0

          if (menuData.has(itemName)) {
            const existing = menuData.get(itemName)!
            existing.quantity += quantity
            existing.revenue += revenue
          } else {
            menuData.set(itemName, { quantity, revenue, category })
          }
        }
      }
    })
    return menuData
  }

  const dataA = aggregateData(periodAData)
  const dataB = aggregateData(periodBData)

  const combinedKeys = new Set([...dataA.keys(), ...dataB.keys()])

  const combinedData = Array.from(combinedKeys).map((name) => {
    const itemA = dataA.get(name) || { quantity: 0, revenue: 0, category: '' }
    const itemB = dataB.get(name) || { quantity: 0, revenue: 0, category: '' }
    return {
      name,
      category: itemB.category || itemA.category,
      quantityA: itemA.quantity,
      revenueA: itemA.revenue,
      quantityB: itemB.quantity,
      revenueB: itemB.revenue,
    }
  })

  const top10Data = combinedData.sort((a, b) => b[sortBy === 'quantity' ? 'quantityB' : 'revenueB'] - a[sortBy === 'quantity' ? 'quantityB' : 'revenueB']).slice(0, 10)

  if (top10Data.length === 0 || (sortBy === 'quantity' && top10Data.every((item) => item.quantityB === 0 && item.quantityA === 0))) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No menu data available for this period.</p>'
    return
  }

  let tableHtml = `<div class="overflow-x-auto"><table class="min-w-full text-sm">
        <thead class="text-left text-gray-500"><tr>
            <th class="p-2 font-medium">Menu Name</th>
            <th class="p-2 font-medium text-right">Period A</th>
            <th class="p-2 font-medium text-right">Period B</th>
            <th class="p-2 font-medium text-right">Change</th>
        </tr></thead><tbody>`

  top10Data.forEach((item) => {
    const valueA = sortBy === 'quantity' ? item.quantityA : item.revenueA
    const valueB = sortBy === 'quantity' ? item.quantityB : item.revenueB
    const displayA = sortBy === 'quantity' ? formatNumber(valueA) : formatCurrency(valueA)
    const displayB = sortBy === 'quantity' ? formatNumber(valueB) : formatCurrency(valueB)

    let changeText = 'N/A'
    let changeColor = 'text-gray-500'
    if (valueA > 0) {
      const change = ((valueB - valueA) / valueA) * 100
      changeText = `${change > 0 ? '+' : ''}${change.toFixed(0)}%`
      if (change > 0) changeColor = 'text-green-600'
      if (change < 0) changeColor = 'text-red-600'
    } else if (valueB > 0) {
      changeText = 'New'
      changeColor = 'text-green-600'
    }

    tableHtml += `<tr class="border-t">
            <td class="p-2 font-medium text-gray-800">${item.name}</td>
            <td class="p-2 text-right font-mono">${displayA}</td>
            <td class="p-2 text-right font-mono">${displayB}</td>
            <td class="p-2 text-right font-mono font-semibold ${changeColor}">${changeText}</td>
        </tr>`
  })

  tableHtml += `</tbody></table></div>`
  container.innerHTML = tableHtml
}
