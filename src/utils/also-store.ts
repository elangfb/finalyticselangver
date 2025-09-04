import { AppActions } from "@/store"

type CompatibleStorage = Pick<AppActions, 'setActiveViewData'>
type ValueTransformer<TValueForUser, TValueForAI> = (value: TValueForUser) => TValueForAI

export function createAlsoStoreFn(store: CompatibleStorage, viewId: string) {
    return function alsoStore<TValueForUser, TValueForAI>(
        valueForUser: TValueForUser,
        valueTransformer?: ValueTransformer<TValueForUser, TValueForAI>,
    ) {
        const storedValue = valueTransformer?.(valueForUser) || valueForUser
        store.setActiveViewData(viewId, storedValue)
        return valueForUser
    }
}

export type AlsoStoreFn = ReturnType<typeof createAlsoStoreFn>

export function maybeAlsoStore<TValueForUser, TValueForAI>(
    alsoStore: AlsoStoreFn | undefined | null,
    value: TValueForUser,
    valueTransformer?: ValueTransformer<TValueForUser, TValueForAI>
) {
    return alsoStore?.(value, valueTransformer) || value
}

export function createMaybeAlsoStoreFn(alsoStore: AlsoStoreFn | undefined | null) {
    return function <TValueForUser, TValueForAI>(
        value: TValueForUser,
        valueTransformer?: ValueTransformer<TValueForUser, TValueForAI>
    ) {
        return maybeAlsoStore(alsoStore, value, valueTransformer);
    } satisfies AlsoStoreFn
}
