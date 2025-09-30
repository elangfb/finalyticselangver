### 1) **Executive Summary (One Paragraph)**

This plan decomposes the monolithic app into a feature-first modular architecture that isolates side-effects, state, and rendering concerns while preserving behavior and public APIs. The refactor splits `src/main.ts:1` into cohesive feature modules (uploads, analysis, charts, PDF, admin, configuration), introduces thin service wrappers for Firebase, and reorganizes state into Zustand slices under `src/store/`. We respect a ≤ 400 LOC target per file by grouping symbols by domain and granularity (e.g., “charts/time”, “charts/channel”). Each step favors moves/extractions over rewrites, uses stable symbol names, and provides barrels to keep import surfaces compatible. Migration proceeds in small, idempotent PRs that build green and are reversible. Bundle size impact is controlled by centralizing Chart.js usage and shared utils and by enabling tree‑shakable module boundaries.

### 2) **Current State Inventory**

- `src/main.ts:1`
  - Responsibilities: Firebase init; auth and role UI; XLSX upload and processing; Firestore/Storage/Functions calls; analysis orchestration; view/selector initialization; dozens of Chart.js renderers; PDF report generation (html2canvas/jsPDF); AI analysis integration; modal/UI helpers.
  - Side-effects: DOM mutation, network I/O (Firebase), file I/O (uploads), timers, global Chart.js instances, PDF canvas rendering.
- `src/store.ts:1`
  - Responsibilities: Zustand vanilla store; view data management; large AnalysisState (data stores, flags, UI component refs, config) and actions; app-level actions and helpers.
  - Side-effects: Minimal (state only), but tightly coupled consumers in `main.ts`.
- `src/prompt.ts:1`
  - Responsibilities: Pure prompt builders per view; shared prompt snippets and creator map; placeholder chart prompts.
  - Side-effects: None (pure string assembly).

Top functions and hotspots (by responsibility/complexity; lines approximate):
- `generatePdfReport(progressCallback)`: PDF assembly and sequencing, calls many chart and insight functions (src/main.ts:7064).
- `generateGeneralPdfInsights(currentData, lastPeriodData)`: AI analysis prep + chart orchestration (src/main.ts:7248).
- `setupAndShowAnalysisView(data, title)`: end-to-end analysis view composition (src/main.ts:1935).
- `generatePnlOverviewChart(...)`, `generateHistoricalPnlTable(...)`, `generatePnlTargetComparisonTable(...)`: P&L chart/table builders (src/main.ts:3880–4189 region).
- `generateCabangAnalysis(...)` and “cabang/*” renderers (src/main.ts:5865, 6016+).
- `generatePenjualan*FromSummaries(...)` family and “heatmap/weekly/monthly” renderers (src/main.ts:4207–5685 region).
- `uploadAndProcessPnlFile(...)`, `handleModal*Upload(...)`: XLSX → Firestore flow (src/main.ts:427, 990, 1094).
- `loadUsersForAdmin(...)`, `deleteUserRecord(...)`: admin ops (src/main.ts:1433, 1563).
- `loadGeminiConfig`, `saveGeminiConfig`, `getGeminiAnalysis`: AI config + call (src/main.ts:1799–1883).
- `setupGeneral*Selectors()`, `populateFilters(...)`: SlimSelect wiring (src/main.ts:1977, 3379, 3839, 3851).

Pain points

| Concern | Location | Why Risky | Quick Note |
| ------- | -------- | --------- | ---------- |
| Monolithic core | src/main.ts:1 | 15k+ LOC; hard to reason/test | Split by feature and side-effect boundaries |
| Global state coupling | src/main.ts:1, src/store.ts:1 | Tight coupling via `$store` usage | Move to slices; export selectors/actions |
| Chart duplication | src/main.ts:4023+ and 7600+ | Web vs PDF charts duplicated | Introduce chart factory + shared datasets |
| DOM hardcodes | src/main.ts:1 | Many `getElementById`/IDs | Encapsulate in feature modules; constants for IDs |
| XLSX typed as any | src/main.ts:427 | Weak type safety | Add local DTO/types modules; keep runtime same |
| Mixed concerns | src/main.ts:1 | Network, DOM, compute interleaved | Services (network), features (DOM), utils (compute) |
| AI call in view logic | src/main.ts:1883 | Hard to stub/measure | Move to `services/ai` adapter; keep signature |
| Chart lifecycle leaks | src/main.ts:4740 create/destroy | Risk of memory leaks | Centralize destroy in chart factory |
| Admin ops inline | src/main.ts:1433/1563 | Security & role UX intermix | Extract admin feature |
| Build insight sprawl | src/prompt.ts:1 | Growing prompt surface | Keep pure; relocate to features/prompts

### 3) **Proposed Modular Architecture**

```
src/
  app/
    bootstrap/
      firebase.ts
      auth.ts
  views/
    auth-view.ts
    main-menu-view.ts
    sales-dashboard-view.ts
    konfigurasi-view.ts
    analysis/
      index.ts                # orchestrates sidebar + routing
      umum.ts                 # top-level overview panel
      analisa-penjualan.ts    # dedicated view
      analisa-pnl.ts          # dedicated view
      general/
        keuangan.ts
        penjualan.ts
        produk-channel.ts
        investasi.ts
      waktu/
        keuangan.ts
        penjualan.ts
        produk-channel.ts
      cabang/
        keuangan.ts
        penjualan.ts
        produk-channel.ts
        investasi.ts
  features/
    uploads/
      upload-sales.ts
      upload-sales-target.ts
      upload-pnl.ts
      upload-pnl-target.ts
      history.ts
    admin/
      users.ts
    analysis/
      setup.ts
      lib/
        metrics.ts
      sections/               # invoked by view controllers above (mirrors views)
        umum/
          umum.ts
          umum-setup.ts
        analisa-penjualan/
          analisa-penjualan.ts
          analisa-penjualan-setup.ts
        analisa-pnl/
          analisa-pnl.ts
          analisa-pnl-setup.ts
        general/
          keuangan.ts
          keuangan-setup.ts
          penjualan.ts
          penjualan-setup.ts
          produk-channel.ts
          produk-channel-setup.ts
          investasi.ts
          investasi-setup.ts
        waktu/
          keuangan.ts
          keuangan-setup.ts
          penjualan.ts
          penjualan-setup.ts
          produk-channel.ts
          produk-channel-setup.ts
        cabang/
          keuangan.ts
          keuangan-setup.ts
          penjualan.ts
          penjualan-setup.ts
          produk-channel.ts
          produk-channel-setup.ts
          investasi.ts
          investasi-setup.ts
      charts/
        time.ts
        channel.ts
        apc-tc.ts
        outlet.ts
    pdf/
      report.ts
      analyze.ts
      charts/
        time.ts
        channel.ts
        dine-in-cost.ts
        summary.ts
    prompts/
      view-prompts.ts
      index.ts
      chart-prompts.ts
  services/
    firestore.ts
    storage.ts
    functions.ts
    ai.ts
    global-config-service.ts
    analysis-cache-service.ts
  store/
    index.ts
    slices/
      view-data-slice.ts
      analysis-slice.ts
      charts-slice.ts
      config-slice.ts
  utils/
    dom.ts (keep)
    dom-selectors.ts
    chart/
      formatter.ts (move from utils/chart-formatter.ts)
      factory.ts
    number.ts (from string.ts number-ish)
    currency.ts (from string.ts)
    percent.ts (from string.ts)
    string.ts (keep non-numeric helpers)
    hash.ts (keep)
  components/
    PageSummary.ts (keep)
  types/
    sales.ts
    pnl.ts
    filters.ts
```

Why it fits and helps bundle size
- Feature-first modules reduce cross-import churn and enable lazy-loading later if desired.
- View controllers provide a one-file home per view and per tab/sub-view, aligning with the request and making event handlers and DOM selectors local and cohesive.
- Services isolate Firebase SDKs; only features that need them import adapters, enabling tree-shaking.
- Chart files split by domain avoid a single “charts” megafile; common scales/tooltip options live in `utils/chart/formatter.ts` and a `chart/factory.ts` wrapper that centralizes create/destroy.
- Store slices bound to domains reduce re-renders and make resets contained.

### 4) **Public Contracts (Signatures Only)**

| Module | Symbol | Kind | Purpose | Called From |
| ------ | ------ | ---- | ------- | ----------- |
| views/auth-view.ts | mountAuthView(): void; unmountAuthView(): void | functions | Wire login/signup UI | src/main.ts:auth listeners |
| views/main-menu-view.ts | mountMainMenuView(): void; unmountMainMenuView(): void | functions | Main menu buttons | src/main.ts:nav handlers |
| views/sales-dashboard-view.ts | mountSalesDashboardView(): void; unmountSalesDashboardView(): void | functions | Upload & history hub | src/main.ts:642, 6797 |
| views/konfigurasi-view.ts | mountKonfigurasiView(): void; unmountKonfigurasiView(): void | functions | Config UI and save/load | src/main.ts:1835 |
| views/analysis/index.ts | mountAnalysisView(): void; unmountAnalysisView(): void; setActiveSection(id: string): void | functions | Sidebar routing & lifecycle | src/main.ts:1935, 1977 |
| views/analysis/umum.ts | mountUmumSection(): void; unmountUmumSection(): void | functions | Overview cards + heatmaps | index.html:umum-section |
| views/analysis/analisa-penjualan.ts | mountAnalisaPenjualanSection(): void | function | Dedicated sales analysis tab | index.html links |
| views/analysis/analisa-pnl.ts | mountAnalisaPnlSection(): void | function | Dedicated P&L analysis tab | index.html links |
| views/analysis/general/keuangan.ts | mountGeneralKeuangan(): Promise<void> | function | General finance section | index.html:general-keuangan-section |
| views/analysis/general/penjualan.ts | mountGeneralPenjualan(): Promise<void> | function | General sales section | index.html:general-penjualan-section |
| views/analysis/general/produk-channel.ts | mountGeneralProdukChannel(): Promise<void> | function | General product/channel section | index.html:general-produk-channel-section |
| views/analysis/general/investasi.ts | mountGeneralInvestasi(): Promise<void> | function | General investment section | index.html:general-investasi-section |
| views/analysis/waktu/keuangan.ts | mountWaktuKeuangan(): Promise<void> | function | Time compare finance | index.html:waktu-keuangan-section |
| views/analysis/waktu/penjualan.ts | mountWaktuPenjualan(): Promise<void> | function | Time compare sales | index.html:waktu-penjualan-section |
| views/analysis/waktu/produk-channel.ts | mountWaktuProdukChannel(): Promise<void> | function | Time compare prod/channel | index.html:waktu-produk-channel-section |
| views/analysis/cabang/keuangan.ts | mountCabangKeuangan(): Promise<void> | function | Branch finance comparison | index.html:cabang-keuangan-section |
| views/analysis/cabang/penjualan.ts | mountCabangPenjualan(): Promise<void> | function | Branch sales comparison | index.html:cabang-penjualan-section |
| views/analysis/cabang/produk-channel.ts | mountCabangProdukChannel(): Promise<void> | function | Branch product/channel | index.html:cabang-produk-channel-section |
| views/analysis/cabang/investasi.ts | mountCabangInvestasi(): Promise<void> | function | Branch investment | index.html:cabang-investasi-section |
| app/bootstrap/firebase.ts | initFirebase(config: object): { app: any, auth: any, db: any, storage: any, functions: any } | function | Initialize and expose Firebase singletons | src/main.ts:1 (migrated callers) |
| app/bootstrap/auth.ts | onAuth(uiHandlers: { onUser(user: any): void; onAnon(): void }): () => void | function | Centralize auth state listener | src/main.ts:409 |
| app/bootstrap/auth.ts | ensureUserDocument(uid: string, email: string, role?: string): Promise<void> | function | Create user doc if needed | src/main.ts:1168 |
| features/uploads/upload-sales.ts | handleModalSalesDataUpload(file: File, expectedPeriod: string): Promise<void> | function | Modal upload handler for Sales data | src/main.ts:990 |
| features/uploads/upload-sales-target.ts | handleSalesTargetUpload(): Promise<void> | function | Handle Sales Target upload (manual) | src/main.ts:1267 |
| features/uploads/upload-sales-target.ts | handleModalSalesTargetUpload(file: File, expectedPeriod: string): Promise<void> | function | Modal upload handler for Sales Target (wraps bound type='sales') | src/main.ts:1094 |
| features/uploads/upload-sales-target.ts | downloadSalesTargetTemplate(): void | function | Download Sales Target template | src/main.ts:1345 |
| features/uploads/upload-pnl.ts | uploadAndProcessPnlFile(file: File, expectedPeriod?: string | null): Promise<string> | function | XLSX → Firestore pipeline for P&L | src/main.ts:427 |
| features/uploads/upload-pnl-target.ts | handlePnlTargetUpload(): Promise<void> | function | Handle P&L Target upload (manual) | src/main.ts:12199 |
| features/uploads/upload-pnl-target.ts | handleModalPnlTargetUpload(file: File, expectedPeriod: string): Promise<void> | function | Modal upload handler for P&L Target (wraps bound type='pnl') | src/main.ts:1094 |
| features/uploads/upload-pnl-target.ts | downloadPnlTargetTemplate(): Promise<void> | function | Download P&L Target template | src/main.ts:1378 |
| features/uploads/history.ts | loadUploadHistory(): Promise<void> | function | Load upload history | src/main.ts:6797 |
| features/uploads/history.ts | fetchDailySummariesForUpload(uploadId: string): Promise<any[]> | function | Fetch related summaries | src/main.ts:6856 |
| features/admin/users.ts | loadUsersForAdmin(): Promise<void> | function | Admin users table | src/main.ts:1433 |
| features/admin/users.ts | deleteUserRecord(userId: string): Promise<void> | function | Delete user record | src/main.ts:1563 |
| features/analysis/setup.ts | setupAndShowAnalysisView(data: any[], title: string): void | function | Compose analysis view | src/main.ts:1935 |
| views/analysis/index.ts | populateFilters(data: any[]): void | function | Populate base filters | src/main.ts:1977 |
| features/analysis/sections/general/keuangan.ts | generateGeneralKeuanganSection(): Promise<void> | function | Render general finance section | src/main.ts:3585 |
| features/analysis/sections/general/keuangan.setup.ts | setupGeneralKeuanganPeriodSelector(): Promise<void> | function | Section-specific filter setup | src/main.ts:3743 |
| features/analysis/sections/general/penjualan.ts | generatePenjualanOverview(): void | function | Monthly and channel overview | src/main.ts:2925,5685 |
| features/analysis/sections/general/penjualan.setup.ts | setupGeneralPenjualanSelectors(): Promise<void>; updatePeriodSelectorsForGeneralPenjualan(selectedBranch: string): Promise<void> | functions | Section-specific filter setup | src/main.ts:3839,3770 |
| features/analysis/sections/general/produk-channel.ts | generateProductChannelOverview(): void | function | Product/channel analytics | src/main.ts:2849,5725,5800 |
| features/analysis/sections/general/produk-channel-setup.ts | setupGeneralProdukChannelSelectors(): Promise<void> | function | Section-specific filter setup | src/main.ts:3851 |
| features/analysis/sections/waktu/penjualan.ts | generateYoYAndWeeklyComparison(): void | function | Period comparisons | src/main.ts:3506,3557 |
| features/analysis/sections/waktu/penjualan.setup.ts | setupWaktuPenjualanSelectors(): Promise<void>; updatePeriodSelectorsForPenjualan(selectedBranch: string): Promise<void> | functions | Section-specific filter setup | src/main.ts:3379,3412 |
| features/analysis/sections/cabang/keuangan.ts | generateCabangKeuanganSection(): Promise<void> | function | Branch finance compare | src/main.ts:3031 |
| features/analysis/sections/cabang/keuangan.setup.ts | setupCabangKeuanganSelectors(): Promise<void> | function | Section-specific filter setup | src/main.ts:2999 |
| features/analysis/sections/cabang/penjualan.ts | generateCabangPenjualanSection(): void | function | Branch sales compare | src/main.ts:3073 |
| features/analysis/sections/cabang/penjualan.setup.ts | setupCabangPenjualanSelectors(): Promise<void> | function | Section-specific filter setup | src/main.ts:3103 |
| features/analysis/charts/time.ts | generatePenjualanBulananChartFromSummaries(summaries: any[], canvasId: string): void | function | Monthly sales chart | src/main.ts:2925 |
| features/analysis/charts/channel.ts | generatePenjualanChannelChartFromSummaries(summaries: any[]): void | function | Channel charts | src/main.ts:5685 |
| features/analysis/charts/apc-tc.ts | generateTcApcHarianChartFromSummaries(summaries: any[]): void | function | APC/TC daily | src/main.ts:4626 |
| features/analysis/charts/outlet.ts | generateOmzetOutletChartFromSummaries(summaries: any[]): void | function | By outlet | src/main.ts:4273 |
| pdf/report.ts | generatePdfReport(progress: (current: number, total: number) => void): Promise<void> | function | PDF orchestration | src/main.ts:7064 |
| pdf/analyze.ts | analyzeChart(chartId: string): Promise<void> | function | Chart analysis call | src/main.ts:7169 |
| pdf/analyze.ts | generateGeneralPdfInsights(currentData: any[], lastPeriodData: any[]): Promise<void> | function | AI+chart insights | src/main.ts:7248 |
| pdf/charts/time.ts | generateSalesTrendHourlyDailyChart(data: any[]): void | function | PDF time charts | src/main.ts:7606 |
| pdf/charts/channel.ts | generateChannelWeeklyChart(data: any[]): void | function | PDF channel charts | src/main.ts:7695 |
| pdf/charts/dine-in-cost.ts | generateHppHarianChart(data: any[]): void | function | PDF cost charts | src/main.ts:8238 |
| pdf/charts/summary.ts | generateDailyRevenueChart(data: any[], canvasId: string): void | function | PDF summaries | src/main.ts:9830 |
| services/firestore.ts | getUserRoleAndSetupUI(user: any): Promise<void> | function | Extracted UI+role side effects | src/main.ts:409 |
| services/functions.ts | call<T>(name: string, payload?: unknown): Promise<T> | function | Wrap httpsCallable | src/main.ts:– (new) |
| services/storage.ts | upload(file: File, path: string, onProgress?: (p: number) => void): Promise<string> | function | Wrap uploadBytesResumable | src/main.ts:427 |
| services/ai.ts | getGeminiAnalysis(prompt: string): Promise<{ summaryText: string, usageMetadata: any }> | function | Isolate AI call | src/main.ts:1883 |
| prompts/view-prompts.ts | viewPromptCreators: Record<string,(data: unknown) => string> | const | Rehome from src/prompt.ts | src/prompt.ts:566–605 |
| prompts/chart-prompts.ts | chartPrompts: Record<string,string> | const | Rehome placeholders | src/prompt.ts:568–589 |
| prompts/index.ts | viewPromptCreators, chartPrompts, prompts | re-export | Compat barrel to preserve `@/prompt` import | src/components/PageSummary.ts:1 |
| features/analysis/lib/metrics.ts | setupAnalysis(current: any[], last: any[]): void | function | Compute comparison metrics | src/analysis.ts:1 |
| features/analysis/lib/metrics.ts | calculateComparison(current: number, previous: number): { upOrDown: string; percentage: string; plusOrMinus: string; difference: string } | function | Comparison util | src/analysis.ts:1 |
| utils/dom-selectors.ts | DOM_SELECTORS: Record<string,string> | const | Centralizes DOM id/data-target strings | various |
| utils/chart/factory.ts | type Chart, type ChartDataset, type ChartOptions, createChart, destroyCharts | types+functions | Re-export Chart.js types for callers; central create/destroy | charts across app |
| pdf/report.ts | type JsPdf, type Html2CanvasOptions | type re-export | Re-export external PDF-related types for callers | PDF features |
| types/sales.ts | SalesDataRow | type | Sales row type | used by charts/metrics |
| types/pnl.ts | PnlReport | type | P&L report type | used by finance sections |
| types/filters.ts | ViewFilters | type | Filters used in views | used by views/sections |
| store/index.ts | store: Store; getStore<K>(key: K): any; setStoreKV<K>(key: K, v: any): void | functions | Barrel of slices | src/store.ts:1 |
| store/slices/* | slice initializers and actions | functions | Split Analysis/View/Config | src/store.ts:1 |

Notes
- Symbol names remain stable where possible; new wrappers are additive.
- Barrels (`index.ts`) re-export to minimize churn.

### 5) **File-by-File Plan (≤400 LOC)**

| New File Path | From (file:lines) | Main Symbols | Est. LOC | Change Type | Notes |
| ------------- | ------------------ | ------------ | -------: | ----------- | ----- |
| views/auth-view.ts | src/main.ts:1864–1883 | mountAuthView, unmountAuthView | 120 | extract | Auth form events, error blocks |
| views/main-menu-view.ts | src/main.ts:– (nav handlers) | mountMainMenuView, unmountMainMenuView | 60 | extract | Button wiring to `showView` |
| views/sales-dashboard-view.ts | index.html:393+, src/main.ts:642,6797 | mountSalesDashboardView, unmountSalesDashboardView | 160 | extract | Quick upload modal + history list |
| views/konfigurasi-view.ts | src/main.ts:1799–1864 | mountKonfigurasiView, unmountKonfigurasiView | 160 | extract | load/save Gemini config UI |
| views/analysis/index.ts | src/main.ts:1935–2068,3379–3412 | mountAnalysisView, unmountAnalysisView, setActiveSection | 240 | extract | Sidebar, filter routing, reset |
| views/analysis/umum.ts | src/main.ts:4496–5169 | mountUmumSection | 240 | extract | Overview metrics + heatmaps |
| views/analysis/analisa-penjualan.ts | src/main.ts:2849–2968 | mountAnalisaPenjualanSection | 180 | extract | Menu trend daily charts |
| views/analysis/analisa-pnl.ts | src/main.ts:2356–2638 | mountAnalisaPnlSection | 220 | extract | P&L tables + period selector |
| views/analysis/general/keuangan.ts | src/main.ts:3585–4189 | mountGeneralKeuangan | 360 | extract | Uses sections/generalKeuangan |
| views/analysis/general/penjualan.ts | src/main.ts:2925–3068 | mountGeneralPenjualan | 240 | extract | Monthly + channel charts |
| views/analysis/general/produk-channel.ts | src/main.ts:3851,4207,5725–6016 | mountGeneralProdukChannel | 320 | extract | Product/Channel charts |
| views/analysis/general/investasi.ts | src/main.ts:— | mountGeneralInvestasi | 120 | new | Placeholder (if present) |
| views/analysis/waktu/keuangan.ts | src/main.ts:3743–3839 | mountWaktuKeuangan | 200 | extract | Selector + compare |
| views/analysis/waktu/penjualan.ts | src/main.ts:3412–3557 | mountWaktuPenjualan | 200 | extract | YoY, weekly compare |
| views/analysis/waktu/produk-channel.ts | src/main.ts:— | mountWaktuProdukChannel | 160 | new | If UI present |
| views/analysis/cabang/keuangan.ts | src/main.ts:2999–3314 | mountCabangKeuangan | 280 | extract | Branch finance compare |
| views/analysis/cabang/penjualan.ts | src/main.ts:3073–3260 | mountCabangPenjualan | 240 | extract | Branch trend compare |
| views/analysis/cabang/produk-channel.ts | src/main.ts:6016–6211 | mountCabangProdukChannel | 260 | extract | Branch product/channel |
| views/analysis/cabang/investasi.ts | src/main.ts:— | mountCabangInvestasi | 120 | new | If UI present |
| app/bootstrap/firebase.ts | src/main.ts:1 | initFirebase | 80 | extract function | Single init + singleton exports |
| app/bootstrap/auth.ts | src/main.ts:409,1168 | onAuth, ensureUserDocument | 140 | extract functions | Keep callback structure identical |
| services/firestore.ts | src/main.ts:333–3912 | getUserRoleAndSetupUI, PnL read/write helpers | 280 | extract + adapter | Centralize doc/collection/query code |
| services/storage.ts | src/main.ts:427 | upload | 80 | adapter | uploadBytesResumable wrapper |
| services/functions.ts | src/main.ts:– | call | 40 | new adapter | Wrap `httpsCallable` generic |
| services/ai.ts | src/main.ts:1799–1883 | loadGeminiConfig, saveGeminiConfig, loadCurrentApiKey, getGeminiAnalysis | 180 | extract | Keeps same return shapes |
| features/uploads/upload-sales.ts | src/main.ts:990 | handleModalSalesDataUpload | 120 | extract | Sales data (XLSX) modal upload |
| features/uploads/upload-sales-target.ts | src/main.ts:1267,1345,1094 | handleSalesTargetUpload, downloadSalesTargetTemplate, handleModalSalesTargetUpload | 180 | extract (+thin wrapper) | Wrapper binds `type='sales'` to original modal handler |
| features/uploads/upload-pnl.ts | src/main.ts:427 | uploadAndProcessPnlFile | 160 | extract | P&L data upload & processing |
| features/uploads/upload-pnl-target.ts | src/main.ts:12199,1378,1094,12162 | handlePnlTargetUpload, downloadPnlTargetTemplate, handleModalPnlTargetUpload, getPeriodFromFile | 200 | extract (+thin wrapper) | Expose `getPeriodFromFile` for reuse |
| features/uploads/history.ts | src/main.ts:6797,6856 | loadUploadHistory, fetchDailySummariesForUpload | 120 | extract | Read-only Firestore queries |
| features/admin/users.ts | src/main.ts:1433,1563 | loadUsersForAdmin, deleteUserRecord | 120 | extract | Role-gated ops |
| features/analysis/setup.ts | src/main.ts:1935,2183 | setupAndShowAnalysisView, runAnalysis | 240 | extract | Orchestrates sections |
| features/analysis/sections/general/keuangan.ts | src/main.ts:3585,3880–4189 | generateGeneralKeuanganSection | 300 | extract | Finance overview + charts |
| features/analysis/sections/general/keuangan.setup.ts | src/main.ts:3743 | setupGeneralKeuanganPeriodSelector | 100 | extract | Section filter setup |
| features/analysis/sections/general/penjualan.ts | src/main.ts:2925,4207,5685 | generatePenjualanOverview | 300 | extract | Monthly + channel charts |
| features/analysis/sections/general/penjualan.setup.ts | src/main.ts:3770,3839 | updatePeriodSelectorsForGeneralPenjualan, setupGeneralPenjualanSelectors | 140 | extract | Section filter setup |
| features/analysis/sections/general/produk-channel.ts | src/main.ts:2849,5725,5800 | generateProductChannelOverview | 260 | extract | Product/channel charts |
| features/analysis/sections/general/produk-channel-setup.ts | src/main.ts:3851 | setupGeneralProdukChannelSelectors | 80 | extract | Section filter setup |
| features/analysis/sections/waktu/penjualan.ts | src/main.ts:3506,3557 | generateYoYAndWeeklyComparison | 180 | extract | Period comparisons |
| features/analysis/sections/waktu/penjualan.setup.ts | src/main.ts:3379,3412 | setupWaktuPenjualanSelectors, updatePeriodSelectorsForPenjualan | 140 | extract | Section filter setup |
| features/analysis/sections/cabang/keuangan.ts | src/main.ts:3031,3314 | generateCabangKeuanganSection | 220 | extract | Branch finance compare |
| features/analysis/sections/cabang/keuangan.setup.ts | src/main.ts:2999 | setupCabangKeuanganSelectors | 80 | extract | Section filter setup |
| features/analysis/sections/cabang/penjualan.ts | src/main.ts:3073,3260 | generateCabangPenjualanSection | 220 | extract | Branch sales trends |
| features/analysis/sections/cabang/penjualan.setup.ts | src/main.ts:3103 | setupCabangPenjualanSelectors | 80 | extract | Section filter setup |
| features/analysis/charts/time.ts | src/main.ts:2925,3506,3557,4023 | generatePenjualanBulananChartFromSummaries, generateWeeklyTrendComparisonChart, generatePnlOverviewChart | 320 | extract | Non-PDF time series |
| features/analysis/charts/channel.ts | src/main.ts:5685,9020–9428 | generatePenjualanChannelChartFromSummaries, channel trend charts | 360 | extract | Non-PDF channel charts |
| features/analysis/charts/apc-tc.ts | src/main.ts:4626,7828–8086 | generateTcApcHarianChartFromSummaries, APC/TC trends | 320 | extract | Non-PDF APC/TC |
| features/analysis/charts/outlet.ts | src/main.ts:4273,9784–9928 | generateOmzetOutletChartFromSummaries, branch contribution/performance | 320 | extract | Non-PDF outlet charts |
| pdf/report.ts | src/main.ts:7018,7064 | setupPageSummary wiring, generatePdfReport | 220 | extract | Keeps progress callback semantics |
| pdf/analyze.ts | src/main.ts:7169,7248 | analyzeChart, generateGeneralPdfInsights | 240 | extract | AI+chart insights |
| pdf/charts/time.ts | src/main.ts:7606,8605–8723,10309 | generateSalesTrendHourlyDailyChart, generateSalesTrendHourDayChart, generatePdfSalesTrendByHourChart | 360 | extract | PDF time charts |
| pdf/charts/channel.ts | src/main.ts:7653–7750,9020–9428,10471 | channel charts, stacked channel | 360 | extract | PDF channel charts |
| pdf/charts/dine-in-cost.ts | src/main.ts:8141–8330,10551,11154–11356 | dine-in increase, HPP/food cost, HPP analysis | 360 | extract | PDF dine-in & cost |
| pdf/charts/summary.ts | src/main.ts:9830–9996,10097–10235 | revenue, performance, customer/weekend insights | 360 | extract | PDF summary & insights |
| prompts/view-prompts.ts | src/prompt.ts:1–605 | viewPromptCreators + shared snippets | 380 | move only | No behavior change |
| prompts/chart-prompts.ts | src/prompt.ts:566–605 | chartPrompts | 40 | move only | Placeholders intact |
| prompts/index.ts | new | re-export viewPromptCreators, chartPrompts, prompts | 20 | add compat barrel | Preserve `@/prompt` imports |
| src/prompt.ts | src/prompt.ts:1–end | re-export from `prompts/index.ts` | 20 | wrap adapter | Keep path stable during migration |
| store/index.ts | src/store.ts:1 | createStore, setStoreKV, setStorePartial | 140 | extract | Barrel + root init |
| store/slices/view-data-slice.ts | src/store.ts:1 | viewData, set/clear/trySetFromExistingViewData | 200 | extract | View data mgmt |
| store/slices/analysis-slice.ts | src/store.ts:1 | analysisState, flags/components/config updaters | 320 | extract | Analysis state |
| store/slices/charts-slice.ts | src/main.ts:4740 | charts map, destroyCharts | 140 | extract | Chart lifecycle |
| store/slices/config-slice.ts | src/main.ts:1799–1864 | gemini/api config values | 120 | extract | Config-only |
| utils/chart/factory.ts | src/main.ts:4769,4740 | createChart, destroyCharts | 180 | extract | Single Chart registry |
| utils/chart/formatter.ts | src/utils/chart-formatter.ts:1 | rehome unchanged | 200 | move only | Keep exports stable |
| utils/number.ts | src/utils/string.ts:1 | formatNumber, truncateToFixed | 140 | extract | Numeric helpers |
| utils/currency.ts | src/utils/string.ts:1 | formatCurrency, shortenCurrency | 160 | extract | Currency helpers |
| utils/percent.ts | src/utils/string.ts:1 | formatDecimalBasedPercentage, formatIntBasedPercentage | 120 | extract | Percentage helpers |
| features/analysis/lib/metrics.ts | src/analysis.ts:1 | setupAnalysis, calculateComparison | 200 | move only | Shared analysis computations |
| utils/dom-selectors.ts | new | DOM_SELECTORS | 40 | new | Centralize selectors to avoid string drift |
| types/sales.ts | new | SalesDataRow | 40 | new | Minimal interface(s) only |
| types/pnl.ts | new | PnlReport | 40 | new | Minimal interface(s) only |
| types/filters.ts | new | ViewFilters | 40 | new | Minimal interface(s) only |
| src/store.ts | src/store.ts:1–end | re-export from `store/index.ts` | 20 | wrap adapter | Compat barrel for `@/store` imports |
| services/global-config-service.ts | src/services/globalConfigService.ts:1 | globalConfigService API | 0 | rename only | Update imports across codebase |
| services/analysis-cache-service.ts | src/services/analysisCacheService.ts:1 | findLiveCache, createLiveCache, deactivateHistoricalCache | 0 | rename only | Update imports across codebase |

Notes
- Large groups split across multiple files to stay ≤ 400 LOC.
- Where original code interleaves DOM+compute, adapters wrap DOM concerns; compute moves to utils/features.

### 6) **Dependency & Import Map**

Before
- `src/main.ts:1` imports many utils/services directly; defines most renderers inline; calls Firebase SDKs; manipulates DOM and state.
- Chart.js used ad‑hoc; destroy handled in scattered places (`destroyCharts`).

After
- Features import: `services/*`, `store/*`, and `utils/*` only; no cross‑feature imports.
- `chart/factory.ts` is the single Chart.js entry; features call `createChart` and `destroyById` from there.
- Service adapters (`firestore`, `storage`, `functions`, `ai`) encapsulate SDKs; only they reference Firebase APIs.
- `store` re-exports slice actions/selectors from a barrel; features do not import vanilla store directly.

Cycle break strategies
- Dependency inversion: features depend on `services/*` interfaces; avoid features calling features.
- Barrel files: `store/index.ts`, `features/analysis/charts/index.ts` to prevent deep imports.
- Event boundary: auth → callbacks into UI module instead of reaching into feature internals.
- Thin-view rule: `views/analysis/*` must not be imported by `features/*`. Views call features, never the reverse.
- Prefer focused barrels over facades: if import sprawl appears, add small `index.ts` files within the relevant folder (e.g., `features/analysis/charts/index.ts`) to re-export a stable surface. Avoid a central “facade” unless there’s a concrete need.
- Extract shared compute: when any two modules depend on the same logic, move it into `lib/*`, `utils/*`, or `types/*` so features depend on shared lib, not each other.
- Split barrels: avoid mega `index.ts` files that pull in too much and introduce cycles. Use narrow sub-barrels or direct imports from leaf modules across the codebase.

### 7) **Incremental Migration Plan (PR-by-PR)**

PR 1 — Bootstrap & services skeleton (idempotent)
- Scope: Add `app/bootstrap/*`, `services/*` with thin wrappers; rename legacy services to kebab-case; no behavior changes.
- Files: add modules + re-export minimal stubs; rename `src/services/globalConfigService.ts` → `global-config-service.ts`, `src/services/analysisCacheService.ts` → `analysis-cache-service.ts`; update all imports; keep `src/main.ts:1` intact.
- Checks: `pnpm build`, app loads; no import changes.
- Rollback: delete new files.

PR 2 — View controllers (per view + per tab)
- Scope: Add `src/views/*` and `src/views/analysis/*` files that encapsulate DOM selectors, event handlers, and call into existing feature functions; keep `showView` delegating to these mount/unmounts.
- Files: view controllers listed above; light edits in `src/main.ts:1` to call `mount*/unmount*`.
- Checks: Navigating between views switches content correctly; analysis sidebar routes to the right tab.
- Rollback: revert to inline handlers.
- Lifecycle checklist for each view: 1) attach DOM listeners on mount and remove on unmount, 2) destroy charts for owned canvas IDs via chart factory, 3) reset only owned store slices on unmount, 4) avoid cross-feature imports.

PR 3 — Chart factory + central destroy
- Scope: Extract `createChart` and `destroyCharts` to `utils/chart/factory.ts`; replace internal calls in `src/main.ts:4740,4769` with factory usage.
- Files moved: 1 new util file, minor edits in `src/main.ts:1`.
- Checks: All charts still render; memory stable on view switch.
- Rollback: revert to inline functions.

PR 4 — Uploads feature extraction
- Scope: Move `uploadAndProcessPnlFile`, modal handlers, templates, history.
- Files: `features/uploads/*` from lines `src/main.ts:427, 990, 1094, 12162, 12199, 1267, 1345, 1378, 6797, 6856`.
- Checks: Upload flows untouched; role gating intact.
- Rollback: re-inline moved functions.

PR 5 — Admin users + auth bootstrap
- Scope: Extract `loadUsersForAdmin`, `deleteUserRecord`, `ensureUserDocument`, and auth subscription.
- Files: `features/admin/users.ts`, `app/bootstrap/auth.ts`.
- Checks: Admin page works; login/logout behavior unchanged.
- Rollback: re-inline.

PR 6 — Analysis scaffolding and per-section setup
- Scope: Extract `setupAndShowAnalysisView` and `populateFilters`; create per-section `*.setup.ts` co-located under `features/analysis/sections/**` for each analysis section.
- Files: `features/analysis/setup.ts`, `views/analysis/index.ts`, all `features/analysis/sections/**-setup.ts` files listed in the File Plan; move `src/analysis.ts` → `features/analysis/lib/metrics.ts` and update imports.
- Checks: Analysis tab renders; filters interact correctly per section; no cross-section leakage.
- Rollback: re-inline extracted modules.

PR 7 — Web charts (non-PDF)
- Scope: Move non-PDF chart builders into `features/analysis/charts/*` and sections into `features/analysis/sections/*`.
- Files: as table; imports updated to call moved functions.
- Checks: Charts render; destroy works on nav; bundle compiles.
- Rollback: revert imports to originals.

PR 8 — PDF pipeline
- Scope: Move `generatePdfReport`, `analyzeChart`, PDF charts to `pdf/*` modules; wire from main.
- Files: `pdf/*` as table.
- Checks: PDF export OK; progress callback accurate; no UI regressions.
- Rollback: re-inline.

PR 9 — Store slices
- Scope: Split `src/store.ts:1` into `store/index.ts` and `store/slices/*`.
- Files: as table; add barrel that matches existing exports to avoid call-site drift.
- Checks: State persists; view navigation reset works; no runtime errors.
- Rollback: point barrel back to original store.

PR 10 — Prompts compat cleanup
- Scope: Remove `src/prompt.ts` wrapper and switch remaining imports from `@/prompt` to `@/prompts` (or `@/prompts/index`).
- Files: delete `src/prompt.ts`; update imports in components and features; keep `prompts/index.ts` as the canonical entry.
- Checks: Build succeeds; PageSummary and any AI usage still work; no duplicate symbol definitions.
- Rollback: restore wrapper file and revert import changes.

PR 11 — Store compat cleanup
- Scope: Remove `src/store.ts` compat wrapper and switch imports to `@/store/index` (or barrel `@/store` if maintained within `store/`).
- Files: delete `src/store.ts`; update imports across app; ensure `store/index.ts` remains the canonical entry.
- Checks: Build succeeds; views/features compile; no duplicate exports.
- Rollback: restore wrapper file and revert import changes.

### 8) **Test & Verification Strategy**

| Area | Test Type | Why | Tooling | Removal Criteria |
| ---- | --------- | --- | ------- | ---------------- |
| Build & bundle | Smoke build | Catch type/import regressions | `pnpm build --reporter=ndjson` or `--detailed-report` | Always keep |
| Charts | Runtime assert | Ensure chart factory registers/destroys | Lightweight dev flag logs + manual | Keep until stable |
| Uploads | Manual checklist | XLSX upload, history, targets | Real-world flow in dev | Keep as doc |
| PDF | Manual export check | Multi-page export correctness | Verify PDF opens, counts match | Keep as doc |
| Store | Type-level | Slice actions/selectors compile | TypeScript | Always keep |
| AI call | Stub harness | Stable signature and error surface | Replace `getGeminiAnalysis` with stub in dev | Keep stub option |

### 9) **Risk Register & Mitigations**

| Risk | Trigger | Impact | Mitigation | Owner |
| ---- | ------- | ------ | ---------- | ----- |
| Hidden side-effects in main | Move across modules | Subtle regressions | Move small, add runtime asserts/logs per PR | Refactorer |
| Chart leaks | Missed destroy on nav | Memory bloat | Central factory + slice tracking | Refactorer |
| Firebase auth timing | Splitting auth | UI flicker | Keep onAuth wrapper with same lifecycle | Refactorer |
| PDF canvas dimension breaks | Module move | Layout mismatch | Snapshot manual checks for key charts | Refactorer |
| Type erosion (`any`) | Module boundaries | Harder maintenance | Introduce local `types/*` gradually (no behavioral change) | Refactorer |
| Parcel aliasing | New paths | Import resolve errors | Use existing TS path `@/*`; add Parcel alias only if needed | Refactorer |

### 10) **Tooling & Operational Notes**

- Enforce ≤ 400 LOC via ESLint `max-lines` for TS files (optional new config block) and CI warning, not blocking at first.
- Keep TS path alias `@/*` (already configured in tsconfig.json: `tsconfig.json:1`). If Parcel requires, add equivalent alias in package.json `alias` field or `.parcelrc` (no dep changes).
- Add lightweight script: `pnpm build:report` → `parcel build --detailed-report` to watch bundle size changes.
- Prefer domain barrels (`index.ts`) to avoid import churn and to encourage tree-shaking.
- Naming conventions: PascalCase only for components (e.g., `components/PageSummary.ts`); kebab-case for all other file names (e.g., `views/main-menu-view.ts`, `features/uploads/upload-sales-target.ts`, `services/global-config-service.ts`). Also rename legacy services to kebab-case now: `global-config-service.ts`, `analysis-cache-service.ts` (update imports).
- Chart/PDF instantiation rule: Only create/destroy Chart.js instances via `utils/chart/factory.ts` and only invoke html2canvas/jsPDF within `pdf/report.ts` (and subcharts). All feature code must call these wrappers to preserve tree-shaking and prevent leaks.
 - Selective Chart.js registration: In `utils/chart/factory.ts`, register only used controllers/scales/elements/plugins (e.g., LineController, BarController, CategoryScale, LinearScale, Tooltip, Legend). Avoid importing the full Chart bundle to keep size down.

### 11) **Acceptance Criteria & Success Metrics**

- All new files ≤ 400 LOC (exceptions documented; none planned at this stage).
- `pnpm build` and `pnpm dev` remain green with identical runtime behaviors.
- No regressions in: login/logout, uploads, analysis/charts rendering, PDF export, admin user management.
- Bundle size unchanged or smaller; Chart.js not duplicated; shared utils reused.
- Store updates do not cause unnecessary re-renders; analysis view resets cleanly.

### 12) **Handoff Packet**

Essential artifacts
- File Plan table above (authoritative for moves/extractions).
- Public Contracts table (signatures to implement and export).
- PR-by-PR checklist (8 PRs with scopes and checks).
- Ordering constraints: do PRs 1→8 in order; do not interleave PDF extraction (PR 7) before web chart extraction (PR 6).

Implementation tips
- Start each PR by adding barrels that re-export old names; switch call-sites last.
- For every extracted function: 1) move code, 2) import into `src/main.ts:1`, 3) re-export through a stable surface if needed.
- Keep Chart.js options shared via `utils/chart/formatter.ts` and use `factory.ts` for all instantiation.

-----

RefactorPlan (machine-readable)

```json
{
  "modules": {
    "app/bootstrap": ["firebase.ts", "auth.ts"],
    "views": [
      "auth-view.ts", "main-menu-view.ts", "sales-dashboard-view.ts", "konfigurasi-view.ts",
      "analysis/index.ts", "analysis/umum.ts", "analysis/analisa-penjualan.ts", "analysis/analisa-pnl.ts",
      "analysis/general/keuangan.ts", "analysis/general/penjualan.ts", "analysis/general/produk-channel.ts", "analysis/general/investasi.ts",
      "analysis/waktu/keuangan.ts", "analysis/waktu/penjualan.ts", "analysis/waktu/produk-channel.ts",
      "analysis/cabang/keuangan.ts", "analysis/cabang/penjualan.ts", "analysis/cabang/produk-channel.ts", "analysis/cabang/investasi.ts"
    ],
    "features/uploads": ["upload-sales.ts", "upload-sales-target.ts", "upload-pnl.ts", "upload-pnl-target.ts", "history.ts"],
    "features/admin": ["users.ts"],
    "features/analysis": [
      "setup.ts",
      "sections/umum/umum.ts", "sections/umum/umum-setup.ts",
      "sections/analisa-penjualan/analisa-penjualan.ts", "sections/analisa-penjualan/analisa-penjualan-setup.ts",
      "sections/analisa-pnl/analisa-pnl.ts", "sections/analisa-pnl/analisa-pnl-setup.ts",
      "sections/general/keuangan.ts", "sections/general/keuangan-setup.ts",
      "sections/general/penjualan.ts", "sections/general/penjualan-setup.ts",
      "sections/general/produk-channel.ts", "sections/general/produk-channel-setup.ts",
      "sections/general/investasi.ts", "sections/general/investasi-setup.ts",
      "sections/waktu/keuangan.ts", "sections/waktu/keuangan-setup.ts",
      "sections/waktu/penjualan.ts", "sections/waktu/penjualan-setup.ts",
      "sections/waktu/produk-channel.ts", "sections/waktu/produk-channel-setup.ts",
      "sections/cabang/keuangan.ts", "sections/cabang/keuangan-setup.ts",
      "sections/cabang/penjualan.ts", "sections/cabang/penjualan-setup.ts",
      "sections/cabang/produk-channel.ts", "sections/cabang/produk-channel-setup.ts",
      "sections/cabang/investasi.ts", "sections/cabang/investasi-setup.ts",
      "charts/time.ts", "charts/channel.ts", "charts/apc-tc.ts", "charts/outlet.ts"
    ],
    "pdf": [
      "report.ts", "analyze.ts",
      "charts/time.ts", "charts/channel.ts", "charts/dine-in-cost.ts", "charts/summary.ts"
    ],
    "prompts": ["view-prompts.ts", "chart-prompts.ts"],
    "services": ["firestore.ts", "storage.ts", "functions.ts", "ai.ts", "global-config-service.ts", "analysis-cache-service.ts"],
    "store": ["index.ts", "slices/view-data-slice.ts", "slices/analysis-slice.ts", "slices/charts-slice.ts", "slices/config-slice.ts"],
    "utils": ["chart/factory.ts", "chart/formatter.ts", "number.ts", "currency.ts", "percent.ts"]
  },
  "prs": [
    { "title": "Bootstrap & services skeleton", "scope": ["app/bootstrap/*", "services/*"], "idempotent": true },
    { "title": "View controllers (per view & tab)", "scope": ["views/*", "views/analysis/*"], "idempotent": true },
    { "title": "Chart factory + central destroy", "scope": ["utils/chart/factory.ts"], "idempotent": true },
    { "title": "Extract uploads feature", "scope": ["features/uploads/*"], "idempotent": true },
    { "title": "Admin & auth extraction", "scope": ["features/admin/*", "app/bootstrap/auth.ts"], "idempotent": true },
    { "title": "Analysis scaffolding & per-section setup", "scope": ["features/analysis/setup.ts", "views/analysis/index.ts", "features/analysis/sections/**/*.setup.ts"], "idempotent": true },
    { "title": "Web charts & sections", "scope": ["features/analysis/sections/*", "features/analysis/charts/*"], "idempotent": true },
    { "title": "PDF pipeline extraction", "scope": ["pdf/*"], "idempotent": true },
    { "title": "Store slices", "scope": ["store/*"], "idempotent": true },
    { "title": "Prompts compat cleanup", "scope": ["prompts/index.ts", "src/prompt.ts", "all imports"], "idempotent": true },
    { "title": "Store compat cleanup", "scope": ["store/index.ts", "src/store.ts", "all imports"], "idempotent": true }
  ]
}
```
