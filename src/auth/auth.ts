// This module centralizes all authentication logic, including session management and UI setup based on user roles.

import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/core/firebase'
import { showView } from '@/core/views'
import { setCurrentUser, setCurrentUserRole, adminCredentials, setAdminCredentials, currentUserRole } from '@/core/state'
import { populateCompiledDataTable } from '../data-hub/table'
import { loadGeminiConfig } from '@/config/gemini'
import { authError, signupError } from '@/core/ui'
import { viewCompiledAnalysis } from '@/analysis/actions'
import { clearSummariesCache } from '@/services/localCacheService';

/**
 * Ensures a user document exists in Firestore with basic profile information.
 * @param uid The user's unique identifier.
 * @param email The user's email address.
 * @param role The user's role (defaults to 'user').
 */
async function ensureUserDocument(uid: string, email: string | null, role = 'user'): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    try {
      // START MODIFICATION
      await setDoc(userRef, { 
        uid, 
        email, 
        createdAt: new Date(), 
        role,
        hasUploadedData: false // Add this flag for new users
      });
      // END MODIFICATION
    } catch (error) {
      console.error('Error creating user document:', error);
    }
  }
}

/**
 * Fetches the user's role from Firestore and configures the UI based on permissions.
 * @param user The Firebase Auth user object.
 */
export async function fetchUserRoleAndSetupUI(user: User): Promise<void> {
  const userDocRef = doc(db, 'users', user.uid)
  const userDocSnap = await getDoc(userDocRef)

  if (userDocSnap.exists()) {
    setCurrentUserRole(userDocSnap.data().role || 'user')
  } else {
    await ensureUserDocument(user.uid, user.email)
    setCurrentUserRole('user')
  }

  document.getElementById('user-management-btn')?.classList.toggle('hidden', currentUserRole !== 'admin')
  document.getElementById('konfigurasi-btn')?.classList.toggle('hidden', currentUserRole !== 'admin')

  if (currentUserRole === 'admin') {
    loadGeminiConfig()
  }
  await viewCompiledAnalysis('premium-analysis');
}

/**
 * Initializes all authentication-related listeners and form handlers for the application.
 */
export function initializeAuth(): void {
  // Main listener for changes in the user's sign-in state.
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      setCurrentUser(user)
      if (!adminCredentials) {
        await fetchUserRoleAndSetupUI(user)
      }
    } else {
      // Handle admin re-login after creating a new user.
      if (adminCredentials) {
        signInWithEmailAndPassword(auth, adminCredentials.email, adminCredentials.password)
          .then(async (userCredential) => {
            await fetchUserRoleAndSetupUI(userCredential.user)
            setAdminCredentials(null)
            showView('usermanagement')
          })
          .catch((err) => {
            console.error('Admin re-login failed:', err)
            setAdminCredentials(null)
            showView('auth')
          })
      } else {
        try {
          await clearSummariesCache();
          console.log('Local cache cleared on logout.');
        } catch (error) {
          console.error('Failed to clear cache on logout:', error);
        }
        // --- END MODIFICATION ---

        setCurrentUser(null);
        setCurrentUserRole('user');
        showView('auth');
        document.getElementById('user-management-btn')?.classList.add('hidden');
      }
    }
  })

  // --- Form and Button Listeners ---
  document.getElementById('show-signup-link')?.addEventListener('click', (e) => {
    e.preventDefault()
    document.getElementById('login-form')?.classList.add('hidden')
    document.getElementById('signup-form')?.classList.remove('hidden')
  })

  document.getElementById('show-login-link')?.addEventListener('click', (e) => {
    e.preventDefault()
    document.getElementById('signup-form')?.classList.add('hidden')
    document.getElementById('login-form')?.classList.remove('hidden')
  })

  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const email = (document.getElementById('login-email') as HTMLInputElement).value
    const password = (document.getElementById('login-password') as HTMLInputElement).value
    signInWithEmailAndPassword(auth, email, password).catch((error) => {
      if (authError) {
        authError.textContent = error.message
        authError.classList.remove('hidden')
      }
    })
  })

  document.getElementById('signup-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const email = (document.getElementById('signup-email') as HTMLInputElement).value
    const password = (document.getElementById('signup-password') as HTMLInputElement).value
    createUserWithEmailAndPassword(auth, email, password).catch((error) => {
      if (signupError) {
        signupError.textContent = error.message
        signupError.classList.remove('hidden')
      }
    })
  })

  document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth))
}
