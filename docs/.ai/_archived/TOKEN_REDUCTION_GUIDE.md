# Token Reduction Implementation Guide

## Overview

This guide provides a comprehensive framework for implementing token reduction in analytics sections to prevent Google Gemini API token limit errors (1,048,576 tokens). The approach was successfully implemented in the `general-keuangan` section, achieving a 99.9% token reduction (from ~2M tokens to ~2K tokens).

## Problem Statement

### The Issue

- **Root Cause**: Raw data arrays being passed to AI for analysis
- **Symptoms**: Token limit exceeded errors, application crashes
- **Example**: Historical P&L reports containing full transaction data (~2M tokens)

### The Solution

Replace raw data storage with **descriptive insights** that capture exactly what users see in the UI.

## Core Principles

### 1. **User-AI Alignment**

- AI insights must match exactly what users see in tables/charts
- No summarization or aggregation beyond what's displayed
- Maintain data integrity and accuracy

### 2. **Progressive Enhancement**

- Use `setActiveViewData` merging capability
- Each chart/table function adds its own insights
- Build insights incrementally rather than all at once

### 3. **Existing Code Reuse**

- Prefer existing utility functions over creating new ones
- Use `formatCurrency` for AI insights (full precision)
- Use `shortenCurrency` for user display only

### 4. **Comprehensive Coverage**

- Include ALL categories/metrics shown to users
- Don't cherry-pick "important" metrics
- Ensure complete data representation

## Implementation Pattern

### Step 1: Identify Data Flow

1. **Find the main orchestrator function** (e.g., `generateGeneralKeuanganSection`)
2. **Locate raw data storage** (look for `setActiveViewData` with large arrays)
3. **Map all chart/table functions** that use the raw data
4. **Document current token usage** (estimate from data size)

### Step 2: Replace Main Data Storage

Replace raw data with minimal view context:

```typescript
// BEFORE: Raw data storage
$store.setActiveViewData('section-name', historicalReports, { filters });

// AFTER: Minimal context
$store.setActiveViewData('section-name', {
    viewContext: {
        selectedBranch: "Main Branch",
        selectedPeriod: "2024-06",
        periodsAnalyzed: historicalReports.length,
        periodRange: "2024-01 to 2024-06",
        dataSource: "Description of data source"
    }
}, { filters });
```

### Step 3: Add Insights to Each Function

For each chart/table function, add insights that capture what users see:

```typescript
function generateExampleChart(data) {
    // ... existing chart generation code ...

    // NEW: Generate insights for AI analysis
    if (chartData.length > 0) {
        const insights = {
            chartType: 'chart_type_description',
            description: 'What this chart shows',
            keyMetrics: {
                // Metrics that match what users see
                average: formatCurrencyUtil(avgValue),
                trend: 'growing|declining|stable'
            }
        };

        // Store insights using merging capability
        $store.setActiveViewData('section-name', {
            [chartId + 'Insights']: insights
        });
    }
}
```

## Section-Specific Implementation Templates

### Financial Data Sections

For sections with P&L, revenue, or expense data:

```typescript
// Historical table insights
const tableInsights = {
    [metricName]: {
        firstPeriod: formatCurrencyUtil(firstValue),
        lastPeriod: formatCurrencyUtil(lastValue),
        average: formatCurrencyUtil(avgValue),
        growthPercent: `${growthPercent.toFixed(1)}%`,
        trend: 'growing|declining|stable'
    }
};

// Chart insights
const chartInsights = {
    chartType: 'dual_axis_financial_ratio',
    metricName: 'Metric Name',
    ratioAnalysis: {
        average: `${avgRatio.toFixed(1)}%`,
        highest: `${maxRatio.toFixed(1)}%`,
        lowest: `${minRatio.toFixed(1)}%`,
        trend: 'improving|declining|stable'
    },
    absoluteValues: {
        averageValue: formatCurrencyUtil(avgValue),
        highestValue: formatCurrencyUtil(maxValue),
        lowestValue: formatCurrencyUtil(minValue)
    }
};
```

### Sales Data Sections

For sections with transaction, customer, or product data:

```typescript
// Sales performance insights
const salesInsights = {
    chartType: 'sales_trend_analysis',
    description: 'Sales performance over time',
    performance: {
        totalTransactions: transactionCount,
        averagePerTransaction: formatCurrencyUtil(apc),
        revenueRange: {
            min: formatCurrencyUtil(minRevenue),
            max: formatCurrencyUtil(maxRevenue),
            average: formatCurrencyUtil(avgRevenue)
        }
    },
    trends: {
        transactionTrend: 'increasing|decreasing|stable',
        revenueTrend: 'growing|declining|stable'
    }
};

// Product/Channel breakdown insights
const breakdownInsights = {
    chartType: 'category_breakdown',
    topPerformers: topItems.map(item => ({
        name: item.name,
        value: formatCurrencyUtil(item.value),
        percentage: `${item.percentage.toFixed(1)}%`
    })),
    distribution: 'even|concentrated|mixed'
};
```

### Time-Based Analysis Sections

For sections analyzing patterns over time:

```typescript
// Time pattern insights
const timeInsights = {
    chartType: 'time_pattern_analysis',
    patterns: {
        peakHours: ['12:00', '19:00'],
        peakDays: ['Friday', 'Saturday'],
        seasonalTrend: 'growing|declining|seasonal'
    },
    performance: {
        averageHourlyRevenue: formatCurrencyUtil(avgHourly),
        peakHourRevenue: formatCurrencyUtil(peakHourly),
        offPeakHourRevenue: formatCurrencyUtil(offPeakHourly)
    }
};
```

## Implementation Checklist

### Pre-Implementation Analysis

- [ ] Identify the main orchestrator function
- [ ] Map all chart/table functions in the section
- [ ] Estimate current token usage
- [ ] List all data categories shown to users
- [ ] Document existing utility functions available

### Core Implementation

- [ ] Replace main data storage with view context
- [ ] Add insights to historical/summary tables
- [ ] Add insights to all chart functions
- [ ] Use `formatCurrencyUtil` for currency values
- [ ] Use appropriate precision for percentages
- [ ] Ensure trend analysis is consistent

### Validation

- [ ] Build compiles successfully
- [ ] All chart/table functions add insights
- [ ] Insights match exactly what users see
- [ ] No raw data arrays in stored data
- [ ] Token usage reduced significantly

### Testing

- [ ] Test with real data in browser
- [ ] Verify AI analysis quality
- [ ] Monitor actual token usage
- [ ] Check for edge cases (empty data, etc.)

## Common Patterns by Chart Type

### Dual-Axis Charts (Value + Percentage)

```typescript
const dualAxisInsights = {
    chartType: 'dual_axis_financial_ratio',
    metricName: config.metric,
    title: config.title,
    ratioAnalysis: {
        average: `${avgRatio.toFixed(1)}%`,
        highest: `${maxRatio.toFixed(1)}%`,
        lowest: `${minRatio.toFixed(1)}%`,
        trend: 'improving|declining|stable'
    },
    absoluteValues: {
        averageValue: formatCurrencyUtil(avgValue),
        highestValue: formatCurrencyUtil(maxValue),
        lowestValue: formatCurrencyUtil(minValue)
    }
};
```

### Stacked Bar Charts

```typescript
const stackedBarInsights = {
    chartType: 'stacked_bar_chart',
    description: 'Chart description',
    stackComponents: ['Component 1', 'Component 2', 'Component 3'],
    totalRange: {
        min: formatCurrencyUtil(minTotal),
        max: formatCurrencyUtil(maxTotal),
        average: formatCurrencyUtil(avgTotal)
    },
    componentAnalysis: {
        dominantComponent: 'Component Name',
        averageRatios: {
            'Component 1': '45.2%',
            'Component 2': '32.1%',
            'Component 3': '22.7%'
        }
    }
};
```

### Time Series Charts

```typescript
const timeSeriesInsights = {
    chartType: 'time_series_trend',
    description: 'Trend over time',
    timeRange: {
        start: 'Start Period',
        end: 'End Period',
        periodsCount: periodCount
    },
    trendAnalysis: {
        overallTrend: 'growing|declining|stable|volatile',
        growthRate: `${growthRate.toFixed(1)}%`,
        volatility: 'high|medium|low'
    },
    keyPeriods: {
        highest: {
            period: 'Period Name',
            value: formatCurrencyUtil(highestValue)
        },
        lowest: {
            period: 'Period Name',
            value: formatCurrencyUtil(lowestValue)
        }
    }
};
```

### Pie/Doughnut Charts

```typescript
const pieChartInsights = {
    chartType: 'category_distribution',
    description: 'Distribution breakdown',
    categories: pieData.map((item, index) => ({
        name: labels[index],
        value: formatCurrencyUtil(item),
        percentage: `${(item / total * 100).toFixed(1)}%`
    })),
    distribution: {
        topCategory: {
            name: 'Category Name',
            percentage: '45.2%'
        },
        concentration: 'high|medium|low'
    }
};
```

## Error Handling and Edge Cases

### Empty Data Handling

```typescript
// Always check for empty data before generating insights
if (data.length === 0 || !data.some(item => item.value > 0)) {
    const emptyInsights = {
        chartType: 'no_data',
        description: 'No data available for this period',
        reason: 'No records found|All values are zero|Data not loaded'
    };

    $store.setActiveViewData('section-name', {
        [chartId + 'Insights']: emptyInsights
    });
    return;
}
```

### Invalid Data Handling

```typescript
// Handle division by zero and invalid calculations
const ratio = denominator > 0 ? (numerator / denominator * 100) : 0;
const growth = firstValue !== 0 ? ((lastValue - firstValue) / Math.abs(firstValue) * 100) : 0;

// Ensure valid number formatting
const safeFormat = (value) => {
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
        return formatCurrencyUtil(0);
    }
    return formatCurrencyUtil(value);
};
```

## Best Practices

### Naming Conventions

- Insight keys: `[chartId]Insights` (e.g., `general-cogs-chartInsights`)
- View context: `viewContext`
- Table insights: `[tableName]Trends` (e.g., `historicalPnlTrends`)

### Data Precision

- **Currency**: Use `formatCurrencyUtil()` for full precision (e.g., "Rp 1,234,567")
- **Percentages**: Use 1 decimal place (e.g., "45.2%")
- **Growth rates**: Use 1 decimal place with sign (e.g., "+12.5%", "-8.3%")

### Trend Classification

```typescript
// Consistent trend determination logic
const getTrend = (startValue, endValue, threshold = 5) => {
    if (startValue === 0) return 'stable';
    const changePercent = ((endValue - startValue) / Math.abs(startValue)) * 100;
    if (Math.abs(changePercent) <= threshold) return 'stable';
    return changePercent > 0 ? 'growing' : 'declining';
};

// For ratios/percentages
const getRatioTrend = (startRatio, endRatio, threshold = 5) => {
    const changePercent = Math.abs(endRatio - startRatio);
    if (changePercent <= threshold) return 'stable';
    return endRatio > startRatio ? 'improving' : 'declining';
};
```

## Debugging and Validation

### Token Usage Estimation

```typescript
// Add this temporarily to estimate token reduction
console.log('Raw data size:', JSON.stringify(rawData).length);
console.log('Insights size:', JSON.stringify(insights).length);
console.log('Reduction ratio:', (1 - insights.length / rawData.length) * 100 + '%');
```

### Data Integrity Checks

```typescript
// Verify insights match UI display
const validateInsights = (insights, displayedData) => {
    // Check that key metrics match what users see
    console.assert(insights.average === formatCurrencyUtil(displayedAverage));
    console.assert(insights.trend === expectedTrend);
};
```

## Expected Results

### Token Reduction Targets

- **Massive datasets** (>1M tokens): 99%+ reduction
- **Large datasets** (100K-1M tokens): 95%+ reduction
- **Medium datasets** (10K-100K tokens): 80%+ reduction

### Quality Maintenance

- AI analysis quality should remain equivalent or improve
- All user-visible metrics must be preserved
- Trend analysis should be more focused and actionable

## Future Considerations

### Scalability

- Pattern can be applied to any section with large datasets
- Insights structure is extensible for new chart types
- Compatible with future UI changes

### Monitoring

- Add logging to track actual token usage
- Monitor AI analysis quality metrics
- Set up alerts for token usage spikes

## Section Priority for Implementation

1. **High Priority**: Sections with historical data, large transaction sets
2. **Medium Priority**: Sections with complex aggregations, multiple charts
3. **Low Priority**: Sections with minimal data, mostly configuration

Apply this guide systematically to achieve consistent token reduction across all analytics sections.
