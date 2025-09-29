import { createChart } from '../../../helpers'
import { shortenCurrency } from '../../../utils/chart-formatters'
import { AlsoStoreFn, maybeAlsoStore } from '../../../utils/store-helpers'
import { formatCurrencyUtil, formatNumberUtil } from '../../../utils/string-formatters'
import { deepmerge } from 'deepmerge-ts'

export function generateCabangBusinessYieldComparisonChart(dataA: any, dataB: any, config?: { alsoStore?: AlsoStoreFn }) {
  const allMonths = [...new Set([...dataA.monthlyProfits.map((p: any) => p.period), ...dataB.monthlyProfits.map((p: any) => p.period)])].sort()
  const profitMapA = new Map<string, number>(dataA.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]))
  const profitMapB = new Map<string, number>(dataB.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]))

  const yieldDataA = allMonths.map((month) => {
    const profit = Number(profitMapA.get(month)) || 0
    const denom = Number(dataA.investment.investmentAmount) || 0
    return denom > 0 ? (profit / denom) * 100 : 0
  })
  const yieldDataB = allMonths.map((month) => {
    const profit = Number(profitMapB.get(month)) || 0
    const denom = Number(dataB.investment.investmentAmount) || 0
    return denom > 0 ? (profit / denom) * 100 : 0
  })

  const chartLabels = allMonths.map((m: string) => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }))
  maybeAlsoStore(
    config?.alsoStore,
    { yieldDataA, yieldDataB, allMonths },
    (data) => ({
      businessYieldAnalysis: {
        branchComparison: `${dataA.investment.branchName} vs ${dataB.investment.branchName}`,
        investmentAmounts: {
          [dataA.investment.branchName]: formatCurrencyUtil(dataA.investment.investmentAmount),
          [dataB.investment.branchName]: formatCurrencyUtil(dataB.investment.investmentAmount),
        },
        averageYields: {
          [dataA.investment.branchName]: `${(data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length || 0).toFixed(2)}%`,
          [dataB.investment.branchName]: `${(data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length || 0).toFixed(2)}%`,
        },
        bestPerformingMonths: deepmerge(
          ...data.allMonths.slice(-3).map((month, index) => {
            const realIndex = data.allMonths.length - 3 + index
            if (realIndex >= 0) {
              return {
                [month]: {
                  [dataA.investment.branchName]: `${(data.yieldDataA[realIndex] || 0).toFixed(2)}%`,
                  [dataB.investment.branchName]: `${(data.yieldDataB[realIndex] || 0).toFixed(2)}%`,
                },
              }
            }
            return {}
          }),
        ),
        betterPerformer:
          data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length
          > data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length
            ? dataA.investment.branchName
            : dataB.investment.branchName,
      },
    }),
  )

  createChart(
    'cabang-business-yield-chart',
    'bar',
    {
      labels: chartLabels,
      datasets: [
        { label: `Yield ${dataA.investment.branchName} (%)`, data: yieldDataA, backgroundColor: '#4F46E5' },
        { label: `Yield ${dataB.investment.branchName} (%)`, data: yieldDataB, backgroundColor: '#10B981' },
      ],
    },
    { scales: { y: { title: { display: true, text: 'Business Yield (%)' }, ticks: { callback: (v: any) => `${Number(v).toFixed(2)}%` } } } },
  )
}

export function generateCabangInvestorYieldComparisonChart(dataA: any, dataB: any, config?: { alsoStore?: AlsoStoreFn }) {
  const investmentPerSlotA = Number(dataA.investment.investmentSlots) > 0 ? Number(dataA.investment.investmentAmount) / Number(dataA.investment.investmentSlots) : 0
  const investmentPerSlotB = Number(dataB.investment.investmentSlots) > 0 ? Number(dataB.investment.investmentAmount) / Number(dataB.investment.investmentSlots) : 0
  const allMonths = [...new Set([...dataA.monthlyProfits.map((p: any) => p.period), ...dataB.monthlyProfits.map((p: any) => p.period)])].sort()
  const profitMapA = new Map(dataA.monthlyProfits.map((p: any) => [p.period, p.profit]))
  const profitMapB = new Map(dataB.monthlyProfits.map((p: any) => [p.period, p.profit]))

  const yieldDataA = allMonths.map((month) => {
    const profit = Number(profitMapA.get(month)) || 0
    return investmentPerSlotA > 0 ? (profit / investmentPerSlotA) * 100 : 0
  })
  const yieldDataB = allMonths.map((month) => {
    const profit = Number(profitMapB.get(month)) || 0
    return investmentPerSlotB > 0 ? (profit / investmentPerSlotB) * 100 : 0
  })

  const chartLabels = allMonths.map((m: string) => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }))
  maybeAlsoStore(
    config?.alsoStore,
    { yieldDataA, yieldDataB, investmentPerSlotA, investmentPerSlotB, allMonths },
    (data) => ({
      investorYieldAnalysis: {
        branchComparison: `${dataA.investment.branchName} vs ${dataB.investment.branchName}`,
        investmentDetails: {
          [dataA.investment.branchName]: {
            totalInvestment: formatCurrencyUtil(dataA.investment.investmentAmount),
            slots: formatNumberUtil(dataA.investment.investmentSlots),
            perSlot: formatCurrencyUtil(data.investmentPerSlotA),
          },
          [dataB.investment.branchName]: {
            totalInvestment: formatCurrencyUtil(dataB.investment.investmentAmount),
            slots: formatNumberUtil(dataB.investment.investmentSlots),
            perSlot: formatCurrencyUtil(data.investmentPerSlotB),
          },
        },
        averageYieldPerSlot: {
          [dataA.investment.branchName]: `${(data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length || 0).toFixed(2)}%`,
          [dataB.investment.branchName]: `${(data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length || 0).toFixed(2)}%`,
        },
        recentPerformance: deepmerge(
          ...data.allMonths.slice(-3).map((month, index) => {
            const realIndex = data.allMonths.length - 3 + index
            if (realIndex >= 0) {
              return {
                [month]: {
                  [dataA.investment.branchName]: `${(data.yieldDataA[realIndex] || 0).toFixed(2)}%`,
                  [dataB.investment.branchName]: `${(data.yieldDataB[realIndex] || 0).toFixed(2)}%`,
                },
              }
            }
            return {}
          }),
        ),
        betterInvestorYield:
          data.yieldDataA.reduce((sum, val) => sum + val, 0) / data.yieldDataA.length
          > data.yieldDataB.reduce((sum, val) => sum + val, 0) / data.yieldDataB.length
            ? dataA.investment.branchName
            : dataB.investment.branchName,
      },
    }),
  )

  createChart(
    'cabang-investor-yield-chart',
    'bar',
    {
      labels: chartLabels,
      datasets: [
        { label: `Yield ${dataA.investment.branchName} (%)`, data: yieldDataA, backgroundColor: '#4F46E5' },
        { label: `Yield ${dataB.investment.branchName} (%)`, data: yieldDataB, backgroundColor: '#10B981' },
      ],
    },
    { scales: { y: { title: { display: true, text: 'Investor Yield per Slot (%)' }, ticks: { callback: (v: any) => `${Number(v).toFixed(2)}%` } } } },
  )
}

export function generateBranchCumulativeComparisonChart(dataA: any, dataB: any, startPeriod: string, endPeriod: string, config?: { alsoStore?: AlsoStoreFn }) {
  const allMonths: string[] = []
  const currentDate = new Date(startPeriod + '-02')
  const lastDate = new Date(endPeriod + '-02')
  while (currentDate <= lastDate) {
    allMonths.push(currentDate.toISOString().slice(0, 7))
    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  const profitMapA = new Map<string, number>(dataA.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]))
  const profitMapB = new Map<string, number>(dataB.monthlyProfits.map((p: any) => [p.period as string, Number(p.profit) || 0]))

  const calculateCumulative = (profitMap: Map<string, number>, investmentData: any) => {
    let cumulativeShare = 0
    return allMonths.map((month) => {
      const profit = profitMap.get(month) || 0
      const monthlyShare = profit * (investmentData.investorSharePercentage / 100)
      cumulativeShare += monthlyShare
      return cumulativeShare
    })
  }

  const cumulativeDataA = calculateCumulative(profitMapA, dataA.investment)
  const cumulativeDataB = calculateCumulative(profitMapB, dataB.investment)
  const chartLabels = allMonths.map((m: string) => new Date(m + '-02').toLocaleString('default', { month: 'short', year: 'numeric' }))

  maybeAlsoStore(
    config?.alsoStore,
    { cumulativeDataA, cumulativeDataB, chartLabels, allMonths },
    (data) => ({
      cumulativeAnalysis: {
        periodRange: `${startPeriod} to ${endPeriod}`,
        branchComparison: `${dataA.investment.branchName} vs ${dataB.investment.branchName}`,
        finalCumulativeValues: {
          [dataA.investment.branchName]: formatCurrencyUtil(data.cumulativeDataA[data.cumulativeDataA.length - 1] || 0),
          [dataB.investment.branchName]: formatCurrencyUtil(data.cumulativeDataB[data.cumulativeDataB.length - 1] || 0),
        },
        monthlyBreakdown: deepmerge(
          ...data.allMonths.slice(-6).map((month, index) => {
            const realIndex = data.allMonths.length - 6 + index
            if (realIndex >= 0) {
              return {
                [month]: {
                  [dataA.investment.branchName]: formatCurrencyUtil(data.cumulativeDataA[realIndex] || 0),
                  [dataB.investment.branchName]: formatCurrencyUtil(data.cumulativeDataB[realIndex] || 0),
                },
              }
            }
            return {}
          }),
        ),
        winner:
          (data.cumulativeDataA[data.cumulativeDataA.length - 1] || 0)
          > (data.cumulativeDataB[data.cumulativeDataB.length - 1] || 0)
            ? dataA.investment.branchName
            : dataB.investment.branchName,
      },
    }),
  )

  createChart(
    'branch-cumulative-chart',
    'line',
    {
      labels: chartLabels,
      datasets: [
        { label: `Akumulasi ${dataA.investment.branchName}`, data: cumulativeDataA, borderColor: '#4F46E5', backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.1 },
        { label: `Akumulasi ${dataB.investment.branchName}`, data: cumulativeDataB, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.1 },
      ],
    },
    { scales: { y: { beginAtZero: true, title: { display: true, text: 'Total Akumulasi (Rp)' }, ticks: { callback: (v: string | number) => shortenCurrency(Number(v)) } } } },
  )
}
