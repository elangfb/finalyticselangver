import { viewPromptCreators } from "@/prompt"
import { getStore } from "@/store"
import { html } from "@/utils/string"
import { marked } from "marked"

const BasePageSummaryCard = (props: { children: string }) => (
    html`
        <div class="bg-white rounded-lg shadow-md p-6 flex flex-col gap-3" data-el="analyze-page-summary">
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

const GHOST_DIV = document.createElement('div')

export const setupPageSummary = (params: {
    pageId: string,
    promptKey?: keyof typeof viewPromptCreators,
    analyzeUsingAI: (prompt: string) => Promise<string>,
}) => {
    const page = document.getElementById(params.pageId)
    const placeholder = (): HTMLDivElement => {
        const div = page?.querySelector<HTMLDivElement>('div[data-el="analyze-page-summary"]')

        if (!div) {
            console.error(`Placeholder not found for page: ${params.pageId}`)
            return GHOST_DIV // Silent error
        }

        return div
    }

    const promptKey = (params.promptKey || params.pageId.replace('-section', '')) as keyof typeof viewPromptCreators
    const promptCreator = viewPromptCreators[promptKey]

    if (!promptCreator) {
        console.warn(`Prompt not found for page: ${params.pageId}`)
        return
    }

    const onAnalyze = async () => {
        const viewData = getStore('activeViewData')

        if (!viewData) {
            console.warn('No active view data found')
            return
        }

        const { viewId, ...dataWithoutId } = viewData

        placeholder().outerHTML = PageSummaryLoading({ pageId: params.pageId })

        params.analyzeUsingAI(promptCreator(dataWithoutId))
            .then((summary) => {
                placeholder().outerHTML = PageSummaryFinished({ pageId: params.pageId, summary })
            })
            .catch((error) => {
                console.error('Error analyzing page:', error)
            })
    }

    placeholder().outerHTML = PageSummaryInit({ pageId: params.pageId })
    placeholder().querySelector('button')?.addEventListener('click', onAnalyze)

    console.debug('Success setup page summary for page:', params.pageId)
}
