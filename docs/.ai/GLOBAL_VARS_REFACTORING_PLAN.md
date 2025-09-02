# Global Variables Refactoring Plan

**Created:** September 2, 2025
**Goal:** Refactor all mutable global variables to be stored inside Zustand store for easy reset when navigating outside view analysis.

## Overview

### Current Problem
- ~25+ mutable global variables scattered across `main.ts`
- Variables maintain state when user navigates: Dashboard → Analysis → Dashboard → Analysis
- No centralized reset mechanism leads to stale state and potential bugs
- Memory leaks from unreleased Chart.js and SlimSelect instances

### Solution
- Centralize all analysis-related mutable state in Zustand store
- Implement automatic cleanup when leaving analysis view
- Proper cleanup of UI components (charts, selectors)
- Maintain cache and authentication state separately

## Architecture Design

### Store Structure Extension
```typescript
interface AnalysisState {
  // Data Storage
  allSalesData: any[];
  chartDataForAI: Record<string, any>;
  aiAnalysisResults: Record<string, any>;
  charts: Record<string, any>;

  // UI Initialization Flags
  initFlags: {
    yoyYearSelectInitialized: boolean;
    monthlyComparisonInitialized: boolean;
    generalKeuanganSelectorInitialized: boolean;
    waktuKeuanganSelectorsInitialized: boolean;
    waktuPenjualanSelectorsInitialized: boolean;
    waktuProdukChannelSelectorsInitialized: boolean;
    cabangKeuanganSelectorsInitialized: boolean;
    cabangPenjualanSelectorsInitialized: boolean;
    cabangProdukChannelSelectorsInitialized: boolean;
    generalPenjualanSelectorInitialized: boolean;
    generalProdukChannelSelectorInitialized: boolean;
    generalInvestasiSelectorInitialized: boolean;
    cabangInvestasiSelectorInitialized: boolean;
  };

  // UI Component References
  uiComponents: {
    omzetComparisonSelect: SlimSelect | null;
    menuTrend24MonthSelect: SlimSelect | null;
    generalMenuTrendSelect: SlimSelect | null;
    waktuMenuTrendSelect: SlimSelect | null;
    cabangMenuTrendSelect: SlimSelect | null;
  };

  // Configuration/State
  config: {
    monthlyComparisonTargets: Record<string, any>;
    currentPnlPeriod: string | null;
    activeSalesTarget: Record<string, any>;
  };
}
```

### Variables NOT to be moved (remain as globals)
- Firebase instances: `app`, `auth`, `db`, `functions`, `storage`
- Authentication state: `currentUser`, `currentUserRole`, `adminCredentials`
- DOM element references: `authView`, `dashboardView`, etc.
- Configuration: `geminiConfig`, `defaultGeminiConfig`
- Constants: `DB_NAME`, `STORE_NAME`, `typeDisplayNames`

## Implementation Strategy

### Reset Timing
- **When:** User leaves analysis view (detected in `showView()` function)
- **Why:** Ensures clean state when re-entering analysis view
- **How:** Detect transition away from 'analysis' view and trigger reset

### Cleanup Strategy
1. **Charts:** Call `destroyCharts()` function to prevent memory leaks
2. **SlimSelect:** Call `.destroy()` method on each instance
3. **Window Properties:** Clear `window.generalMenuTrendSelect`
4. **State Reset:** Reset all store properties to default values
5. **Error Handling:** Debug logging + continue execution

## Detailed Task Checklist

### Phase 1: Store Extension ✅
- [x] **Task 1.1:** Extend `AppState` interface with `AnalysisState`
- [x] **Task 1.2:** Add analysis state to store with default values
- [x] **Task 1.3:** Create `resetAnalysisState()` function with proper cleanup
- [x] **Task 1.4:** Add helper functions for analysis state management
- [x] **Task 1.5:** Update store exports for new analysis functions

### Phase 2: Navigation Integration ✅
- [x] **Task 2.1:** Modify `showView()` to detect leaving analysis view
- [x] **Task 2.2:** Integrate reset function call in navigation flow
- [x] **Task 2.3:** Add debug logging for reset operations
- [x] **Task 2.4:** Test navigation reset functionality

### Phase 3: Global Variable Migration 🚧 (In Progress)

#### Data Storage Variables
- [x] **Task 3.1:** Replace `allSalesData` with store access (Helper functions created, migration in progress)
- [ ] **Task 3.2:** Replace `chartDataForAI` with store access
- [ ] **Task 3.3:** Replace `aiAnalysisResults` with store access
- [ ] **Task 3.4:** Replace `charts` with store access

#### UI Initialization Flags
- [ ] **Task 3.5:** Replace `yoyYearSelectInitialized` with store access
- [ ] **Task 3.6:** Replace `monthlyComparisonInitialized` with store access
- [ ] **Task 3.7:** Replace `generalKeuanganSelectorInitialized` with store access
- [ ] **Task 3.8:** Replace `waktuKeuanganSelectorsInitialized` with store access
- [ ] **Task 3.9:** Replace `waktuPenjualanSelectorsInitialized` with store access
- [ ] **Task 3.10:** Replace `waktuProdukChannelSelectorsInitialized` with store access
- [ ] **Task 3.11:** Replace `cabangKeuanganSelectorsInitialized` with store access
- [ ] **Task 3.12:** Replace `cabangPenjualanSelectorsInitialized` with store access
- [ ] **Task 3.13:** Replace `cabangProdukChannelSelectorsInitialized` with store access
- [ ] **Task 3.14:** Replace `generalPenjualanSelectorInitialized` with store access
- [ ] **Task 3.15:** Replace `generalProdukChannelSelectorInitialized` with store access
- [ ] **Task 3.16:** Replace `generalInvestasiSelectorInitialized` with store access
- [ ] **Task 3.17:** Replace `cabangInvestasiSelectorInitialized` with store access

#### UI Component References
- [ ] **Task 3.18:** Replace `omzetComparisonSelect` with store access
- [ ] **Task 3.19:** Replace `menuTrend24MonthSelect` with store access
- [ ] **Task 3.20:** Replace `generalMenuTrendSelect` with store access
- [ ] **Task 3.21:** Replace `waktuMenuTrendSelect` with store access
- [ ] **Task 3.22:** Replace `cabangMenuTrendSelect` with store access

#### Configuration/State Variables
- [ ] **Task 3.23:** Replace `monthlyComparisonTargets` with store access
- [ ] **Task 3.24:** Replace `currentPnlPeriod` with store access
- [ ] **Task 3.25:** Replace `activeSalesTarget` with store access

### Phase 4: Window Properties Cleanup ✅/❌
- [ ] **Task 4.1:** Clear `window.generalMenuTrendSelect` in reset function
- [ ] **Task 4.2:** Update functions that assign to window properties

### Phase 5: Testing & Validation ✅/❌
- [ ] **Task 5.1:** Test navigation flow: Dashboard → Analysis → Dashboard → Analysis
- [ ] **Task 5.2:** Verify all charts are properly destroyed and recreated
- [ ] **Task 5.3:** Verify all SlimSelect instances are properly cleaned up
- [ ] **Task 5.4:** Test that analysis state is clean on re-entry
- [ ] **Task 5.5:** Verify no memory leaks from unreleased references
- [ ] **Task 5.6:** Test error handling in reset function
- [ ] **Task 5.7:** Verify cache and auth state remain untouched

### Phase 6: Code Cleanup ✅/❌
- [ ] **Task 6.1:** Remove old global variable declarations
- [ ] **Task 6.2:** Update comments and documentation
- [ ] **Task 6.3:** Add JSDoc comments for new store functions
- [ ] **Task 6.4:** Code review and optimization

## Implementation Order

1. **Start with Store Extension** (Phase 1) - Foundation
2. **Add Navigation Integration** (Phase 2) - Reset mechanism
3. **Migrate Variables Systematically** (Phase 3) - Core refactoring
4. **Clean Window Properties** (Phase 4) - Complete cleanup
5. **Test Thoroughly** (Phase 5) - Validation
6. **Final Cleanup** (Phase 6) - Polish

## Key Functions to Modify

### Store Functions (New)
- `getAnalysisState()` - Get current analysis state
- `setAnalysisState()` - Update analysis state
- `resetAnalysisState()` - Clean reset with proper cleanup
- `updateAnalysisFlag()` - Update initialization flags
- `updateAnalysisComponent()` - Update UI component references
- `updateAnalysisConfig()` - Update configuration

### Navigation Functions (Modify)
- `showView()` - Add reset detection and call
- `viewCompiledAnalysis()` - Ensure proper state initialization

### Analysis Functions (Modify - many)
- `setupAndShowAnalysisView()` - Use store instead of globals
- `runAnalysis()` - Use store instead of globals
- `setupMonthlyComparison()` - Use store instead of globals
- `generateYoYAnalysisFromSummaries()` - Use store instead of globals
- All chart generation functions - Use store for data access
- All setup functions - Use store for initialization flags

## Error Handling Strategy

```typescript
function safeCleanup(componentRef: any, cleanupFn: () => void, componentName: string) {
  try {
    if (componentRef) {
      cleanupFn();
    }
  } catch (error) {
    console.debug(`Failed to cleanup ${componentName}:`, error);
    // Continue execution - don't throw
  }
}
```

## Success Criteria

- [ ] All mutable global variables moved to store
- [ ] Navigation between Dashboard ↔ Analysis results in clean state
- [ ] No memory leaks from unreleased Chart.js instances
- [ ] No memory leaks from unreleased SlimSelect instances
- [ ] Cache and authentication state remain unaffected
- [ ] Error handling prevents crashes during cleanup
- [ ] Code is maintainable and well-documented

## Risk Mitigation

1. **Gradual Migration:** Move variables in small batches to catch issues early
2. **Comprehensive Testing:** Test each navigation scenario thoroughly
3. **Fallback Handling:** Graceful degradation if cleanup fails
4. **Backup Strategy:** Keep old global declarations commented during migration
5. **Documentation:** Clear documentation of new patterns for future developers

---

**Note:** This is a major refactoring that touches core application state management. Take time to test each phase thoroughly before proceeding to the next.
