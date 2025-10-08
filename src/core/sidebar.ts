// This file defines the structure of our dynamic sidebar and contains the function to generate its HTML.

/**
 * Defines the structure for a single link within a sidebar menu.
 */
interface SidebarLink {
  text: string;      // The visible text of the link (e.g., "Aspek Keuangan")
  target: string;    // The data-target value for view switching (e.g., "general-keuangan")
}

/**
 * Defines the structure for a top-level menu in the sidebar, which contains links.
 */
interface SidebarMenu {
  title: string;     // The title of the collapsible section (e.g., "Analisis General")
  links: SidebarLink[];
}

/**
 * The configuration object for the entire analysis sidebar.
 * To add, remove, or reorder items, you only need to modify this array.
 */
const sidebarConfig: SidebarMenu[] = [
  {
    title: 'Analisis General',
    links: [
      { text: 'Aspek Keuangan', target: 'general-keuangan' },
      { text: 'Aspek Penjualan', target: 'general-penjualan' },
      { text: 'Aspek Produk dan Channel', target: 'general-produk-channel' },
      { text: 'Aspek Investasi', target: 'general-investasi' },
    ],
  },
  {
    title: 'Analisis Perbandingan Waktu',
    links: [
      { text: 'Aspek Keuangan', target: 'waktu-keuangan' },
      { text: 'Aspek Penjualan', target: 'waktu-penjualan' },
      { text: 'Aspek Produk dan Channel', target: 'waktu-produk-channel' },
    ],
  },
  {
    title: 'Analisis Perbandingan Cabang',
    links: [
      { text: 'Aspek Keuangan', target: 'cabang-keuangan' },
      { text: 'Aspek Penjualan', target: 'cabang-penjualan' },
      { text: 'Aspek Produk dan Channel', target: 'cabang-produk-channel' },
      { text: 'Aspek Investasi', target: 'cabang-investasi' },
    ],
  },
];

/**
 * Generates the complete HTML for the sidebar based on the sidebarConfig object.
 * @returns {string} The full HTML string for the <nav> element.
 */
function generateSidebarHTML(): string {
  let html = '';
  for (const menu of sidebarConfig) {
    const linksHtml = menu.links.map(link => `
      <a href="#" class="sidebar-link block p-2 rounded-md text-sm" data-target="${link.target}">${link.text}</a>
    `).join('');

    html += `
      <div class="submenu-container">
        <button class="submenu-toggle w-full text-left p-3 rounded-md flex justify-between items-center hover:bg-gray-100 font-semibold">
          <span>${menu.title}</span>
          <svg class="w-4 h-4 transform transition-transform chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
        <div class="submenu hidden pl-4 mt-1 space-y-1">
          ${linksHtml}
        </div>
      </div>
    `;
  }
  return html;
}

/**
 * Renders the dynamically generated sidebar into a specified container element.
 * @param containerId The ID of the HTML element where the sidebar should be injected.
 */
export function renderDynamicSidebar(containerId: string): void {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = generateSidebarHTML();
  } else {
    console.error(`Sidebar container with ID "${containerId}" not found.`);
  }
}