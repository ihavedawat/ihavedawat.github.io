import { auth } from "./firebase.js";

// Deprecated: Notifications are now sent server-side from API endpoints
// This function is kept for backwards compatibility but does nothing
export async function notifyAdminsViaAPI({ message, link = "", linkText = "", type = "info" }) {
  // Server-side notifications are now handled by the API endpoints
  // (orders.js, topups.js, etc.)
  return;
}
