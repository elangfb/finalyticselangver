# AI Implementation Guide: Prompt Refactoring

**Target File:** `src/prompt.ts`
**Goal:** Follow the detailed plan in `PROMPT_REFACTORING_PLAN.md` to implement tailored prompts for all 11 views.

## Quick Implementation Checklist

### ✅ Completed
- [x] **Foundation Setup** - Shared components extracted
- [x] **Sample Implementation** - `general-keuangan` completed as template

### 🔄 Next Steps (In Priority Order)

#### Phase 2A: Complete Financial Domain
```typescript
// Implement these functions in src/prompt.ts:
- createWaktuKeuanganPrompt(data: unknown): string
- createCabangKeuanganPrompt(data: unknown): string

// Update viewPromptCreators:
'waktu-keuangan': (data: unknown) => createWaktuKeuanganPrompt(data),
'cabang-keuangan': (data: unknown) => createCabangKeuanganPrompt(data),
```

#### Phase 2B: Sales Domain Implementation
```typescript
// Create domain config:
const PENJUALAN_CONFIG = { /* See plan for full config */ }

// Implement functions:
- createGeneralPenjualanPrompt(data: unknown): string
- createWaktuPenjualanPrompt(data: unknown): string
- createCabangPenjualanPrompt(data: unknown): string
```

#### Phase 2C: Product-Channel Domain
```typescript
// Create domain config:
const PRODUK_CHANNEL_CONFIG = { /* See plan for full config */ }

// Implement functions:
- createGeneralProdukChannelPrompt(data: unknown): string
- createWaktuProdukChannelPrompt(data: unknown): string
- createCabangProdukChannelPrompt(data: unknown): string
```

#### Phase 2D: Investment Domain
```typescript
// Create domain config:
const INVESTASI_CONFIG = { /* See plan for full config */ }

// Implement functions:
- createGeneralInvestasiPrompt(data: unknown): string
- createCabangInvestasiPrompt(data: unknown): string
```

## Domain-Specific Guidance

### Financial Views (Keuangan)
**Key Focus:** Profitability, cost control, financial health
**Metrics:** Target vs Actual, GPM, NPM, COGS, revenue trends
**Tone:** Professional financial analysis, ratio-focused

### Sales Views (Penjualan)
**Key Focus:** Transaction patterns, customer behavior, channel performance
**Metrics:** Sales volume, APC, payment methods, visit purposes, channel mix
**Tone:** Customer-centric, behavior analysis, operational insights

### Product-Channel Views
**Key Focus:** Menu optimization, distribution effectiveness, category performance
**Metrics:** Product rankings, category composition, channel distribution, top performers
**Tone:** Product portfolio analysis, operational optimization

### Investment Views
**Key Focus:** ROI analysis, risk assessment, investment returns
**Metrics:** ROI percentages, payback periods, risk metrics, investment performance
**Tone:** Strategic financial analysis, investment evaluation

## View Type Modifiers

### General Views
- **Context:** Current period comprehensive overview
- **Analysis:** Snapshot of overall business performance
- **Focus:** Key metrics and overall health indicators

### Waktu (Time) Views
- **Context:** Time-series analysis with trend focus
- **Analysis:** Pattern identification, seasonality, growth trends
- **Focus:** Changes over time, trend significance, temporal patterns

### Cabang (Branch) Views
- **Context:** Multi-location comparative analysis
- **Analysis:** Branch ranking, performance gaps, location insights
- **Focus:** Cross-branch benchmarking, best/worst performers

## Implementation Pattern

For each new prompt function, follow this pattern:

1. **Copy the `createGeneralKeuanganPrompt` template**
2. **Replace domain-specific elements:**
   - Analyst role and expertise
   - Key metrics list
   - Analysis approach
   - Domain terminology
3. **Adjust view type context:**
   - Time context (current vs trends vs comparison)
   - Analysis depth (overview vs deep-dive vs comparative)
   - Focus area (what to emphasize)
4. **Update the viewPromptCreators object**
5. **Test with sample data**

## Code Quality Guidelines

- **Maintain exact output format** - Don't change the shared format rules
- **Keep consistent structure** - All functions should follow same pattern
- **Use descriptive variable names** - Clear domain and view type indicators
- **Add TypeScript types** - Ensure type safety throughout
- **Document domain configs** - Comment the reasoning behind metric selections

## Testing Approach

After implementing each view:
1. **Create sample data** representative of that view's data structure
2. **Generate prompt** and verify domain-specific elements are present
3. **Compare with generic version** to ensure improvement
4. **Validate output format** remains consistent

## Validation Checklist

For each implemented prompt, verify:
- [ ] Specialist role clearly defined
- [ ] Domain expertise mentioned
- [ ] Key metrics properly prioritized
- [ ] Analysis approach appropriate for domain
- [ ] View type context correctly applied
- [ ] Shared components properly included
- [ ] Output format unchanged
- [ ] No recommendations/suggestions included
- [ ] Professional tone maintained
- [ ] Word count guidance preserved

## Final Steps

Once all views are implemented:
1. **Remove old `formatPromptForPage`** function (after ensuring no other usage)
2. **Clean up imports** and unused code
3. **Add JSDoc comments** to all new functions
4. **Run TypeScript compilation** to ensure no errors
5. **Test in development environment** with real data

## Success Metrics

The refactoring is successful when:
- All 11 views have tailored, domain-specific prompts
- Each prompt reflects the specialized expertise needed for that domain
- Output format and restrictions remain consistent across all views
- Code is more maintainable and extensible than before
- AI responses demonstrate improved domain relevance and insight quality
