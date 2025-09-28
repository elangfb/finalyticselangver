// Contains all logic for the "Analisis General > Aspek Penjualan" section.

import * as $store from '@/store';
import { db } from '@/core/firebase';
import { currentUser } from '@/core/state';
import { doc, getDoc } from 'firebase/firestore';
import { createChart, destroyCharts } from '../../helpers';
import { chartTooltip, chartXTicks, chartYTicks, currencyTooltipCallback, mergeChartOptions, shortenCurrency, shortenDateTickCallback, shortenNumber } from '../../utils/chart-formatters';
import { AlsoStoreFn, createAlsoStoreFn } from '../../utils/store-helpers';
import { formatCurrencyUtil, formatDecimalBasedPercentage, formatMachineYearMonthDay, formatNumberUtil } from '../../utils/string-formatters';
import { deepmerge } from 'deepmerge-ts';

/**
 * A local helper to calculate and display growth percentages in the KPI cards.
 */
function calculateAndDisplayGrowth(elementId: string, currentValue: number, previousValue: number, config?: { alsoStore?: AlsoStoreFn }): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (previousValue === 0) {
    element.textContent = 'vs N/A';
    element.className = 'text-sm mt-1 font-medium text-gray-500';
    return;
  }

  const growth = ((currentValue - previousValue) / previousValue) * 100;
  const sign = growth >= 0 ? '+' : '';
  const colorClass = growth >= 0 ? 'text-green-600' : 'text-red-600';

  config?.alsoStore?.(growth / 100, (v) => ({ [`${elementId}_growth`]: formatDecimalBasedPercentage(v) }));

  element.textContent = `${sign}${growth.toFixed(1)}% vs comparison period`;
  element.className = `text-sm mt-1 font-medium ${colorClass}`;
}

/**
 * Generates the main KPI cards for the General Sales section.
 */
function generateRingkasanFromSummaries(currentSummaries: any[], lastPeriodSummaries: any[], ids: { omzet: string, check: string, avgCheck: string, omzetGrowth: string, checkGrowth: string, avgCheckGrowth: string }, config?: { alsoStore?: AlsoStoreFn }) {
    const adjustFontSize = (elementId: string, text: string) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.textContent = text;
        if (text.length > 12) {
            element.classList.remove('text-4xl');
            element.classList.add('text-2xl');
        } else {
            element.classList.remove('text-2xl');
            element.classList.add('text-4xl');
        }
    };

    const calculateTotals = (summaries: any[]) => summaries.reduce((acc, summary) => {
        acc.omzet += summary.totalOmzet || 0;
        acc.checks += summary.totalTransactions || 0;
        return acc;
    }, { omzet: 0, checks: 0 });

    const currentTotals = calculateTotals(currentSummaries);
    const currentAvgCheck = currentTotals.checks > 0 ? currentTotals.omzet / currentTotals.checks : 0;

    adjustFontSize(ids.omzet, `Rp${currentTotals.omzet.toLocaleString('id-ID')}`);
    config?.alsoStore?.(currentTotals.omzet, (v) => ({ omzet: formatCurrencyUtil(v) }));
    adjustFontSize(ids.check, currentTotals.checks.toLocaleString('id-ID'));
    config?.alsoStore?.(currentTotals.checks, (v) => ({ totalCheck: formatNumberUtil(v) }));
    adjustFontSize(ids.avgCheck, `Rp${currentAvgCheck.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`);
    config?.alsoStore?.(currentAvgCheck, (v) => ({ avgPerCheck: formatCurrencyUtil(v) }));

    if (lastPeriodSummaries && lastPeriodSummaries.length > 0) {
        const lastPeriodTotals = calculateTotals(lastPeriodSummaries);
        const lastPeriodAvgCheck = lastPeriodTotals.checks > 0 ? lastPeriodTotals.omzet / lastPeriodTotals.checks : 0;

        config?.alsoStore?.(lastPeriodTotals.omzet, (v) => ({ lastPeriodOmzet: formatCurrencyUtil(v) }))
        config?.alsoStore?.(lastPeriodTotals.checks, (v) => ({ lastPeriodCheck: formatNumberUtil(v) }))
        config?.alsoStore?.(lastPeriodAvgCheck, (v) => ({ lastPeriodAvgPerCheck: formatCurrencyUtil(v) }))

        calculateAndDisplayGrowth(ids.omzetGrowth, currentTotals.omzet, lastPeriodTotals.omzet, config);
        calculateAndDisplayGrowth(ids.checkGrowth, currentTotals.checks, lastPeriodTotals.checks, config);
        calculateAndDisplayGrowth(ids.avgCheckGrowth, currentAvgCheck, lastPeriodAvgCheck, config);
    } else {
        document.getElementById(ids.omzetGrowth)!.textContent = '';
        document.getElementById(ids.checkGrowth)!.textContent = '';
        document.getElementById(ids.avgCheckGrowth)!.textContent = '';
    }
}

function generateOmzetHarianChartFromSummaries(summaries: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    // This uses .toSorted() which is great because it doesn't mutate the original array.
    const sortedSummaries = summaries.toSorted((a, b) => a.date.getTime() - b.date.getTime());
    const labels = sortedSummaries.map(s => s.date.toISOString().split('T')[0]);
    const data = sortedSummaries.map(s => s.totalOmzet);

    // --- START: New code to calculate the average ---
    const totalOmzet = data.reduce((sum, value) => sum + value, 0);
    const averageOmzet = sortedSummaries.length > 0 ? totalOmzet / sortedSummaries.length : 0;
    // --- END: New code to calculate the average ---

    const datasets = [{
        label: 'Total Omzet Harian',
        data: maybeAlsoStore(
          config?.alsoStore,
          data,
          (v) => ({
            omzetHarian: deepmerge(...v.map((v, index) => ({
              [`Day ${index + 1}`]: formatCurrencyUtil(v) }),
            )),
          }),
        ),
        borderColor: '#3B82F6',
        tension: 0.1,
        type: 'line'
    }];

    // This part for the Target line remains unchanged.
    const salesTarget = $store.getConfigValue('activeSalesTarget') || {};
    if (salesTarget && salesTarget['Omzet Harian']) {
        datasets.push({
            label: 'Target Omzet Harian',
            data: Array(labels.length).fill(maybeAlsoStore(
              config?.alsoStore,
              salesTarget['Omzet Harian'],
              (v) => ({ targetOmzetHarian: formatCurrencyUtil(v) }),
            )),
            borderColor: '#FFDE21',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            type: 'line'
        });
    }

    // --- START: New code to add the average line to the chart ---
    if (averageOmzet > 0) {
        datasets.push({
            label: 'Average Omzet',
            data: Array(labels.length).fill(maybeAlsoStore(
              config?.alsoStore,
              averageOmzet,
              (v) => ({ avgOmzet: formatCurrencyUtil(v) }),
            )),
            borderColor: '#10B981', // Green for the average line
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            type: 'line'
        });
    }
    // --- END: New code to add the average line ---

    createChart(canvasId, 'line', {
        labels: labels,
        datasets: datasets, // This now contains all three datasets
    }, mergeChartOptions(
      chartTooltip({ label: currencyTooltipCallback }),
      chartYTicks(shortenCurrency),
      chartXTicks(shortenDateTickCallback),
    ));
}

function generateOmzetMingguanChartFromSummaries(summaries: any[], canvasId: string, type: 'line' | 'bar' = 'bar', config?: { alsoStore?: AlsoStoreFn }) {
    const weeklyOmzet = summaries.reduce((acc, summary) => {
        const d = summary.date;
        const firstDayOfWeek = new Date(d);
        firstDayOfWeek.setDate(d.getDate() - d.getDay());
        const weekLabel = firstDayOfWeek.toISOString().split('T')[0];
        acc[weekLabel] = (acc[weekLabel] || 0) + summary.totalOmzet;
        return acc;
    }, {});

    const sortedWeeks = Object.keys(weeklyOmzet).toSorted();

    const datasets = [{
        label: 'Total Omzet Mingguan',
        data: maybeAlsoStore(
          config?.alsoStore,
          sortedWeeks.map((week) => weeklyOmzet[week]),
          (v) => ({
            omzetMingguan: deepmerge(...v.map((v, index) => ({
              [`Week ${index + 1}`]: formatCurrencyUtil(v),
            }))),
          }),
        ),
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    }];

    const salesTarget = $store.getConfigValue('activeSalesTarget') || {};
    if (salesTarget && salesTarget['Omzet Mingguan']) {
        datasets.push({
            type: 'line',
            label: 'Target Omzet Mingguan',
            data: Array(sortedWeeks.length).fill(maybeAlsoStore(
              config?.alsoStore,
              salesTarget['Omzet Mingguan'],
              (v) => ({ targetOmzetMingguan: formatCurrencyUtil(v) }),
            )),
            borderColor: '#EF4444',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            fill: false
        });
    }

    // FIX: The chart type is now explicitly set to 'bar' in this call.
    createChart(canvasId, 'bar', {
        labels: sortedWeeks,
        datasets: datasets,
    }, mergeChartOptions(
        chartYTicks(shortenCurrency),
        chartXTicks(shortenDateTickCallback),
        chartTooltip({ label: currencyTooltipCallback })
    ));
}

function generateTcApcHarianChartFromSummaries(summaries: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const sortedSummaries = summaries.toSorted((a, b) => a.date.getTime() - b.date.getTime());
    const labels = sortedSummaries.map(s => s.date.toISOString().split('T')[0]);
    const tcData = sortedSummaries.map(s => s.totalTransactions);
    const apcData = sortedSummaries.map(s => s.apc);

    // --- FIX START: Add target lines for both TC and APC ---
    const datasets = [
        {
            type: 'bar',
            label: 'Total Check (TC)',
            data: maybeAlsoStore(
              config?.alsoStore,
              tcData,
              (v) => ({
                totalCheckHarian: deepmerge(...v.map((v, index) => ({
                  [`Day ${index + 1}`]: formatNumberUtil(v),
                }))),
              })),
            backgroundColor: '#60A5FA',
            yAxisID: 'y-tc',
            order: 2

        },
        {
            type: 'line',
            label: 'Average Check (APC)',
            data: maybeAlsoStore(
              config?.alsoStore,
              apcData,
              (v) => ({
                avgPerCheckHarian: deepmerge(...v.map((v, index) => ({
                  [`Day ${index + 1}`]: formatNumberUtil(v),
                }))),
              })),
            borderColor: '#F97316',
            tension: 0.1,
            yAxisID: 'y-apc',
            order: 1
        },
    ];

    // Add Target Line for "Total Transaksi Per Hari" (TC)
    const salesTarget = $store.getConfigValue('activeSalesTarget') || {};
    if (salesTarget && salesTarget['Total Transaksi Per Hari']) {
      config?.alsoStore?.(salesTarget['Total Transaksi Per Hari'], (v) => ({ targetTotalCheckHarian: formatNumberUtil(v) }))
        datasets.push({
            type: 'line',
            label: 'Target TC Harian',
            data: Array(labels.length).fill(salesTarget['Total Transaksi Per Hari']),
            borderColor: '#3B82F6', // A darker blue for TC target
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y-tc', // Ensure it uses the left axis
        });
    }

    // Add Target Line for "Average Check" (APC)
    if (salesTarget && salesTarget['Average Check']) {
      config?.alsoStore?.(salesTarget['Average Check'], (v) => ({ targetAvgPerCheckHarian: formatCurrencyUtil(v) }))
        datasets.push({
            type: 'line',
            label: 'Target Average Check',
            data: Array(labels.length).fill(salesTarget['Average Check']),
            borderColor: '#EF4444', // Red for APC target
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y-apc', // Ensure it uses the right axis
        });
    }
    // --- FIX END ---

    createChart(canvasId, 'bar', {
        labels: labels,
        datasets: datasets, // Use the new datasets array
    }, mergeChartOptions(
        {
            scales: {
                'y-tc': { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Total Check' }, ticks: { callback: shortenNumber } },
                'y-apc': { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Average Check (Rp)' }, grid: { drawOnChartArea: false }, ticks: { callback: shortenCurrency } },
            }
        },
        chartXTicks(shortenDateTickCallback),
        chartTooltip({
            label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                if (context.dataset.yAxisID === 'y-apc') {
                    return `${label}: ${formatCurrency(value)}`;
                }
                return `${label}: ${formatNumber(value)}`;
            }
        })
    ));
}

function generateDailyOmzetHeatmapFromSummaries(summaries: any[], containerId: string = 'daily-omzet-heatmap-container', config?: { alsoStore?: AlsoStoreFn }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  // --- FIX START: Handle empty data and derive dates from the passed summaries ---
  if (summaries.length === 0) {
    container.innerHTML = '<p class="text-gray-500">No data to display for the selected period.</p>';
    return;
  }

  const dailyTotals = Object.fromEntries(summaries.map(s => [s.date.toISOString().split('T')[0], s.totalOmzet]));
  $store.setChartDataForAIProperty('dailyOmzetHeatmap', dailyTotals);

  const maxOmzet = Math.max(...summaries.map(s => s.totalOmzet));

  // Determine the start and end date from the filtered data, NOT from the DOM
  const startDate = summaries.reduce((min, s) => s.date < min ? s.date : min, summaries[0].date);
  const endDate = summaries.reduce((max, s) => s.date > max ? s.date : max, summaries[0].date);
  // --- FIX END ---

  let currentMonth = -1;
  let calendarHTML = '';
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // The rest of the function works correctly with the new startDate and endDate
  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const month = d.getUTCMonth();
    if (month !== currentMonth) {
      if (currentMonth !== -1) {
        calendarHTML += '</tr></tbody></table></div>';
      }
      currentMonth = month;
      calendarHTML += `<div class="mb-4"><h4 class="text-lg font-semibold text-center mb-2">${monthNames[month]} ${d.getUTCFullYear()}</h4><table class="heatmap-calendar-table"><thead><tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr></thead><tbody><tr>`;
      const firstDayOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      for (let i = 0; i < firstDayOfMonth.getUTCDay(); i++) calendarHTML += '<td></td>';
    }

    if (d.getUTCDay() === 0 && d.getUTCDate() !== 1) {
      calendarHTML += '</tr><tr>';
    }

    const dateStr = d.toISOString().split('T')[0];
    const omzet = dailyTotals[dateStr] || 0;
    const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0;
    const color = `rgba(79, 70, 229, ${opacity})`;
    const title = `${dateStr}: Rp${omzet.toLocaleString('id-ID')}`;
    const textColor = opacity > 0.5 ? 'white' : '#374151';
    calendarHTML += `<td style="background-color: ${color}" title="${title}"><div class="day-number" style="color: ${textColor}">${d.getUTCDate()}</div></td>`;
    config?.alsoStore?.(omzet, (v) => ({ dailyOmzet: { [dateStr!]: formatCurrencyUtil(v) } }));
  }
  calendarHTML += '</tr></tbody></table></div>';

  container.innerHTML = calendarHTML;
}

function generateOmzetHeatmapFromSummaries(summaries: any[], containerId: string, config?: { alsoStore?: AlsoStoreFn }) {
    const container = document.getElementById(containerId);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const heatmapData = Array(7).fill(0).map(() => Array(24).fill(0));
    let maxOmzet = 0;

    summaries.forEach(summary => {
        if (summary.hourlyRevenue && summary.hourlyRevenue.length === 24) {
            const dayIndex = summary.date.getDay();
            summary.hourlyRevenue.forEach((revenue, hourIndex) => {
                heatmapData[dayIndex][hourIndex] += revenue;
                if (heatmapData[dayIndex][hourIndex] > maxOmzet) {
                    maxOmzet = heatmapData[dayIndex][hourIndex];
                }
            });
        }
    });

    $store.setChartDataForAIProperty('omzetJamHariHeatmap', heatmapData);

    let tableHTML = '<table class="heatmap-table"><thead><tr><th></th>';
    hours.forEach(hour => tableHTML += `<th>${hour.toString().padStart(2, '0')}</th>`);
    tableHTML += '</tr></thead><tbody>';
    days.forEach((day, dayIndex) => {
        tableHTML += `<tr><td class="day-label">${day}</td>`;
        hours.forEach(hour => {
            const omzet = heatmapData[dayIndex][hour];
            const opacity = maxOmzet > 0 ? (omzet / maxOmzet) : 0;
            const color = `rgba(79, 70, 229, ${opacity})`;
            const title = `Rp${omzet.toLocaleString('id-ID')}`;
            tableHTML += `<td class="heatmap-cell" style="background-color: ${color}" title="${title}"></td>`;
            config?.alsoStore?.(omzet, (v) => ({
              hourlyOmzet: { [`${day} at ${hour}:00 to ${hour}:59`]: formatCurrencyUtil(v) },
            }));
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';

    container.innerHTML = tableHTML;
}

function generateSalesTrendHourlyDailyChartFromSummaries(summaries: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) {

    const dailyData = Array(7).fill(0).map(() => Array(24).fill(0));

    summaries.forEach(s => {
        if (s.hourlyRevenue && s.hourlyRevenue.length === 24) {
            const dayIndex = s.date.getDay(); // Sunday = 0, Monday = 1, etc.
            s.hourlyRevenue.forEach((rev, hourIndex) => {
                dailyData[dayIndex][hourIndex] += rev;
            });
        }
    });

    const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const colors = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#3B82F6'];

    const datasets = dayLabels.map((label, dayIndex) => ({
        label: label,
        data: maybeAlsoStore(config?.alsoStore, dailyData[dayIndex], (v) => ({
          salesTrendHourlyDaily: {
            [`Day ${label}`]: deepmerge({}, ...v!.map((val, hr) => ({
              [`Hour ${hr}:00 to ${hr}:59`]: formatCurrencyUtil(val),
            }))),
          },
        })),
        borderColor: colors[dayIndex % colors.length],
        backgroundColor: colors[dayIndex % colors.length],
        tension: 0.2,
        fill: false,
    }));

    $store.setChartDataForAIProperty('salesTrendHourlyDaily', datasets.map(ds => ({ [ds.label]: ds.data })));

    // --- FIX: Use the 'canvasId' parameter instead of a hardcoded string ---
    createChart(canvasId, 'line', { labels, datasets }, mergeChartOptions(
        chartYTicks(shortenCurrency),
        chartTooltip({ label: currencyTooltipCallback })
    ));
}

/**
 * Main orchestrator function for generating all charts in the General Sales section.
 */
async function generateGeneralSales() {
    const branchSelect = document.getElementById('general-penjualan-branch-select') as HTMLSelectElement;
    const startDateInput = document.getElementById('general-penjualan-start-date') as HTMLInputElement;
    const endDateInput = document.getElementById('general-penjualan-end-date') as HTMLInputElement;

    const selectedBranch = branchSelect.value;
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);
    endDate.setHours(23, 59, 59, 999);

    if (!selectedBranch || !startDateInput.value || !endDateInput.value) {
        destroyCharts();
        return;
    }

    $store.setConfigValue('activeSalesTarget', {}); // Reset before fetching
    if (selectedBranch && selectedBranch !== 'ALL' && currentUser) {
        const period = endDate.toISOString().slice(0, 7);
        const safeBranchName = selectedBranch.replace(/\s+/g, '_');
        const targetDocId = `${period}_${safeBranchName}`;
        try {
            const targetDocRef = doc(db, `users/${currentUser.uid}/monthlySalesTargets`, targetDocId);
            const targetDocSnap = await getDoc(targetDocRef);
            if (targetDocSnap.exists()) {
                $store.setConfigValue('activeSalesTarget', targetDocSnap.data().targets || {});
            }
        } catch (error) {
            console.error("Could not fetch sales target for the period:", error);
        }
    }

    let currentData = $store.getAllSalesData().filter(s => s.date >= startDate && s.date <= endDate);
    if (selectedBranch !== 'ALL') {
        currentData = currentData.filter(s => s.branches.includes(selectedBranch));
    }

    $store.clearViewData('general-penjualan');
    $store.setActiveViewData('general-penjualan', {
        viewContext: {
            selectedBranch,
            dateRange: `${formatMachineYearMonthDay(startDate)} to ${formatMachineYearMonthDay(endDate)}`,
            hasSalesTarget: Object.keys($store.getConfigValue('activeSalesTarget')).length > 0,
        }
    }, { selectedBranch, startDate, endDate });

    const alsoStore = createAlsoStoreFn($store, 'general-penjualan');

    generateRingkasanFromSummaries(currentData, [], {
        omzet: 'general-total-omzet', check: 'general-total-check', avgCheck: 'general-avg-check',
        omzetGrowth: 'general-omzet-growth', checkGrowth: 'general-check-growth', avgCheckGrowth: 'general-avg-check-growth',
    }, { alsoStore });

    generateOmzetHarianChartFromSummaries(currentData, 'general-omzet-harian-chart', { alsoStore });
    generateOmzetMingguanChartFromSummaries(currentData, 'general-omzet-mingguan-chart', 'line', { alsoStore });
    generateTcApcHarianChartFromSummaries(currentData, 'general-tc-apc-chart', { alsoStore });
    generateDailyOmzetHeatmapFromSummaries(currentData, 'general-heatmap-harian-container');
    generateOmzetHeatmapFromSummaries(currentData, 'general-heatmap-jam-hari-container');
    generateSalesTrendHourlyDailyChartFromSummaries(currentData, 'general-sales-trend-chart', { alsoStore });
}

/**
 * Sets up the filters (Branch and Date Range) for the General Sales section.
 */
export async function setupGeneralSales() {
    if ($store.getInitFlag('generalPenjualanSelectorInitialized')) return;

    const branchSelect = document.getElementById('general-penjualan-branch-select') as HTMLSelectElement;
    const applyBtn = document.getElementById('general-penjualan-apply-btn');
    const startDateInput = document.getElementById('general-penjualan-start-date') as HTMLInputElement;
    const endDateInput = document.getElementById('general-penjualan-end-date') as HTMLInputElement;
    if(!branchSelect || !applyBtn || !startDateInput || !endDateInput) return;

    const branches = [...new Set($store.getAllSalesData().flatMap(s => s.branches))].sort();
    branchSelect.innerHTML = `<option value="ALL">All Branches</option>` + branches.map(b => `<option value="${b}">${b}</option>`).join('');

    if ($store.getAllSalesData().length > 0) {
        const allDates = $store.getAllSalesData().map(s => s.date);
        const lastDate = new Date(Math.max.apply(null, allDates.map(d => d.getTime())));
        const firstDate = new Date(lastDate);
        firstDate.setDate(lastDate.getDate() - 29);
        endDateInput.value = lastDate.toISOString().split('T')[0]!;
        startDateInput.value = firstDate.toISOString().split('T')[0]!;
    }

    applyBtn.addEventListener('click', generateGeneralSales);
    $store.setInitFlag('generalPenjualanSelectorInitialized', true);
    await generateGeneralSales();
}
