/**
 * Apply data bindings to DOM elements with @analysis:text attributes for dynamic content updates.
 *
 * @description
 * Scans DOM for elements with @analysis:text attributes and updates their text content
 * with corresponding values from bindings object. Provides declarative data binding
 * system for analysis results, enabling automatic UI updates when store state changes.
 * Handles type conversion, null safety, and gracefully skips invalid elements or
 * missing binding keys for robust operation.
 *
 * @param bindings - Object mapping binding keys to display values (strings, numbers, or null/undefined).
 * @returns This function does not return a value; it updates DOM element text content.
 *
 * @example
 * // HTML: <span @analysis:text="currentOmzetFormatted"></span>
 * //       <div @analysis:text="pageTitle"></div>
 * applyAnalysisTextBindings({
 *   currentOmzetFormatted: 'Rp 5,000,000',
 *   pageTitle: 'Monthly Sales Analysis'
 * });
 * // Updates DOM elements with corresponding values
 */
export function applyAnalysisTextBindings(bindings: Record<string, string | number | null | undefined>): void {
  const elements = document.querySelectorAll('[\\@analysis\\:text]')

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) {
      continue
    }

    const key = element.getAttribute('@analysis:text')
    if (!key) {
      continue
    }

    const value = bindings[key]
    element.innerText = String(value ?? '')
  }
}
