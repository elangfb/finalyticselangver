# General Investasi Token Reduction Plan

## Current Status: ANALYSIS COMPLETE ✅

### Overview
Implementing token reduction for the 'general-investasi' section to prevent Google Gemini API token limit errors (1,048,576 tokens), following the successful pattern from 'general-keuangan' section.

## Analysis Results

### Current Implementation Located ✅
- **Main orchestrator**: `generateGeneralInvestasiSection()` in `src/main.ts` line ~13850
- **Raw data storage**: Line 13902 - `$store.setActiveViewData('general-investasi', { investmentData, monthlyProfits }, { selectedBranch })`
- **Token issue**: Storing full `monthlyProfits` array (24 months of detailed P&L data) + `investmentData`

### Chart Functions Identified ✅
1. **`generateBusinessYieldChart()`** - Line ~13920
   - Business profit vs yield percentage dual-axis chart
   - Uses: `monthlyProfits` (profit + period data)

2. **`generateInvestorYieldChart()`** - Line ~13950
   - Investor profit vs yield per slot dual-axis chart
   - Uses: `monthlyProfits` + investment slot calculations

3. **`generateCumulativeInvestorShareChart()`** - Line ~13775
   - Cumulative investor share accumulation over time
   - Uses: `monthlyProfits` + investor share percentage

### Data Structure Analysis ✅
**Raw data being stored**:
```typescript
// CURRENT - High token usage
{
    investmentData: {
        branchName: string,
        investmentAmount: number,
        investmentSlots: number,
        investorSharePercentage: number
        // + potentially more fields
    },
    monthlyProfits: [
        // 24 months of data
        {
            period: "2024-01",
            profit: netIncomeCalculation // Complex P&L calculation
        },
        // ... 23 more periods
    ]
}
```

**Token Estimation**:
- `investmentData`: ~200 tokens
- `monthlyProfits`: ~5K-10K tokens (24 periods of financial data)
- **Total**: ~5K-10K tokens per analysis

### Investment Data Types Confirmed ✅
- **ROI Analysis**: Business yield percentage (profit/investment ratio)
- **Investment Structure**: Total amount, slot distribution, investor share percentage
- **Time-based Performance**: Monthly profit trends over 24 periods
- **Cumulative Returns**: Accumulation of investor share over time

## Implementation Plan (READY FOR EXECUTION)

### Phase 1: Main Data Storage Replacement ✅ ANALYZED
**Target**: Line 13902 in `generateGeneralInvestasiSection()`

**BEFORE**:
```typescript
$store.setActiveViewData('general-investasi', { investmentData, monthlyProfits }, { selectedBranch });
```

**AFTER**:
```typescript
$store.setActiveViewData('general-investasi', {
    viewContext: {
        selectedBranch,
        periodsAnalyzed: monthlyProfits.length,
        periodRange: monthlyProfits.length > 0 ?
            `${monthlyProfits[0].period} to ${monthlyProfits[monthlyProfits.length - 1].period}` :
            'No data',
        totalInvestment: investmentData.investmentAmount,
        investmentSlots: investmentData.investmentSlots,
        investorSharePercentage: investmentData.investorSharePercentage
    }
}, { selectedBranch });
```

### Phase 2: Chart Function Insights Addition

#### A. Business Yield Chart Insights (`generateBusinessYieldChart`)
**Location**: After chart creation (~line 13945)
**Function**: Add ROI and profit performance insights

```typescript
// NEW: Add business yield insights
if (monthlyProfits.length > 0) {
    const avgProfit = monthlyProfits.reduce((sum, p) => sum + p.profit, 0) / monthlyProfits.length;
    const maxProfit = Math.max(...monthlyProfits.map(p => p.profit));
    const minProfit = Math.min(...monthlyProfits.map(p => p.profit));
    const avgYield = totalInvestment > 0 ? (avgProfit / totalInvestment * 100) : 0;
    const maxYield = totalInvestment > 0 ? (maxProfit / totalInvestment * 100) : 0;
    const latestProfit = monthlyProfits[monthlyProfits.length - 1].profit;
    const firstProfit = monthlyProfits[0].profit;
    const profitTrend = getProfitTrend(firstProfit, latestProfit);

    const businessYieldInsights = {
        chartType: 'business_yield_analysis',
        description: 'Monthly business profit vs ROI yield percentage',
        profitAnalysis: {
            averageProfit: formatCurrency(avgProfit),
            highestProfit: formatCurrency(maxProfit),
            lowestProfit: formatCurrency(minProfit),
            latestProfit: formatCurrency(latestProfit),
            profitTrend: profitTrend
        },
        yieldAnalysis: {
            averageYield: `${avgYield.toFixed(2)}%`,
            peakYield: `${maxYield.toFixed(2)}%`,
            annualizedAverage: `${(avgYield * 12).toFixed(1)}%`
        },
        investmentPerformance: {
            totalInvestment: formatCurrency(totalInvestment),
            periodsTracked: monthlyProfits.length
        }
    };

    $store.setActiveViewData('general-investasi', {
        businessYieldInsights: businessYieldInsights
    });
}
```

#### B. Investor Yield Chart Insights (`generateInvestorYieldChart`)
**Location**: After chart creation (~line 13975)
**Function**: Add per-slot yield and investor return insights

```typescript
// NEW: Add investor yield insights
if (monthlyProfits.length > 0 && slots > 0) {
    const investmentPerSlot = totalInvestment / slots;
    const avgProfitPerSlot = monthlyProfits.reduce((sum, p) => sum + p.profit, 0) / monthlyProfits.length / slots;
    const avgYieldPerSlot = investmentPerSlot > 0 ? (avgProfitPerSlot / investmentPerSlot * 100) : 0;
    const totalReturn = monthlyProfits.reduce((sum, p) => sum + p.profit, 0);
    const totalReturnPerSlot = totalReturn / slots;

    const investorYieldInsights = {
        chartType: 'investor_yield_analysis',
        description: 'Monthly profit and yield analysis per investment slot',
        slotAnalysis: {
            totalSlots: slots,
            investmentPerSlot: formatCurrency(investmentPerSlot),
            averageMonthlyProfitPerSlot: formatCurrency(avgProfitPerSlot),
            averageMonthlyYieldPerSlot: `${avgYieldPerSlot.toFixed(2)}%`
        },
        returnAnalysis: {
            totalReturnAllPeriods: formatCurrency(totalReturn),
            totalReturnPerSlot: formatCurrency(totalReturnPerSlot),
            annualizedYieldPerSlot: `${(avgYieldPerSlot * 12).toFixed(1)}%`
        }
    };

    $store.setActiveViewData('general-investasi', {
        investorYieldInsights: investorYieldInsights
    });
}
```

#### C. Cumulative Investor Share Chart Insights (`generateCumulativeInvestorShareChart`)
**Location**: After chart creation (~line 13800)
**Function**: Add cumulative return and investor share insights

```typescript
// NEW: Add cumulative investor share insights
if (monthlyProfits.length > 0) {
    let cumulativeShare = 0;
    const monthlyShares = monthlyProfits.map(p => {
        const monthlyShare = p.profit * (investorSharePercentage / 100);
        cumulativeShare += monthlyShare;
        return { period: p.period, monthlyShare, cumulativeShare };
    });

    const latestCumulative = cumulativeShare;
    const avgMonthlyShare = monthlyShares.reduce((sum, s) => sum + s.monthlyShare, 0) / monthlyShares.length;
    const maxMonthlyShare = Math.max(...monthlyShares.map(s => s.monthlyShare));

    const cumulativeShareInsights = {
        chartType: 'cumulative_investor_share',
        description: 'Accumulated investor profit sharing over time',
        investorShareConfig: {
            sharePercentage: `${investorSharePercentage}%`,
            periodsTracked: monthlyProfits.length
        },
        cumulativeAnalysis: {
            totalAccumulated: formatCurrency(latestCumulative),
            averageMonthlyShare: formatCurrency(avgMonthlyShare),
            highestMonthlyShare: formatCurrency(maxMonthlyShare),
            projectedAnnual: formatCurrency(avgMonthlyShare * 12)
        }
    };

    $store.setActiveViewData('general-investasi', {
        cumulativeShareInsights: cumulativeShareInsights
    });
}
```

### Phase 3: Utility Functions
Add helper function for trend analysis:

```typescript
// Add near other utility functions in main.ts
function getProfitTrend(firstValue: number, lastValue: number, threshold = 5): string {
    if (firstValue === 0) return 'stable';
    const changePercent = ((lastValue - firstValue) / Math.abs(firstValue)) * 100;
    if (Math.abs(changePercent) <= threshold) return 'stable';
    return changePercent > 0 ? 'growing' : 'declining';
}
```

### Phase 4: Expected Token Reduction
- **Before**: ~5K-10K tokens
- **After**: ~500-800 tokens
- **Reduction**: 85-90% token reduction
- **Maintained**: All user-visible metrics and trends

### Dependencies Confirmed ✅
- `formatCurrency` function exists in `src/utils/string.ts` (will use this instead of `formatCurrencyUtil`)
- `$store.setActiveViewData` merging capability confirmed
- All chart creation functions identified and accessible

## Expected Investment Data Patterns ✅ CONFIRMED

Based on analysis and prompt description: "Data investasi perusahaan, termasuk ROI (Return on Investment) dan analisis risiko"

**Confirmed insights needed**:
- ✅ **ROI calculations and trends**: Business yield percentage, investor yield per slot
- ✅ **Investment performance metrics**: Monthly profit analysis, cumulative returns
- ✅ **Investment structure breakdown**: Total investment, slot distribution, investor share percentage
- ✅ **Time-based analysis**: 24-month profit trends, growth patterns
- ✅ **Risk indicators**: Profit volatility, yield consistency

## Execution Plan Validation

### My Assumptions:
1. **formatCurrency usage**: Using `formatCurrency` from `src/utils/string.ts` instead of `formatCurrencyUtil` (confirmed exists)
2. **Investment context**: This section analyzes ROI for business investments with slot-based investor sharing
3. **Chart types**: Three dual-axis and cumulative charts showing different yield perspectives
4. **Token reduction target**: 85-90% reduction (from ~10K to ~800 tokens)
5. **Data preservation**: All user-visible metrics will be preserved as descriptive insights

### Implementation Decisions ✅ CONFIRMED:

1. **Function naming**: ✅ Use imported `formatCurrencyUtil`
2. **Insight focus**: ✅ Only include what users see in the charts
3. **Insight keys**: ✅ Use `businessYieldInsights`, `investorYieldInsights`, `cumulativeShareInsights`
4. **Content scope**: ✅ Focus on user-visible metrics only
5. **Execution order**: ✅ Main storage → business chart → investor chart → cumulative chart → utility function

## IMPLEMENTATION COMPLETE ✅

### Changes Made:

#### ✅ Phase 1: Main Data Storage (Line 13902)
**BEFORE**: `$store.setActiveViewData('general-investasi', { investmentData, monthlyProfits }, { selectedBranch });`
**AFTER**: Replaced with minimal `viewContext` containing only essential metadata

#### ✅ Phase 2: Utility Function (Line 4889)
Added `getProfitTrend()` function for consistent trend analysis

#### ✅ Phase 3: Business Yield Chart Insights (Line 13965)
Added comprehensive insights covering:
- Profit analysis (average, max, min, latest, trend)
- Yield analysis (average, peak, annualized)
- Investment performance metrics

#### ✅ Phase 4: Investor Yield Chart Insights (Line 14051)
Added slot-based insights covering:
- Slot analysis (per-slot investment, profit, yield)
- Return analysis (total returns, annualized yields)

#### ✅ Phase 5: Cumulative Share Chart Insights (Line 13824)
Added cumulative insights covering:
- Investor share configuration
- Cumulative analysis (total accumulated, averages, projections)

### Expected Results:
- **Token Reduction**: ~85-90% (from ~10K to ~800 tokens)
- **Data Preservation**: All user-visible metrics maintained as descriptive insights
- **AI Analysis**: Enhanced with focused investment performance insights
