// Contains helper functions for conditionally storing formatted data for AI analysis.

import { deepmerge } from 'deepmerge-ts';
import * as $store from '../../store';

/**
 * Type definition for the AlsoStore function.
 * It takes a value and a transformer function, then returns the original value,
 * allowing it to be chained within data processing pipelines.
 */
export type AlsoStoreFn = <T>(v: T, fn: (v: T) => object) => T;

/**
 * Creates a function that, when called, stores a transformed version of its input
 * into a specific view's data store for AI analysis, while returning the original input.
 * This is the core of the pattern, allowing data to be captured for AI "on the fly"
 * as it's being prepared for a chart.
 *
 * @param store The Zustand store instance.
 * @param viewName The name of the view/section (e.g., 'general-sales') to store the data under.
 * @returns An `AlsoStoreFn` function bound to a specific view.
 */
export const createAlsoStoreFn = ($store: any, viewName: string): AlsoStoreFn => {
  return (v, fn) => {
    const dataToMerge = fn(v);
    const existingData = $store.getActiveViewDataProperty(viewName) || {};
    const mergedData = deepmerge(existingData, { insights: dataToMerge });
    $store.setActiveViewData(viewName, mergedData);
    return v;
  };
};

/**
 * A higher-order function that creates a conditional `AlsoStoreFn`.
 * If the provided `alsoStore` function exists, it returns it; otherwise, it returns a no-op function
 * that simply returns the original value without storing anything.
 *
 * @param alsoStore An optional `AlsoStoreFn` function from a config object.
 * @returns A guaranteed-to-exist (but possibly no-op) `AlsoStoreFn`.
 */
export const createMaybeAlsoStoreFn = (alsoStore?: AlsoStoreFn): AlsoStoreFn => {
  return alsoStore || ((v, _fn) => v);
};

/**
 * A helper function to conditionally call an `alsoStore` function if it exists.
 * This is a convenient wrapper around `createMaybeAlsoStoreFn` for one-off calls.
 *
 * @param alsoStore An optional `AlsoStoreFn`.
 * @param v The value to potentially store.
 * @param fn The transformer function that formats the data for AI.
 * @returns The original, unmodified value `v`.
 */
export const maybeAlsoStore = <T>(alsoStore: AlsoStoreFn | undefined, v: T, fn: (v: T) => object) => {
  if (alsoStore) {
    alsoStore(v, fn);
  }
  return v;
};
