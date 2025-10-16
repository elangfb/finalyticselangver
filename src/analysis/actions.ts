// In src/analysis/actions.ts

import { currentUser } from '@/core/state'
import { showLoading, hideLoading } from '@/core/ui'
import { showView } from '@/core/views'
import { getSummariesFromCache, saveSummariesToCache, clearSummariesCache } from '@/services/localCacheService'
import { collectionGroup, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/core/firebase'
import * as $store from '@/store'
import { doc, getDoc, collection, query, where, getDocs, collectionGroup } from 'firebase/firestore';

/**
 * Fetches all necessary data and navigates to a specified analysis view.
 * This is the central function for entering either the standard or premium analysis dashboards.
 */
export async function viewCompiledAnalysis(targetView: 'analysis' | 'premium-analysis' | 'arunami-internal') {
  if (!currentUser) return

  if (targetView === 'premium-analysis' || targetView === 'arunami-internal') {
    showLoading({ message: 'Checking user data...', value: 10 })

    // First, check if the user has uploaded their own data
    const userDocRef = doc(db, 'users', currentUser.uid)
    const userDocSnap = await getDoc(userDocRef)
    const hasUploadedData = userDocSnap.data()?.hasUploadedData ?? false

    if (!hasUploadedData) {
      // If user has no data, load the demo data from a central location
      showLoading({ message: 'Loading Demo Data...', value: 30 })
      try {
        const demoQuery = query(collection(db, 'demoTemplate/salesData/dailySummaries'))
        const querySnapshot = await getDocs(demoQuery)
        const demoSummaries = querySnapshot.docs.map((doc) => ({ ...doc.data(), date: new Date(doc.data().date) }))

        $store.setAllSalesData(demoSummaries)
        hideLoading()
        showView(targetView)
        return // Exit here after loading demo data
      } catch (error) {
        console.error('Failed to load demo data:', error)
        alert('Could not load demo data. Please contact support.')
        hideLoading()
        return
      }
    }
  }
  // Caching logic applies to premium-like views
  if (targetView === 'premium-analysis' || targetView === 'arunami-internal') {
    showLoading({ message: 'Checking for cached data...', value: 20 })
    try {
      const cachedData = await getSummariesFromCache()
      if (cachedData) {
        const summariesFromCache = cachedData.map((s: any) => ({ ...s, date: new Date(s.date) }))
        $store.setAllSalesData(summariesFromCache)
        hideLoading()
        showView(targetView)
        return
      }
    } catch (e) {
      console.error('Failed to read from cache. Fetching from DB.', e)
      await clearSummariesCache()
    }
  }

  // Fallback to Firestore if no cache or if it's the standard view
  showLoading({ message: 'Fetching all daily summaries...', value: 10 })
  try {
    const summariesQuery = query(collectionGroup(db, 'dailySummaries'), where('userId', '==', currentUser.uid))
    const querySnapshot = await getDocs(summariesQuery)
    const allSummaries = querySnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id, date: new Date(doc.data().date) }))
    const validSummaries = allSummaries.filter((s) => s.date instanceof Date && !isNaN(s.date.getTime()))

    if (validSummaries.length === 0) {
      alert('No summarized data found. Please upload a file first.')
      hideLoading()
      return
    }

    validSummaries.sort((a, b) => a.date.getTime() - b.date.getTime())

    if (targetView === 'premium-analysis' || targetView === 'arunami-internal') {
      await saveSummariesToCache(validSummaries)
    }

    $store.setAllSalesData(validSummaries)
    hideLoading()
    showView(targetView)
  } catch (error: any) {
    console.error('Failed to compile analysis from summaries:', error)
    hideLoading()
    alert(`An error occurred while fetching your data: ${error.message}`)
  }
}
