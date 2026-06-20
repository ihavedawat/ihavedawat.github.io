import { auth } from "./firebase.js";

// Send admin notification via backend API (bypasses client-side permission restrictions)
export async function notifyAdminsViaAPI({ message, link = "", linkText = "", type = "info" }) {
  if (!message) return;
  try {
    const user = auth.currentUser;
    if (!user) return; // Not logged in

    const token = await user.getIdToken();
    const response = await fetch(window.location.origin + "/api/admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'notify', message, link, linkText, type })
    });

    if (!response.ok) {
      console.warn("Failed to send admin notification:", await response.json());
    }
  } catch (err) {
    console.warn("Error notifying admins:", err);
  }
}
