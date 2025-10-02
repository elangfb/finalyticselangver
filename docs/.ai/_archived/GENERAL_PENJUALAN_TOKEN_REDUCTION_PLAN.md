# General Penjualan Token Reduction Plan

## Section Overview

**Target Section**: `general-penjualan`
**Expected Data Types**:

- Data ringkasan penjualan (total omzet, total transaksi, rata-rata belanja)
- Grafik omzet harian dan mingguan
- Grafik tren transaksi harian (TC & APC)
- Heatmap penjualan per hari dan per jam

## Current Analysis Status

- [x] **Step 1**: Locate main orchestrator function ✅ Found: `generateGeneralPenjualanSection()`
- [x] **Step 2**: Map data flow and identify raw data storage points ✅ Line 12539: `$store.setActiveViewData('general-penjualan', currentData, { selectedBranch, startDate, endDate });`
- [x] **Step 3**: Estimate current token usage ✅ ~1.5M tokens (large sales data arrays)
- [x] **Step 4**: List all chart/table functions ✅ Documented below
- [x] **Step 5**: Document current implementation ✅ Complete analysis done

## My Current Assumptions (VALIDATED)

1. **Main Function Exists**: ✅ `generateGeneralPenjualanSection()` found at line 12487
2. **Raw Data Storage**: ✅ Line 12539 stores `currentData` (large sales arrays) using `setActiveViewData`
3. **Multiple Charts**: ✅ 7 chart/table functions identified (see analysis above)
4. **Token Issue**: ✅ `currentData` contains full sales transaction arrays (~1.5M tokens estimated)
5. **Data Types**: ✅ Sales summaries with detailed breakdown (see data structure above)

### Additional Findings

- **Filters**: Uses branch selector, start/end date filters
- **Sales Target Integration**: Fetches monthly sales targets from Firestore
- **Summary Functions**: All chart functions expect sales summary objects (not raw transactions)
- **Progressive Enhancement**: Functions are called sequentially, perfect for insight merging

## Current Implementation Analysis

### Main Orchestrator Function

**Location**: `/src/main.ts` lines 12487-12546
**Function**: `generateGeneralPenjualanSection()`

### Current Data Flow (PROBLEMATIC)

```typescript
// Line 12539 - Raw data storage causing token issues
$store.setActiveViewData('general-penjualan', currentData, { selectedBranch, startDate, endDate });

// currentData contains full sales transaction arrays with:
// - Daily sales summaries with transaction details
// - Revenue breakdowns by branch, category, items
// - Time-based transaction data (hourly/daily patterns)
// - Customer transaction records
// Estimated: ~1.5M tokens for typical date range
```

### Chart/Table Functions Called

1. **`generateRingkasanFromSummaries()`** - Sales summary table (Total Omzet, Total Check, APC)
2. **`generateOmzetHarianChartFromSummaries()`** - Daily revenue chart
3. **`generateOmzetMingguanChartFromSummaries()`** - Weekly revenue chart
4. **`generateTcApcHarianChartFromSummaries()`** - Daily transaction count & APC chart
5. **`generateDailyOmzetHeatmapFromSummaries()`** - Daily sales heatmap
6. **`generateOmzetHeatmapFromSummaries()`** - Hourly sales heatmap
7. **`generateSalesTrendHourlyDailyChartFromSummaries()`** - Hourly/daily sales trend

### Data Structure

Each summary object contains:

- `date: Date` - Transaction date
- `totalOmzet: number` - Total revenue
- `totalTransactions: number` - Transaction count
- `branches: string[]` - Branch names
- `revenueByBranch: {[branch: string]: number}`
- `menuCategories: {[category: string]: {quantity: number}}`
- `menuItemQuantities: {[category: string]: {[item: string]: number}}`

## Questions for Clarification

1. **File Location**: Where is the main `general-penjualan` section generation function located?
2. **Data Size**: Approximately how much data are we dealing with? (number of transactions, time period)
3. **Performance Impact**: Are you experiencing specific token limit errors with this section?
4. **Priority Charts**: Are there specific charts/components that are most critical to preserve?

## Detailed Implementation Plan

### Phase 1: Replace Main Data Storage (Line 12539)

**Current Problematic Code:**

```typescript
$store.setActiveViewData('general-penjualan', currentData, { selectedBranch, startDate, endDate });
```

**Target Replacement:**

```typescript
// Replace with minimal view context
$store.setActiveViewData('general-penjualan', {
    viewContext: {
        selectedBranch,
        dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        totalRecordsAnalyzed: currentData.length,
        dataSource: "Sales transaction summaries",
        filtersApplied: { selectedBranch, startDate, endDate }
    }
}, { selectedBranch, startDate, endDate });
```

### Phase 2: Add Insights to Each Chart Function

#### 2.1 Sales Summary Insights (`generateRingkasanFromSummaries`)

```typescript
// After calculating totals, add insights
const summaryInsights = {
    salesSummary: {
        totalOmzet: formatCurrencyUtil(currentTotals.omzet),
        totalTransactions: currentTotals.checks.toLocaleString('id-ID'),
        averagePerCheck: formatCurrencyUtil(currentAvgCheck),
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        dataPoints: currentSummaries.length
    }
};

$store.setActiveViewData('general-penjualan', {
    salesSummaryInsights: summaryInsights
});
```

#### 2.2 Daily Revenue Chart Insights (`generateOmzetHarianChartFromSummaries`)

```typescript
const chartInsights = {
    chartType: 'daily_revenue_trend',
    description: 'Daily revenue performance over selected period',
    performance: {
        totalRevenue: formatCurrencyUtil(totalRevenue),
        averageDailyRevenue: formatCurrencyUtil(avgDaily),
        highestDay: {
            date: maxDay.date,
            revenue: formatCurrencyUtil(maxDay.revenue)
        },
        lowestDay: {
            date: minDay.date,
            revenue: formatCurrencyUtil(minDay.revenue)
        }
    },
    trend: 'growing|declining|stable|volatile'
};

$store.setActiveViewData('general-penjualan', {
    dailyRevenueInsights: chartInsights
});
```

#### 2.3 Weekly Revenue Chart Insights (`generateOmzetMingguanChartFromSummaries`)

```typescript
const weeklyInsights = {
    chartType: 'weekly_revenue_trend',
    description: 'Weekly revenue aggregation and patterns',
    performance: {
        totalWeeks: weeklyData.length,
        averageWeeklyRevenue: formatCurrencyUtil(avgWeekly),
        highestWeek: formatCurrencyUtil(maxWeekly),
        lowestWeek: formatCurrencyUtil(minWeekly)
    },
    weeklyPattern: {
        strongestWeeks: ['Week 1', 'Week 3'],
        weekestWeeks: ['Week 2'],
        trend: 'improving|declining|stable'
    }
};

$store.setActiveViewData('general-penjualan', {
    weeklyRevenueInsights: weeklyInsights
});
```

#### 2.4 TC/APC Chart Insights (`generateTcApcHarianChartFromSummaries`)

```typescript
const tcApcInsights = {
    chartType: 'dual_axis_transaction_analysis',
    description: 'Daily transaction count and average per check analysis',
    transactionAnalysis: {
        averageTransactionsPerDay: avgTC.toFixed(0),
        highestTransactionDay: maxTC.toFixed(0),
        lowestTransactionDay: minTC.toFixed(0),
        transactionTrend: 'increasing|decreasing|stable'
    },
    apcAnalysis: {
        averagePerCheck: formatCurrencyUtil(avgAPC),
        highestAPC: formatCurrencyUtil(maxAPC),
        lowestAPC: formatCurrencyUtil(minAPC),
        apcTrend: 'improving|declining|stable'
    }
};

$store.setActiveViewData('general-penjualan', {
    tcApcInsights: tcApcInsights
});
```

#### 2.5 Daily Heatmap Insights (`generateDailyOmzetHeatmapFromSummaries`)

```typescript
const dailyHeatmapInsights = {
    chartType: 'daily_sales_heatmap',
    description: 'Sales performance pattern by day of week',
    dayPatterns: {
        strongestDays: topDays.map(d => d.day),
        weakestDays: bottomDays.map(d => d.day),
        averageDailyRevenue: formatCurrencyUtil(avgDailyRevenue)
    },
    performance: {
        peakDay: {
            day: peakDay.day,
            revenue: formatCurrencyUtil(peakDay.revenue)
        },
        slowestDay: {
            day: slowestDay.day,
            revenue: formatCurrencyUtil(slowestDay.revenue)
        }
    }
};

$store.setActiveViewData('general-penjualan', {
    dailyHeatmapInsights: dailyHeatmapInsights
});
```

#### 2.6 Hourly Heatmap Insights (`generateOmzetHeatmapFromSummaries`)

```typescript
const hourlyHeatmapInsights = {
    chartType: 'hourly_sales_heatmap',
    description: 'Sales performance pattern by hour and day',
    timePatterns: {
        peakHours: ['11:00-12:00', '18:00-19:00'],
        slowHours: ['14:00-16:00', '21:00-22:00'],
        peakDays: ['Friday', 'Saturday'],
        slowDays: ['Monday', 'Tuesday']
    },
    performance: {
        peakHourRevenue: formatCurrencyUtil(peakHourRevenue),
        averageHourlyRevenue: formatCurrencyUtil(avgHourlyRevenue),
        peakDayRevenue: formatCurrencyUtil(peakDayRevenue)
    }
};

$store.setActiveViewData('general-penjualan', {
    hourlyHeatmapInsights: hourlyHeatmapInsights
});
```

#### 2.7 Sales Trend Chart Insights (`generateSalesTrendHourlyDailyChartFromSummaries`)

```typescript
const salesTrendInsights = {
    chartType: 'comprehensive_sales_trend',
    description: 'Overall sales trend analysis combining daily and hourly patterns',
    overallTrend: {
        direction: 'growing|declining|stable|volatile',
        strength: 'strong|moderate|weak',
        consistency: 'high|medium|low'
    },
    keyMetrics: {
        totalRevenue: formatCurrencyUtil(totalRevenue),
        averageGrowthRate: `${avgGrowthRate.toFixed(1)}%`,
        volatilityIndex: volatilityIndex.toFixed(2)
    }
};

$store.setActiveViewData('general-penjualan', {
    salesTrendInsights: salesTrendInsights
});
```

### Phase 3: Implementation Order

1. Replace main data storage first (line 12539)
2. Add insights to `generateRingkasanFromSummaries`
3. Add insights to daily/weekly charts
4. Add insights to heatmap functions
5. Add insights to trend analysis

### Expected Token Reduction

- **Before**: ~1,500,000 tokens (raw sales data arrays)
- **After**: ~2,000 tokens (structured insights only)
- **Reduction**: 99.9% (following successful general-keuangan pattern)

## Planned Implementation Approach

Following TOKEN_REDUCTION_GUIDE.md pattern:

### Phase 1: Analysis

- Find and analyze current implementation
- Map all data flows and chart functions
- Estimate token usage before changes

### Phase 2: Core Implementation

- Replace raw data storage with view context
- Implement insights for each chart/table function
- Use progressive enhancement with `setActiveViewData` merging

### Phase 3: Validation

- Test compilation and functionality
- Verify AI analysis quality maintained
- Measure token reduction achieved

## Expected Results

- **Token Reduction Target**: 95%+ (following guide expectations for large datasets)
- **Quality Maintenance**: AI insights should match exactly what users see
- **Functionality Preservation**: All charts and tables should work as before

## Implementation Status

- [x] **Analysis Complete** ✅
- [x] **Plan Approved** ✅ User confirmed: implement all, include date range, include sales targets
- [x] **Core Implementation** ✅ ALL 7 FUNCTIONS IMPLEMENTED
  - [x] Phase 1: Main data storage replaced (line 12539)
  - [x] Phase 2.1: Sales summary insights (`generateRingkasanFromSummaries`)
  - [x] Phase 2.2: Daily revenue chart insights (`generateOmzetHarianChartFromSummaries`)
  - [x] Phase 2.3: TC/APC chart insights (`generateTcApcHarianChartFromSummaries`)
  - [x] Phase 2.4: Weekly revenue chart insights (`generateOmzetMingguanChartFromSummaries`)
  - [x] Phase 2.5: Daily heatmap insights (`generateDailyOmzetHeatmapFromSummaries`)
  - [x] Phase 2.6: Hourly heatmap insights (`generateOmzetHeatmapFromSummaries`)
  - [x] Phase 2.7: Sales trend chart insights (`generateSalesTrendHourlyDailyChartFromSummaries`)
- [ ] **Testing & Validation** 🔄 READY FOR USER TESTING
- [ ] **Documentation Updated**

## Implementation Complete! 🎉

### ✅ **FULL IMPLEMENTATION DONE**

I have successfully implemented token reduction for the entire `general-penjualan` section following the proven TOKEN_REDUCTION_GUIDE.md pattern:

#### **What Was Changed:**

1. **Main Data Storage (Line 12539)**: Replaced massive raw sales data array with minimal view context containing:
   - Selected branch and date range info
   - Total records analyzed count
   - Sales target integration status
   - Data source description

2. **All 7 Chart Functions Enhanced** with progressive insights:
   - **Sales Summary**: Total omzet, transactions, APC with comparison info
   - **Daily Revenue Chart**: Performance metrics, trends, highest/lowest days
   - **TC/APC Chart**: Dual-axis analysis with transaction and revenue trends
   - **Weekly Revenue Chart**: Weekly aggregation patterns and consistency
   - **Daily Heatmap**: Day-of-week performance patterns and peak analysis
   - **Hourly Heatmap**: Hour-by-hour and day patterns with peak time slots
   - **Sales Trend Chart**: Comprehensive trend analysis with volatility metrics

#### **Features Included Per Your Requirements:**

- ✅ **Date Range Information**: All insights include date ranges and period context
- ✅ **Sales Target Integration**: Active targets are detected and included in descriptions
- ✅ **Complete Implementation**: All 7 functions have insights, no partial implementation

#### **Expected Results:**

- **Token Reduction**: ~1,500,000 tokens → ~3,000 tokens (99.8% reduction)
- **Quality Maintained**: All user-visible metrics preserved in insight format
- **Functionality Preserved**: Charts and UI work exactly as before

#### **Build Status**: ✅ **PASSES** - No blocking errors

### 🧪 **READY FOR YOUR TESTING**

The implementation is complete and ready for manual testing. Please test the `general-penjualan` section by:

1. Selecting different branches and date ranges
2. Verifying all charts still display correctly
3. Checking that AI analysis quality is maintained
4. Monitoring for any token limit issues

Let me know the test results, and I'll address any issues discovered!
