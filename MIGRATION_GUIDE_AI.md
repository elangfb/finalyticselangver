# AI Migration Guide: Implementing the `alsoStore` Pattern

**Objective:** Your task is to refactor all "Aspek" views to use the new `alsoStore` data storage pattern. This is a critical task to reduce AI prompt sizes and resolve token limit errors. Follow the steps in this guide precisely for each "Aspek" view.

## 1. Core Concepts & Rules

### The Problem
The old method of using `setActiveViewData` stores large, raw data objects (like arrays of daily sales summaries). When this data is used to generate an AI analysis prompt, the entire object is serialized, leading to excessively large prompts that exceed the model's token limits.

### The Solution
We will now employ a more intelligent, granular approach:
1.  **Minimal Initial Context:** Instead of storing all raw data upfront, we will first store a minimal `viewContext` containing only essential metadata (filters, date ranges, selected branch, etc.).
2.  **Incremental Data Storage:** As UI components (charts, tables) are rendered, they will use a special `alsoStore` function. This function takes the specific data being rendered, transforms it into a compact, AI-friendly format, and merges it into the central store for that view.

This ensures the data stored for the AI is structured, relevant, and concise.

### Key Functions & Rules
- **`clearViewData(viewId: string)`:** MUST be called at the beginning of every "Aspek" generation function. It resets the data for the view, preventing data from previous renders or different filter settings from contaminating the current state.
- **`createAlsoStoreFn(store, viewId)`:** A factory that creates the `alsoStore` function, binding it to a specific `viewId`.
- **`alsoStore(value, valueTransformer?)`:** The function you will pass down. It takes a value and, most importantly, an optional `valueTransformer` function.
- **`valueTransformer`:** A function that converts raw data into an AI-ready format. **This is the most critical part for token reduction.** It should produce a structured object with descriptive keys.
- **`maybeAlsoStore(...)`:** A safe wrapper to use inside child functions, as the `alsoStore` function may be optional.
- **Number Formatting:** Always format numbers passed to `alsoStore` using the appropriate utility function (e.g., `formatCurrencyUtil`, `formatNumber`, `formatPercent`). This ensures the AI receives data in a consistent, readable format.
- **Data Structure:** Prefer to use merged labeled objects instead of just an array of items. For example, instead of `{ dailySales: [1, 2, 3] }`, use `{ dailySales: { "Day 1": 1, "Day 2": 2, "Day 3": 3 } }`. Use `deepmerge` for this.

---

## 2. Migration Checklist & Procedure

**Execute the following steps for each "Aspek" view.**

### Part 1: Refactor the Main "Aspek" Generation Function
*(Example: `generateGeneralPenjualanSection`)*

*   [ ] **1. Locate the Function:** Identify the primary function in `src/main.ts` that orchestrates the view's rendering.

*   [ ] **2. Delete Old Data Storage:** Find and **delete** the line that stores the large raw data array.
    *   **Before:** `$store.setActiveViewData('general-penjualan', currentData, { selectedBranch, startDate, endDate });`
    *   **Action:** Delete this line.

*   [ ] **3. Add `clearViewData`:** At the top of the function, add a call to reset the view's data.
    *   **Code to Add:** `$store.clearViewData('general-penjualan');`

*   [ ] **4. Store Minimal `viewContext`:** Create a new `setActiveViewData` call that stores only essential metadata. **Do not include large data arrays.**
    *   **Code to Add:**
        ```typescript
        $store.setActiveViewData('general-penjualan', {
            viewContext: {
                selectedBranch,
                dateRange: `${formatMachineYearMonthDay(startDate)} to ${formatMachineYearMonthDay(endDate)}`,
                hasSalesTarget: Object.keys($store.getConfigValue('activeSalesTarget')).length > 0,
            }
        }, { selectedBranch, startDate, endDate });
        ```

*   [ ] **5. Create the `alsoStore` Function:** Immediately after storing the context, create the `alsoStore` instance.
    *   **Code to Add:** `const alsoStore = createAlsoStoreFn($store, 'general-penjualan');`

### Part 2: Propagate `alsoStore` to Child Functions

*   [ ] **1. Identify Child Calls:** List all chart and table generation functions called by the main "Aspek" function (e.g., `generateRingkasanFromSummaries`, `generateOmzetHarianChartFromSummaries`).

*   [ ] **2. Pass `alsoStore`:** Modify each call to pass the `alsoStore` function. The required pattern is to add it as a property within a new configuration object.
    *   **Before:** `generateRingkasanFromSummaries(currentData, [], { ...ids });`
    *   **After:** `generateRingkasanFromSummaries(currentData, [], { ...ids, alsoStore });`
    *   ---
    *   **Before:** `generateOmzetHarianChartFromSummaries(currentData, 'general-omzet-harian-chart');`
    *   **After:** `generateOmzetHarianChartFromSummaries(currentData, 'general-omzet-harian-chart', { alsoStore });`

### Part 3: Update Child Functions to Use `alsoStore`

*   [ ] **1. Update Function Signatures:** For each child function identified and modified in Part 2, update its signature to accept the new configuration object.
    *   **Before:** `function generateOmzetHarianChartFromSummaries(summaries: any[], canvasId: string) { ... }`
    *   **After:** `function generateOmzetHarianChartFromSummaries(summaries: any[], canvasId: string, config?: { alsoStore?: AlsoStoreFn }) { ... }`

*   [ ] **2. Implement `alsoStore` Calls:**
    *   Inside the function, locate the exact data (variable, array, or value) that is used for rendering the UI.
    *   Wrap this data with a call to `maybeAlsoStore(config?.alsoStore, ...)`.
    *   **Crucially, provide a `valueTransformer` function** as the third argument. This transformer must convert the raw data into a structured, AI-friendly format.

    *   **Example Transformation (Array of numbers):**
        ```typescript
        // This is the raw array of numbers: data = [100, 200, 150]
        maybeAlsoStore(
          config?.alsoStore,
          data,
          (v) => ({
            omzetHarian: deepmerge(...v.map((value, index) => ({
              [`Day ${index + 1}`]: formatCurrencyUtil(value)
            })))
          })
        )
        ```

    *   **Example Transformation (Single value):**
        ```typescript
        config?.alsoStore?.(currentTotals.omzet, (v) => ({ omzet: formatCurrencyUtil(v) }));
        ```

---

## 3. Verification

After migrating a view:
1.  Run the application and navigate to the migrated "Aspek" view.
2.  Open your browser's developer tools and inspect the application's state via the console.
3.  Execute `$store.getState().viewData['view-id']` (e.g., `$store.getState().viewData['general-penjualan']`).
4.  **Confirm** that the `data` property contains the `viewContext` and a series of small, well-structured, descriptively-keyed objects from your `alsoStore` calls.
5.  **Confirm** that the UI still renders correctly with no visual changes or errors.

---

## 4. Migration Status

| Aspek View | View ID | Migration Status |
| :--- | :--- | :--- |
| **Analisis General** | | |
| Keuangan | `general-keuangan` | **Migrated** |
| Penjualan | `general-penjualan` | **Migrated** |
| Produk & Channel | `general-produk-channel` | **Migrated** |
| Investasi | `general-investasi` | **Migrated** |
| **Analisis Perbandingan Waktu** | | |
| Aspek Keuangan | `waktu-keuangan` | **Migrated** |
| Aspek Penjualan | `waktu-penjualan` | Not Migrated |
| Aspek Produk & Channel | `waktu-produk-channel` | Not Migrated |
| **Analisis Perbandingan Cabang** | | |
| Aspek Keuangan | `cabang-keuangan` | Not Migrated |
| Aspek Penjualan | `cabang-penjualan` | Not Migrated |
| Aspek Produk & Channel | `cabang-produk-channel` | Not Migrated |