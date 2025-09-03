import { viewPromptCreators } from "@/prompt"
import { AppState, getStore, store } from "@/store"
import { html } from "@/utils/string"
import { marked } from "marked"
import { generateSHA256 } from "@/utils/hash"
import { findLiveCache, deactivateHistoricalCache, createLiveCache } from "@/services/analysisCacheService"

const BasePageSummaryCard = (props: { children: string }) => (
    html`
        <div class="bg-white rounded-lg shadow-md p-6 flex flex-col gap-3" data-el="analyze-page-summary" data-initialized="true">
            ${props.children}
        </div>
    `
)

export const PageSummaryInit = (props: { pageId: string }) => (
    BasePageSummaryCard({ children: html`
        <div data-state="init">
            <div class="flex justify-between items-center">
                <h3 class="text-xl font-semibold text-gray-700">Summary</h3>
                <div class="flex items-center gap-2">
                    <button
                        class="bg-gray-200 text-gray-700 text-sm font-bold py-2 px-3 rounded-lg hover:bg-gray-300 transition hidden"
                        data-el="download-summary-data-btn hidden"
                    >
                        Download Summary Data
                    </button>
                    <button
                        class="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 transition"
                        data-el="analyze-page-summary"
                        data-target="${props.pageId}"
                    >
                        Analyze with AI
                    </button>
                </div>
            </div>
        </div>
    `})
);


export const PageSummaryLoading = (props: { pageId: string }) => (
    BasePageSummaryCard({ children: html`
        <div data-state="loading">
            <div class="flex justify-between items-center">
                <h3 class="text-xl font-semibold text-gray-700">Summary</h3>
                <button
                    class="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 transition duration-300 invisible"
                    data-el="analyze-page-summary-button"
                    data-target="${props.pageId}"
                >
                    Analyze with AI
                </button>
            </div>

            <div class="mt-4" data-el="analyze-page-summary-content" data-target="${props.pageId}">
                <p class="text-gray-600">Loading...</p>
            </div>
        </div>
    `})
)

export const PageSummaryFinished = (props: { pageId: string, summary: string }) => (
    BasePageSummaryCard({ children: html`
        <div data-state="finished">
            <div class="flex justify-between items-center">
                <h3 class="text-xl font-semibold text-gray-700">Summary</h3>
                <div class="flex items-center gap-2 hidden">
                    <button
                        class="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 transition"
                        data-el="analyze-page-summary"
                        data-target="${props.pageId}"
                    >
                        Analyze Again
                    </button>
                </div>
            </div>

            <div
                class="mt-4 space-y-2.5 [&_ul]:space-y-1 [&_ul]:list-disc [&_ul]:pl-4"
                data-el="analyze-page-summary-content"
                data-target="${props.pageId}"
            >
                ${marked.parse(props.summary)}
            </div>
        </div>
    `})
);


export const PageSummaryError = (props: { pageId: string, message?: string }) => (
    BasePageSummaryCard({ children: html`
        <div data-state="error">
            <div class="flex justify-between items-center">
                <h3 class="text-xl font-semibold text-gray-700">Summary</h3>
                <button
                    class="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition duration-300 invisible"
                    data-el="analyze-page-summary-button"
                    data-target="${props.pageId}"
                >
                    Analyze with AI
                </button>
            </div>

            <div class="mt-4" data-el="analyze-page-summary-content" data-target="${props.pageId}">
                <p class="text-red-600">${props.message || 'An error occurred while generating the summary.'}</p>
            </div>
        </div>
    `})
)

type PlaceholderElement = HTMLDivElement

export const setupPageSummary = (params: {
    pageId: string,
    promptKey?: keyof typeof viewPromptCreators,
    analyzeUsingAI: (prompt: string) => Promise<string>,
    promptDataFormatter?: (data: any[]) => object
}) => {
    const page = document.getElementById(params.pageId);
    const placeholder = () => page?.querySelector<HTMLDivElement>('div[data-el="analyze-page-summary"]');
    const ifPlaceholder = (...callbacks: ((placeholder: HTMLDivElement) => void)[]) => {
        for (const callback of callbacks) {
            const div = placeholder();
            if (div) callback(div);
        }
    };
    const isInitialized = () => placeholder()?.getAttribute('data-initialized') === 'true';

    const promptKey = (params.promptKey || params.pageId.replace('-section', '')) as keyof typeof viewPromptCreators;
    const promptCreator = viewPromptCreators[promptKey];
    if (!promptCreator) {
        console.warn(`Prompt not found for page: ${params.pageId}`);
        return;
    }

    const downloadData = () => {
        const viewData = getStore('activeViewData');
        if (!viewData?.data) {
            alert("No active data to download.");
            return;
        }
        const summaryObject = createGeneralSalesDailyBreakdown(viewData.data);
        const jsonString = JSON.stringify(summaryObject, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "ai_daily_breakdown.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const attachListenersToFinishedState = ($p: HTMLElement) => {
        $p.querySelector('button[data-el="analyze-page-summary"]')?.addEventListener('click', onAnalyze);
        $p.querySelector('button[data-el="download-summary-data-btn"]')?.addEventListener('click', downloadData);
    };

    const tryShowFromCache = async (viewData: AppState['activeViewData']) => {
        if (!viewData?.data || !viewData.filters) return;
        try {
            const filtersHash = await generateSHA256(viewData.filters);
            const dataHash = await generateSHA256(viewData.data);
            const cached = await findLiveCache(filtersHash, dataHash);
            if (cached) {
                ifPlaceholder(
                    ($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary: cached.summary }),
                    attachListenersToFinishedState
                );
            }
        } catch (err) {
            console.warn('Error checking cache:', err);
        }
    };

    const onAnalyze = async () => {
    const viewData = getStore('activeViewData');

    if (!viewData) {
        console.warn('No active view data found');
        return;
    }

    const { data, filters } = viewData;

    ifPlaceholder(($p) => $p.outerHTML = PageSummaryLoading({ pageId: params.pageId }));

    try {
        // --- FIX START: Generate the formatted data FIRST ---
        // This ensures both the cache and the AI use the same data format.
        const dataForPrompt = params.promptDataFormatter
            ? params.promptDataFormatter(data)
            : data;
        // --- FIX END ---

        // Now, create hashes from the formatted data, not the raw data
        const filtersHash = await generateSHA256(filters || {});
        const dataHash = await generateSHA256(dataForPrompt || []); // Use the formatted data for the hash

        const cached = await findLiveCache(filtersHash, dataHash);
        if (cached) {
            // Cache hit is now accurate
            ifPlaceholder(($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary: cached.summary }));
            return;
        }

        await deactivateHistoricalCache(filtersHash);

        // The data is already formatted, so we just pass it to the prompt creator
        const prompt = promptCreator({ data: dataForPrompt, filters });
        const summary = await params.analyzeUsingAI(prompt);

        await createLiveCache({ filtersHash, dataHash, summary, filters });

        ifPlaceholder(($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary }));
    } catch (err) {
        console.error('Error analyzing page:', err);
        const message = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err);
        ifPlaceholder(($p) => $p.outerHTML = PageSummaryError({ pageId: params.pageId, message }));
    }
};


    const showInit = () => {
        ifPlaceholder(
            ($p) => $p.outerHTML = PageSummaryInit({ pageId: params.pageId }),
            ($p) => $p.querySelector('button[data-el="analyze-page-summary"]')?.addEventListener('click', onAnalyze),
            ($p) => $p.querySelector('button[data-el="download-summary-data-btn"]')?.addEventListener('click', downloadData)
        );
    };

    const registerSubscriber = () => {
        const unsubscribe = store.subscribe((state, prevState) => {
            if (prevState.activeViewData && !state.activeViewData) {
                unsubscribe();
            }
            if (state.activeViewData && state.activeViewData !== prevState.activeViewData) {
                showInit();
                tryShowFromCache(state.activeViewData);
            }
        });
    };

    store.getState().trySetFromExistingViewData(promptKey);

    if (!isInitialized()) {
        showInit();
        const currentViewData = getStore('activeViewData');
        if (currentViewData) {
            tryShowFromCache(currentViewData);
        }
    }
    registerSubscriber();
};


function createGeneralSalesDailyBreakdown(dailySummaries: any[]): object {
    if (!dailySummaries || dailySummaries.length === 0) {
        return { message: "No data available for this period." };
    }
    const breakdown = {};
    const formatCurrency = (value) => `Rp${Math.round(value).toLocaleString('id-ID')}`;
    const sortedSummaries = [...dailySummaries].sort((a, b) => a.date.getTime() - b.date.getTime());

    sortedSummaries.forEach(s => {
        const dateStr = s.date.toISOString().split('T')[0];
        const getTop5 = (categoryName: string) => {
            if (!s.menuItemQuantities || !s.menuItemQuantities[categoryName]) return {};
            return Object.entries(s.menuItemQuantities[categoryName])
                .filter(([name]) => !name.includes('(PACKAGE)'))
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 5)
                .reduce((acc, [name, qty]) => {
                    acc[`${name} (Qty)`] = qty;
                    return acc;
                }, {});
        };
        breakdown[dateStr] = {
            "Visit Purpose": s.visitPurposes || {},
            "Payment Method": Object.entries(s.paymentMethods || {}).reduce((acc, [name, rev]) => {
                acc[name] = formatCurrency(rev);
                return acc;
            }, {}),
            "Traffic per Hour": (s.trafficByHour || [])
                .map((count, hour) => ({ hour, count }))
                .filter(item => item.count > 0)
                .reduce((acc, item) => {
                    acc[`${String(item.hour).padStart(2, '0')}:00`] = `${item.count} bills`;
                    return acc;
                }, {}),
            "Menu Category Summary": Object.entries(s.menuCategories || {}).reduce((acc, [name, data]) => {
                acc[name] = `${formatCurrency((data as any).revenue)} (${(data as any).quantity} items)`;
                return acc;
            }, {}),
            "Top 5 Makanan": getTop5('MAKANAN'),
            "Top 5 Minuman": getTop5('MINUMAN'),
            "Financial Summary": {
        "Total Nett Sales": formatCurrency(s.totalOmzet || 0),
    }

        };
    });
    return breakdown;
}
