import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore'
const COLLECTION = 'analysisCache'

export async function findLiveCache(filtersHash: string, dataHash: string): Promise<any | null> {
    const db = getFirestore()
    const colRef = collection(db, COLLECTION)
    const q = query(colRef, where('filtersHash', '==', filtersHash), where('dataHash', '==', dataHash))
    const snap = await getDocs(q)
    for (const d of snap.docs) {
        const data = d.data()
        // Live docs must NOT have expireAt
        if (!data.expireAt) return { id: d.id, ...data }
    }
    return null
}

export async function deactivateHistoricalCache(filtersHash: string): Promise<void> {
    const db = getFirestore()
    const colRef = collection(db, COLLECTION)
    const q = query(colRef, where('filtersHash', '==', filtersHash))
    const snap = await getDocs(q)
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 90)

    const updates: Promise<void>[] = []
    for (const d of snap.docs) {
        const data = d.data()
        // Only set expireAt for documents that don't already have one
        if (!data.expireAt) {
            const docRef = doc(db, COLLECTION, d.id)
            updates.push(updateDoc(docRef, { expireAt }).then(() => {}))
        }
    }

    await Promise.all(updates)
}

export async function createLiveCache(data: { filtersHash: string, dataHash: string, summary: string, filters: any, usageMetadata?: any }): Promise<void> {
    const db = getFirestore()
    const colRef = collection(db, COLLECTION)
    const payload = {
        filtersHash: data.filtersHash,
        dataHash: data.dataHash,
        summary: data.summary,
        filters: data.filters,
        createdAt: new Date().toISOString(),
        ...(data.usageMetadata && { usageMetadata: data.usageMetadata })
        // NOTE: Intentionally omit expireAt for live documents
    }
    await addDoc(colRef, payload)
}
