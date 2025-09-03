# Prompt Refactoring Plan: Tailored View-Specific Prompts

**Created:** September 3, 2025
**Goal:** Refactor generic `formatPromptForPage` function to create tailored, domain-specific prompts for each of the 11 analytical views while maintaining consistency and reusability.

## Table of Contents
1. [Current State Analysis](#current-state-analysis)
2. [Problems with Current Approach](#problems-with-current-approach)
3. [Refactoring Strategy](#refactoring-strategy)
4. [Implementation Architecture](#implementation-architecture)
5. [Domain-Specific Configurations](#domain-specific-configurations)
6. [View Type Specializations](#view-type-specializations)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Code Templates](#code-templates)
9. [Testing Strategy](#testing-strategy)
10. [Benefits](#benefits)

---

## Current State Analysis

### Existing Structure
```typescript
// Current implementation - ALL views use the same generic prompt
export const viewPromptCreators = Object.freeze({
  'general-keuangan': (data: unknown) => formatPromptForPage({ shortDescription: '...', data }),
  'general-penjualan': (data: unknown) => formatPromptForPage({ shortDescription: '...', data }),
  // ... 9 more views
})
```

### View Categories
- **General Views (4):** `general-keuangan`, `general-penjualan`, `general-produk-channel`, `general-investasi`
- **Time-focused Views (3):** `waktu-keuangan`, `waktu-penjualan`, `waktu-produk-channel`
- **Branch-focused Views (4):** `cabang-keuangan`, `cabang-penjualan`, `cabang-produk-channel`, `cabang-investasi`

### Data Domains
- **Keuangan (Financial):** Revenue, costs, profit margins, ratios (COGS, GPM, NPM), target vs actual
- **Penjualan (Sales):** Transaction counts, channels, payment methods, customer behavior
- **Produk-Channel:** Menu performance, category analysis, channel distribution
- **Investasi (Investment):** ROI analysis, risk assessment, investment returns

---

## Problems with Current Approach

### 1. **Generic Analysis Context**
- All views get same "objective data analyst" role
- No domain-specific expertise or terminology
- Missing context about what specific metrics matter most

### 2. **Inadequate Specialization**
- Financial views should focus on profitability, ratios, cost control
- Sales views should emphasize customer patterns, channel performance
- Time views should highlight trends, seasonality, growth patterns
- Branch views should emphasize comparative performance, rankings

### 3. **Missed Opportunities**
- No domain-specific KPI prioritization
- No specialized analysis methodologies
- No context-aware metric interpretation

### 4. **Maintainability Issues**
- All prompt logic concentrated in one generic function
- Hard to customize specific view requirements
- Changes affect all views simultaneously

---

## Refactoring Strategy

### Core Principles
1. **Shared Foundation:** Common output format, rules, and brand context
2. **Domain Specialization:** Role, metrics, and analysis approach tailored per domain
3. **View Type Modifiers:** Time-series vs branch comparison vs general overview contexts
4. **Modular Design:** Reusable components that can be mixed and matched

### Component Architecture
```
Prompt = SharedComponents + DomainConfig + ViewTypeModifier + SpecificContext
```

---

## Implementation Architecture

### 1. Shared Components (Extracted from current `formatPromptForPage`)
```typescript
const SHARED_COMPONENTS = {
  outputFormat: `/* Two-part format: paragraph + bullet points */`,
  analysisRules: `/* No recommendations, factual only, 150 words max */`,
  brandOwnerContext: `/* Target audience: brand owners needing insights */`
}
```

### 2. Domain Configurations
```typescript
interface DomainConfig {
  role: string           // Specialized analyst role
  expertise: string      // Domain knowledge area
  keyMetrics: string[]   // Priority KPIs to focus on
  analysisApproach: string // Domain-specific methodology
  terminology: string[]  // Domain-specific terms to use
}
```

### 3. View Type Modifiers
```typescript
interface ViewTypeModifier {
  timeContext: string     // How to frame time/period context
  analysisDepth: string   // Overview vs deep-dive vs comparative
  focusArea: string      // What aspect to emphasize
}
```

### 4. Prompt Builder Function
```typescript
function buildTailoredPrompt(config: {
  domain: DomainConfig
  viewType: ViewTypeModifier
  shared: SharedComponents
  specificContext: string
  data: unknown
}): string
```

---

## Domain-Specific Configurations

### Keuangan (Financial) Domain
```typescript
const KEUANGAN_CONFIG: DomainConfig = {
  role: "analis keuangan bisnis yang mengkhususkan diri dalam analisis performa finansial restoran/F&B",
  expertise: "kesehatan finansial dan profitabilitas",
  keyMetrics: [
    "Target vs Aktual Achievement",
    "Profitability Ratios (GPM, NPM)",
    "Cost Structure (COGS)",
    "Revenue Trends",
    "Cost Control"
  ],
  analysisApproach: "financial ratio analysis, profitability assessment, cost structure evaluation",
  terminology: ["profitabilitas", "margin", "efisiensi operasional", "kontrol biaya", "kesehatan finansial"]
}
```

### Penjualan (Sales) Domain
```typescript
const PENJUALAN_CONFIG: DomainConfig = {
  role: "analis penjualan yang berfokus pada performa transaksi dan customer behavior",
  expertise: "pola penjualan dan perilaku konsumen",
  keyMetrics: [
    "Total Sales Volume",
    "Transaction Count",
    "Average Per Check (APC)",
    "Payment Method Distribution",
    "Channel Performance",
    "Customer Visit Patterns"
  ],
  analysisApproach: "sales trend analysis, customer pattern identification, channel effectiveness",
  terminology: ["transaksi", "customer behavior", "channel performance", "pola pembelian", "visit purpose"]
}
```

### Produk-Channel Domain
```typescript
const PRODUK_CHANNEL_CONFIG: DomainConfig = {
  role: "analis produk dan distribusi yang mengkhususkan diri dalam performa menu dan channel optimization",
  expertise: "performa produk dan efektivitas saluran distribusi",
  keyMetrics: [
    "Menu Performance Rankings",
    "Category Composition",
    "Channel Distribution",
    "Product Mix Analysis",
    "Top Performers Identification"
  ],
  analysisApproach: "product portfolio analysis, channel mix optimization, category performance evaluation",
  terminology: ["komposisi menu", "channel mix", "kategori produk", "product performance", "distribusi penjualan"]
}
```

### Investasi (Investment) Domain
```typescript
const INVESTASI_CONFIG: DomainConfig = {
  role: "analis investasi yang berfokus pada ROI dan evaluasi risiko bisnis",
  expertise: "return on investment dan analisis risiko",
  keyMetrics: [
    "Return on Investment (ROI)",
    "Risk Assessment",
    "Investment Performance",
    "Payback Period",
    "Risk-Return Profile"
  ],
  analysisApproach: "investment performance evaluation, risk analysis, ROI calculation",
  terminology: ["ROI", "return", "investasi", "risiko", "payback period", "portfolio performance"]
}
```

---

## View Type Specializations

### General Views
```typescript
const GENERAL_MODIFIER: ViewTypeModifier = {
  timeContext: "periode saat ini dengan fokus pada performa keseluruhan",
  analysisDepth: "comprehensive overview dengan highlight key metrics",
  focusArea: "snapshot performa bisnis secara menyeluruh"
}
```

### Waktu (Time-focused) Views
```typescript
const WAKTU_MODIFIER: ViewTypeModifier = {
  timeContext: "analisis time-series dengan fokus pada tren dan pola temporal",
  analysisDepth: "trend identification, seasonality patterns, growth analysis",
  focusArea: "perubahan dan pola dari waktu ke waktu, identifikasi tren signifikan"
}
```

### Cabang (Branch-focused) Views
```typescript
const CABANG_MODIFIER: ViewTypeModifier = {
  timeContext: "perbandingan antar cabang/lokasi dengan benchmarking analysis",
  analysisDepth: "comparative branch performance, ranking analysis, location insights",
  focusArea: "performance gaps antar cabang, best/worst performers, location-specific patterns"
}
```

---

## Implementation Roadmap

### Phase 1: Foundation Setup ✅
- [x] Extract shared components from existing `formatPromptForPage`
- [x] Create domain configuration interfaces
- [x] Implement one sample view (`general-keuangan`)

### Phase 2: Domain Implementation (Priority Order)
1. **Financial Views** (Most critical for business decisions)
   - [x] `general-keuangan` ✅ COMPLETED
   - [ ] `waktu-keuangan`
   - [ ] `cabang-keuangan`

2. **Sales Views** (High business impact)
   - [ ] `general-penjualan`
   - [ ] `waktu-penjualan`
   - [ ] `cabang-penjualan`

3. **Product-Channel Views** (Operational optimization)
   - [ ] `general-produk-channel`
   - [ ] `waktu-produk-channel`
   - [ ] `cabang-produk-channel`

4. **Investment Views** (Strategic decisions)
   - [ ] `general-investasi`
   - [ ] `cabang-investasi`

### Phase 3: Testing & Validation
- [ ] Create test prompts with sample data for each view
- [ ] Validate output quality and domain-specificity
- [ ] Compare AI responses: generic vs tailored prompts

### Phase 4: Documentation & Cleanup
- [ ] Document each prompt configuration
- [ ] Remove old `formatPromptForPage` function
- [ ] Update related code and references

---

## Code Templates

### 1. Domain-Specific Prompt Creator Template
```typescript
// Template for creating domain-specific prompt functions
function create[Domain][ViewType]Prompt(data: unknown): string {
  return buildTailoredPrompt({
    domain: [DOMAIN]_CONFIG,
    viewType: [VIEWTYPE]_MODIFIER,
    shared: SHARED_COMPONENTS,
    specificContext: "Detailed description of what this specific view contains",
    data
  })
}
```

### 2. Prompt Builder Function
```typescript
function buildTailoredPrompt(config: {
  domain: DomainConfig
  viewType: ViewTypeModifier
  shared: SharedComponents
  specificContext: string
  data: unknown
}): string {
  return trimMultiline(`
    **Peran dan Tujuan:**
    Anda adalah seorang ${config.domain.role}.
    Tugas utama Anda adalah menganalisis data dalam format JSON dan menyusun ringkasan faktual yang menyoroti ${config.domain.expertise}.
    **Fokus Anda murni pada ${config.viewType.focusArea}.**

    ${config.shared.brandOwnerContext}

    **Data Input:**
    Data akan diberikan dalam format JSON di bawah ini.
    ${config.specificContext}

    **Instruksi Utama (Proses Analisis Internal):**

    1. **Identifikasi Metrik Kunci:** Prioritaskan analisis pada:
       ${config.domain.keyMetrics.map(metric => `- **${metric}**`).join('\n       ')}

    2. **Analisis ${config.domain.expertise}:** ${config.domain.analysisApproach}
       - ${config.viewType.analysisDepth}
       - ${config.viewType.timeContext}

    3. **Sintesis Wawasan:** Menggunakan terminologi ${config.domain.terminology.join(', ')}

    -----

    ${config.shared.outputFormat}

    -----

    \`\`\`json
    ${JSON.stringify(config.data, null, 2)}
    \`\`\`
  `)
}
```

### 3. View Prompt Creator Update Pattern
```typescript
// Before
'view-name': (data: unknown) => formatPromptForPage({
  shortDescription: 'Generic description',
  data
}),

// After
'view-name': (data: unknown) => create[Domain][ViewType]Prompt(data),
```

---

## Testing Strategy

### 1. Prompt Quality Testing
```typescript
// Test with sample data to validate prompt quality
const sampleFinancialData = {
  targetVsActual: { revenue: { target: 1000000, actual: 1150000 }},
  ratios: { COGS: 45.2, GPM: 54.8, NPM: 34.8 }
}

// Compare outputs
const genericPrompt = formatPromptForPage({ shortDescription: "...", data: sampleData })
const tailoredPrompt = createGeneralKeuanganPrompt(sampleData)
```

### 2. AI Response Validation
- Feed identical data to generic vs tailored prompts
- Compare AI analysis quality and domain-specificity
- Validate that specialized prompts produce more relevant insights

### 3. Consistency Testing
- Ensure all views maintain same output format
- Verify shared rules are consistently applied
- Check that domain terminology is used appropriately

---

## Benefits

### 1. **Enhanced Analysis Quality**
- Domain experts provide more relevant insights
- Specialized terminology and context improve accuracy
- Focused metric prioritization highlights what matters most

### 2. **Better User Experience**
- Brand owners get insights tailored to their specific needs
- Financial views focus on profitability and health metrics
- Sales views emphasize customer behavior and patterns
- Time views highlight trends and seasonality

### 3. **Improved Maintainability**
- Modular design allows independent view customization
- Shared components ensure consistency
- Easy to add new views or modify existing ones

### 4. **Scalability**
- Framework supports new domains and view types
- Mix-and-match architecture for flexible combinations
- Reusable components reduce code duplication

### 5. **Professional Output**
- Domain-specific expertise in AI responses
- Appropriate business terminology usage
- Context-aware metric interpretation

---

## Implementation Notes

### Key Considerations
- Maintain exact same output format and restrictions
- Preserve brand owner context across all views
- Ensure consistent word count and structure requirements
- Keep shared components DRY (Don't Repeat Yourself)

### Error Prevention
- Type-safe interfaces for configurations
- Template validation for consistent structure
- Clear separation between shared and specific components

### Future Extensibility
- Easy to add new domains (e.g., `customer`, `inventory`)
- Support for new view types (e.g., `competitive`, `predictive`)
- Framework allows for A/B testing different prompt approaches

---

## Conclusion

This refactoring transforms the generic prompt system into a sophisticated, domain-aware analysis framework that provides brand owners with more relevant, accurate, and actionable business insights while maintaining consistency and professional output quality.

The modular architecture ensures that each view receives the specialized context it needs while sharing common formatting and rules, resulting in a better user experience and more effective business intelligence.
