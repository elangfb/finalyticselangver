import { formatNumber, formatCurrency } from '@/utils/string';

// A helper function to generate both Top 10 tables
export function generateTop10MenuTable(summaries: any[], containerId: string, sortBy: 'quantity' | 'revenue') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const menuData: Map<string, { quantity: number; revenue: number; category: string }> = new Map();

    // Aggregate data from all summaries
    summaries.forEach(summary => {
        if (!summary.menuItemQuantities) return;
        for (const category in summary.menuItemQuantities) {
            for (const itemName in summary.menuItemQuantities[category]) {
                const quantity = summary.menuItemQuantities[category][itemName];
                const price = summary.menuItemPrices?.[category]?.[itemName] || 0;
                const revenue = quantity * price;

                if (menuData.has(itemName)) {
                    const existing = menuData.get(itemName)!;
                    existing.quantity += quantity;
                    existing.revenue += revenue;
                } else {
                    menuData.set(itemName, { quantity, revenue, category });
                }
            }
        }
    });

    // Convert map to array, sort, and take top 10
    const sortedData = Array.from(menuData.entries())
        .sort(([, a], [, b]) => b[sortBy] - a[sortBy])
        .slice(0, 10);

    if (sortedData.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">No menu data available for this period.</p>';
        return;
    }

    // Generate HTML table
    let tableHtml = `
        <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
                <thead class="text-left text-gray-500">
                    <tr>
                        <th class="p-2 font-medium">#</th>
                        <th class="p-2 font-medium">Menu Name</th>
                        <th class="p-2 font-medium">Category</th>
                        <th class="p-2 font-medium text-right">${sortBy === 'quantity' ? 'Quantity' : 'Revenue'}</th>
                    </tr>
                </thead>
                <tbody>`;

    sortedData.forEach(([name, data], index) => {
        const value = sortBy === 'quantity' ? formatNumber(data.quantity) : formatCurrency(data.revenue);
        tableHtml += `
            <tr class="border-t">
                <td class="p-2">${index + 1}</td>
                <td class="p-2 font-medium text-gray-800">${name}</td>
                <td class="p-2 text-gray-600">${data.category}</td>
                <td class="p-2 text-right font-mono">${value}</td>
            </tr>`;
    });

    tableHtml += `</tbody></table></div>`;
    container.innerHTML = tableHtml;
}