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
                <button
                    class="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 transition duration-300"
                    data-el="analyze-page-summary"
                    data-target="${props.pageId}"
                >
                    Analyze with AI
                </button>
            </div>
        </div>
    `})
)

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
                <button
                    class="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 transition duration-300 invisible"
                    data-el="analyze-page-summary-button"
                    data-target="${props.pageId}"
                >
                    Analyze with AI
                </button>
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
)

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
    const page = document.getElementById(params.pageId)
    const placeholder = () => {
        return page?.querySelector<PlaceholderElement>('div[data-el="analyze-page-summary"]')
    }
    const ifPlaceholder = (...callbacks: ((placeholder: PlaceholderElement) => void)[]) => {
        for (const callback of callbacks) {
            const div = placeholder()
            if (div) callback(div)
        }
    }
    const isInitialized = () => placeholder()?.getAttribute('data-initialized') === 'true'

    const promptKey = (params.promptKey || params.pageId.replace('-section', '')) as keyof typeof viewPromptCreators
    const promptCreator = viewPromptCreators[promptKey]

    if (!promptCreator) {
        console.warn(`Prompt not found for page: ${params.pageId}`)
        return
    }

    const tryShowFromCache = async (viewData: AppState['activeViewData']) => {
        if (!viewData) return

        const { data, filters } = viewData

        if (!data) return

        try {
            const filtersHash = await generateSHA256(filters || {})
            const dataHash = await generateSHA256(data || [])

            const cached = await findLiveCache(filtersHash, dataHash)
            if (cached) {
                // Cache found - replace with finished state
                ifPlaceholder(($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary: cached.summary }))
            }
            // If no cache found, do nothing (keep current state)
        } catch (err) {
            console.warn('Error checking cache:', err)
            // On error, do nothing
        }
    }

    const onAnalyze = async () => {
        const viewData = getStore('activeViewData')

        if (!viewData) {
            console.warn('No active view data found')
            return
        }

        const { data, filters } = viewData

        ifPlaceholder(($p) => $p.outerHTML = PageSummaryLoading({ pageId: params.pageId }))

        try {
            const filtersHash = await generateSHA256(filters || {})
            const dataHash = await generateSHA256(data || [])

            const cached = await findLiveCache(filtersHash, dataHash)
            if (cached) {
                // Cache hit
                ifPlaceholder(($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary: cached.summary }))
                return
            }

            // Cache miss: deactivate previous live docs for this filtersHash
            await deactivateHistoricalCache(filtersHash)


            const dataForPrompt = params.promptDataFormatter 
                ? params.promptDataFormatter(data) 
                : data;

            const prompt = promptCreator({ data: dataForPrompt, filters });
            const summary = await params.analyzeUsingAI(prompt);

            // Create a new live cache document (no expireAt)
            await createLiveCache({ filtersHash, dataHash, summary, filters })

            ifPlaceholder(($p) => $p.outerHTML = PageSummaryFinished({ pageId: params.pageId, summary }))
        } catch (err) {
            console.error('Error analyzing page:', err)
            const message = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err)
            ifPlaceholder(($p) => $p.outerHTML = PageSummaryError({ pageId: params.pageId, message }))
        }
    }

    const showInit = () => {
        // Always show init state initially
        ifPlaceholder(
            ($p) => $p.outerHTML = PageSummaryInit({ pageId: params.pageId }),
            ($p) => $p.querySelector('button')?.addEventListener('click', onAnalyze),
        )
    }

    const registerSubscriber = () => {
        // Register subscriber to check for cache when activeViewData changes
        const unsubscribe = store.subscribe((state, prevState) => {
            // Auto-unsubscribe on view data reset
            if (prevState.activeViewData && !state.activeViewData) {
                unsubscribe()
            }

            if (state.activeViewData && state.activeViewData !== prevState.activeViewData) {
                showInit()
                tryShowFromCache(state.activeViewData)
            }
        })
    }

    store.getState().trySetFromExistingViewData(promptKey);

    if (!isInitialized()) {
        showInit()

        // Check if activeViewData exists during setup
        const currentViewData = getStore('activeViewData')
        if (currentViewData) {
            // Data exists during setup - check for cache
            tryShowFromCache(currentViewData)
        }

        console.debug('Success init setup page summary for page:', params.pageId)
    }

    registerSubscriber()

    console.debug('Success setup page summary for page:', params.pageId)
}