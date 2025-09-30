// This file manages application-wide global state that isn't part of the Zustand store.

import { User } from 'firebase/auth'

// --- Global State ---
// These variables are exported so they can be read by other modules.
// The setter functions are the preferred way to modify them to maintain a clear data flow.
export let currentUser: User | null = null
export let currentUserRole: 'user' | 'admin' = 'user'
export let adminCredentials: { email: string, password: string } | null = null
export let currentView: string | null = null

export function setCurrentUser(user: User | null): void {
  currentUser = user
}

export function setCurrentUserRole(role: 'user' | 'admin'): void {
  currentUserRole = role
}

export function setAdminCredentials(credentials: { email: string, password: string } | null): void {
  adminCredentials = credentials
}

export function setCurrentView(viewName: string | null): void {
  currentView = viewName
}
