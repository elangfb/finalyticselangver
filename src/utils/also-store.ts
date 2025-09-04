import { AppActions } from "@/store"

type CompatibleStorage = Pick<AppActions, 'setActiveViewData'>

export function createAlsoStoreFn(store: CompatibleStorage, viewId: string) {
    return function alsoStore<TValueForUser, TValueForAI>(
        valueForUser: TValueForUser,
        valueTransformer?: (value: TValueForUser) => TValueForAI,
    ) {
        const storedValue = valueTransformer?.(valueForUser) || valueForUser
        store.setActiveViewData(viewId, storedValue)
        return valueForUser
    }
}
