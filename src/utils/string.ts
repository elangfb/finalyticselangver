// Aggregator module: split into smaller files under utils/string to keep this file lean
export { trimMultiline, truncateToFixed, html } from './string/base'
export {
  formatCurrency,
  formatNumber,
  formatIntBasedPercentage,
  formatDecimalBasedPercentage,
  shortenNumber,
  shortenCurrency,
} from './string/numbers'
export {
  shortMonths,
  shortenDate,
  formatMachineYearMonth,
  formatMachineYearMonthDay,
} from './string/dates'
