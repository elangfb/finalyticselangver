# Token Reduction Quick Reference

## TL;DR Implementation Steps

1. **Find the main function** that stores large data arrays
2. **Replace data storage** with minimal view context
3. **Add insights to each chart/table function** using progressive enhancement
4. **Use formatCurrencyUtil()** for all currency values in insights
5. **Test and validate** token reduction

## Essential Code Patterns

### 1. Main Function Pattern

```typescript
// BEFORE (❌ High tokens)
$store.setActiveViewData('section-name', largeDataArray, filters);

// AFTER (✅ Low tokens)
$store.setActiveViewData('section-name', {
    viewContext: {
        selectedBranch: branch,
        selectedPeriod: period,
        recordsAnalyzed: data.length,
        dateRange: `${startDate} to ${endDate}`
    }
}, filters);
```

### 2. Chart Insight Pattern

```typescript
// Add at end of each chart generation function
if (chartData.length > 0) {
    const insights = {
        chartType: 'descriptive_chart_type',
        // Include exactly what users see
        keyMetrics: {
            average: formatCurrencyUtil(avgValue),
            trend: 'growing|declining|stable'
        }
    };

    $store.setActiveViewData('section-name', {
        [chartId + 'Insights']: insights
    });
}
```

### 3. Table Insight Pattern

```typescript
// Add after table generation
const tableInsights = {};
tableCategories.forEach(category => {
    tableInsights[category] = {
        currentValue: formatCurrencyUtil(currentValue),
        previousValue: formatCurrencyUtil(previousValue),
        change: `${changePercent.toFixed(1)}%`,
        trend: getTrend(previous, current)
    };
});

$store.setActiveViewData('section-name', {
    [tableName + 'Trends']: tableInsights
});
```

## Common Chart Types & Insights

### Dual-Axis Charts (Value + Percentage)

```typescript
{
    chartType: 'dual_axis_financial_ratio',
    ratioAnalysis: {
        average: `${avgRatio.toFixed(1)}%`,
        trend: 'improving|declining|stable'
    },
    absoluteValues: {
        averageValue: formatCurrencyUtil(avgValue)
    }
}
```

### Time Series Charts

```typescript
{
    chartType: 'time_series_trend',
    trendAnalysis: {
        overallTrend: 'growing|declining|stable',
        growthRate: `${rate.toFixed(1)}%`,
        volatility: 'high|medium|low'
    }
}
```

### Pie/Doughnut Charts

```typescript
{
    chartType: 'category_distribution',
    topCategory: {
        name: 'Category Name',
        percentage: '45.2%'
    },
    distribution: 'concentrated|balanced|dispersed'
}
```

## Trend Classification Logic

```typescript
const getTrend = (startValue, endValue, threshold = 5) => {
    if (startValue === 0) return 'stable';
    const changePercent = ((endValue - startValue) / Math.abs(startValue)) * 100;
    if (Math.abs(changePercent) <= threshold) return 'stable';
    return changePercent > 0 ? 'growing' : 'declining';
};
```

## Quick Validation Checklist

- [ ] Main function uses viewContext instead of raw data
- [ ] Each chart function adds insights via merging
- [ ] All currency values use formatCurrencyUtil()
- [ ] Insights match exactly what users see
- [ ] Build completes successfully (npm run build)

## Expected Results

- **Token Reduction**: 95%+ for most sections
- **Data Completeness**: 100% of user-visible metrics
- **Build Status**: No blocking TypeScript errors
- **AI Quality**: Maintained or improved analysis

## Files to Document

- Create `[SECTION_NAME]_IMPLEMENTATION.md` in `docs/.ai/`
- Update this roadmap with progress
- Add any lessons learned or optimizations

## Common Pitfalls to Avoid

❌ Creating new aggregation logic (reuse existing)
❌ Using shortenCurrency for AI insights (use formatCurrencyUtil)
❌ Missing user-visible metrics in insights
❌ Inconsistent trend classification logic
❌ Forgetting to handle empty data cases
