// This module contains all functions for the admin-only user management panel.

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../core/firebase';
import { currentUser, currentUserRole, setAdminCredentials } from '../core/state';
import { userListError, createUserFeedback } from '../core/ui';

/**
 * Ensures a user document exists in Firestore.
 * NOTE: A copy of this also exists in auth.ts. In a larger refactor,
 * this could be moved to a shared `services/users.ts` file.
 */
async function ensureUserDocument(uid: string, email: string | null, role = 'user'): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    try {
      await setDoc(userRef, { uid, email, createdAt: new Date(), role });
    } catch (error) {
      console.error('Error creating user document:', error);
    }
  }
}

/**
 * Deletes a user document from Firestore with safety checks.
 * @param userId - The unique identifier of the user to delete.
 */
async function deleteUserRecord(userId: string): Promise<void> {
  if (userId === currentUser?.uid) {
    alert('For safety, you cannot delete your own user record from this interface.');
    return;
  }
  try {
    await deleteDoc(doc(db, 'users', userId));
    alert('User Firestore record deleted.');
    loadUsersForAdmin();
  } catch (error: any) {
    console.error('Error deleting user record:', error);
    alert(`Error deleting user record: ${error.message}`);
  }
}

/**
 * Loads and displays the list of all users in the admin panel table.
 */
export async function loadUsersForAdmin(): Promise<void> {
  if (currentUserRole !== 'admin') return;
  const userListTbody = document.getElementById('user-list-tbody');
  if (!userListTbody || !userListError) return;

  userListTbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Loading...</td></tr>';
  userListError.classList.add('hidden');

  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    userListTbody.innerHTML = '';
    if (querySnapshot.empty) {
      userListTbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">No users found.</td></tr>';
      return;
    }
    querySnapshot.forEach((docSnap) => {
      const user = docSnap.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.email}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${user.role}</span></td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">${user.uid}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button class="edit-user-btn text-indigo-600 hover:text-indigo-900" data-id="${user.uid}" data-email="${user.email}" data-role="${user.role}">Edit</button>
            <button class="delete-user-btn text-red-600 hover:text-red-900 ml-4" data-id="${user.uid}">Delete</button>
        </td>
      `;
      userListTbody.appendChild(tr);
    });
  } catch (error: any) {
    console.error('Error loading users:', error);
    userListError.textContent = `Error loading users: ${error.message}.`;
    userListError.classList.remove('hidden');
    userListTbody.innerHTML = '';
  }
}

/**
 * Initializes all event listeners for the admin user management panel.
 */
export function initializeAdminPanel(): void {
  document.getElementById('create-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!createUserFeedback) return;

    const email = (document.getElementById('new-user-email') as HTMLInputElement).value;
    const password = (document.getElementById('new-user-password') as HTMLInputElement).value;
    const role = (document.getElementById('new-user-role') as HTMLSelectElement).value;

    if (auth.currentUser) {
      const adminEmail = auth.currentUser.email;
      const adminPassword = prompt('To create a new user, please re-enter your admin password for confirmation:');
      if (!adminPassword) {
        createUserFeedback.textContent = 'Admin password not provided. User creation cancelled.';
        createUserFeedback.className = 'text-red-500 text-sm mb-4 text-center';
        createUserFeedback.classList.remove('hidden');
        return;
      }
      setAdminCredentials({ email: adminEmail!, password: adminPassword });
    } else {
      alert('Admin not signed in. Cannot create user.');
      return;
    }

    createUserFeedback.textContent = 'Creating user...';
    createUserFeedback.className = 'text-blue-500 text-sm mb-4 text-center';
    createUserFeedback.classList.remove('hidden');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      await ensureUserDocument(newUser.uid, newUser.email, role);
      createUserFeedback.textContent = 'User created successfully! You will be re-authenticated as admin momentarily.';
      createUserFeedback.className = 'text-green-500 text-sm mb-4 text-center';
    } catch (error: any) {
      console.error('Error creating user:', error);
      createUserFeedback.textContent = `Error: ${error.message}`;
      createUserFeedback.className = 'text-red-500 text-sm mb-4 text-center';
      setAdminCredentials(null); // Clear credentials on failure
    }
  });

  document.getElementById('user-list-tbody')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const modal = document.getElementById('edit-user-modal');
    if (!modal) return;

    if (target.classList.contains('edit-user-btn')) {
      (modal.querySelector('#edit-user-id') as HTMLInputElement).value = target.dataset.id || '';
      (modal.querySelector('#edit-user-email') as HTMLInputElement).value = target.dataset.email || '';
      (modal.querySelector('#edit-user-role') as HTMLSelectElement).value = target.dataset.role || 'user';
      modal.classList.remove('hidden');
    }
    if (target.classList.contains('delete-user-btn')) {
      const userId = target.dataset.id;
      if (userId && confirm(`Are you sure you want to delete this user's Firestore data? This will NOT delete their login account.`)) {
        deleteUserRecord(userId);
      }
    }
  });

  document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = (document.getElementById('edit-user-id') as HTMLInputElement).value;
    const newEmail = (document.getElementById('edit-user-email') as HTMLInputElement).value;
    const newRole = (document.getElementById('edit-user-role') as HTMLSelectElement).value;

    const userRef = doc(db, 'users', userId);
    try {
      await updateDoc(userRef, { email: newEmail, role: newRole });
      alert('User updated successfully!');
      document.getElementById('edit-user-modal')?.classList.add('hidden');
      loadUsersForAdmin();
    } catch (error: any) {
      console.error('Error updating user:', error);
      alert(`Error updating user: ${error.message}`);
    }
  });

  document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
    document.getElementById('edit-user-modal')?.classList.add('hidden');
  });
}
