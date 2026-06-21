// Shared admin helpers: purge functions used by both admin-view.js and settings-admin.html.

import { auth } from "./firebase.js";

export function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Purge all user data via backend API (only admins can call this)
export async function purgeAllUsersData(excludeEmails = []) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch('https://igotdawat.vercel.app/api/admin', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'delete-all',
      deleteAll: true
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to delete user data');
  }

  const result = await response.json();
  return result.totalDeleted || 0;
}
