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

export const PageSummaryFinished = (props: { pageId: string, summary: string, usageMetadata?: any }) => (
    // This was the line with the typo. It's now corrected.
    BasePageSummaryCard({ children: html`
        <div data-state="finished">
            <div class="flex justify-between items-center">
                <h3 class="text-xl font-semibold text-gray-700">Summary</h3>
                <div class="flex items-center gap-2">
                    <button
                        class="bg-gray-200 text-gray-700 text-sm font-bold py-2 px-3 rounded-lg hover:bg-gray-300 transition"
                        data-el="reset-summary-btn"
                        data-target="${props.pageId}"
                    >
                        Reset
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
            
            ${props.usageMetadata ? html`
                <div class="border-t pt-2 mt-3 text-xs text-gray-400 text-right">
                    <span>Prompt: <strong>${props.usageMetadata.promptTokenCount}</strong></span> |
                    <span>Completion: <strong>${props.usageMetadata.candidatesTokenCount}</strong></span> |
                    <span>Total: <strong>${props.usageMetadata.totalTokenCount}</strong> tokens</span>
                </div>
            ` : ''}
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
    analyzeUsingAI: (prompt: string) => Promise<{ summaryText: string, usageMetadata: any }>, // Updated signature
    promptDataFormatter?: (data: any) => object | Promise<object>
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

    const downloadData = async () => {
        const viewData = getStore('activeViewData');
        if (!viewData?.data) {
            alert("No active data to download.");
            return;
        }
        const summaryObject = params.promptDataFormatter ? await params.promptDataFormatter(viewData) : viewData.data;
        const jsonString = JSON.stringify(summaryObject, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `finalytics_summary_data_${promptKey}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const showInit = () => {
        ifPlaceholder(
            ($p) => $p.outerHTML = PageSummaryInit({ pageId: params.pageId }),
            ($p) => $p.querySelector('button[data-el="analyze-page-summary"]')?.addEventListener('click', onAnalyze),
            ($p) => {
                const downloadBtn = $p.querySelector('button[data-el="download-summary-data-btn"]');
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', downloadData);
                    if (params.promptDataFormatter) {
                        downloadBtn.classList.remove('hidden');
                    }
                }
            }
        );
    };

    const attachListenersToFinishedState = ($p: HTMLElement) => {
        $p.querySelector('button[data-el="reset-summary-btn"]')?.addEventListener('click', () => {
            showInit();
        });
    };

    const tryShowFromCache = async (viewData: AppState['activeViewData']) => {
        if (!viewData?.data || !viewData.filters) return;
        try {
            const dataForPrompt = params.promptDataFormatter ? await params.promptDataFormatter(viewData) : viewData.data;
            const filtersHash = await generateSHA256(viewData.filters);
            const dataHash = await generateSHA256(dataForPrompt);
            const cached = await findLiveCache(filtersHash, dataHash);
            if (cached) {
                // Pass cached summary and usageMetadata to the component
                ifPlaceholder(
                    ($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary: cached.summary, usageMetadata: cached.usageMetadata }),
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
            const dataForPrompt = params.promptDataFormatter ? await params.promptDataFormatter(viewData) : data;
            const filtersHash = await generateSHA256(filters || {});
            const dataHash = await generateSHA256(dataForPrompt || []);
            const cached = await findLiveCache(filtersHash, dataHash);

            if (cached) {
                ifPlaceholder(
                    ($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary: cached.summary, usageMetadata: cached.usageMetadata }), 
                    attachListenersToFinishedState
                );
                return;
            }

            await deactivateHistoricalCache(filtersHash);
            const prompt = promptCreator({ data: dataForPrompt, filters });
            // Destructure the response from the AI call
            const { summaryText, usageMetadata } = await params.analyzeUsingAI(prompt);
            
            // Save the summary AND the usage metadata to the cache
            await createLiveCache({ filtersHash, dataHash, summary: summaryText, usageMetadata, filters });
            
            // Pass both pieces of data to the finished component
            ifPlaceholder(
                ($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary: summaryText, usageMetadata }), 
                attachListenersToFinishedState
            );

        } catch (err) {
            console.error('Error analyzing page:', err);
            const message = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err);
            ifPlaceholder(($p) => $p.outerHTML = PageSummaryError({ pageId: params.pageId, message }));
        }
    };

    const registerSubscriber = () => {
        const unsubscribe = store.subscribe(async (state, prevState) => {
            if (prevState.activeViewData && !state.activeViewData) {
                unsubscribe();
            }
            if (state.activeViewData && state.activeViewData !== prevState.activeViewData) {
                showInit();
                await tryShowFromCache(state.activeViewData);
            }
        });
    };

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
