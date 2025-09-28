import { keuanganPrompts } from './views/keuangan'
import { penjualanPrompts } from './views/penjualan'
import { produkChannelPrompts } from './views/produk-channel'
import { investasiPrompts } from './views/investasi'

export const viewPromptCreators = Object.freeze({
  ...keuanganPrompts,
  ...penjualanPrompts,
  ...produkChannelPrompts,
  ...investasiPrompts,
});
