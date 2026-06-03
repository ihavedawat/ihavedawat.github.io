// Shared client-side helpers for menu/order pages.
// Kept tiny on purpose — no build step in this project.

// ===== Ordering window configuration (edit times here) =====
// Use 24-hour format (0-23): cutoff time on night before delivery
export const ORDER_CONFIG = {
  OPEN_HOUR: 12,
  OPEN_MINUTE: 30,
  CLOSE_HOUR: 22,
  CLOSE_MINUTE: 0
};

// "YYYY-MM-DD" key for a Date in the user's local timezone.
// We use local time everywhere because everyone (admin + customers)
// operates from Dhaka, and Firestore timestamps stay UTC behind the scenes.
export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Today, with the time component zeroed.
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Next n dates starting from today.
export function nextNDates(n) {
  const out = [];
  const t = startOfToday();
  for (let i = 0; i < n; i++) {
    const d = new Date(t);
    d.setDate(t.getDate() + i);
    out.push(d);
  }
  return out;
}

// "Sat · 31 May 2026" style label.
export function formatDateLabel(d) {
  const parts = d.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  });
  // en-GB renders as "Sat, 31 May 2026" — swap the comma for our · separator.
  return parts.replace(",", " ·");
}

// Cutoff rules:
//  1. Per-date: customer can place / cancel an order for date D only
//     until CLOSE_HOUR on the night before (D-1 at CLOSE_HOUR:CLOSE_MINUTE).
//  2. Daily window: ordering is closed from midnight until OPEN_HOUR:OPEN_MINUTE each day.
//     Orders open at OPEN_HOUR:OPEN_MINUTE and remain open until midnight (subject to per-date cutoff).
// Returns true when ordering for `dateKey` is currently not allowed.
export function orderingClosed(dateKey) {
  const now = new Date();
  // Daily closed window: midnight..OPEN_HOUR:OPEN_MINUTE
  if (now.getHours() < ORDER_CONFIG.OPEN_HOUR || 
      (now.getHours() === ORDER_CONFIG.OPEN_HOUR && now.getMinutes() < ORDER_CONFIG.OPEN_MINUTE)) {
    return true;
  }
  const [y, m, d] = dateKey.split("-").map(Number);
  // Cutoff is CLOSE_HOUR:CLOSE_MINUTE on the previous day
  const cutoff = new Date(y, m - 1, d, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(ORDER_CONFIG.CLOSE_HOUR, ORDER_CONFIG.CLOSE_MINUTE, 0, 0);
  return now.getTime() >= cutoff.getTime();
}

// Returns true once the CLOSE_HOUR:CLOSE_MINUTE (previous day) deadline for `dateKey` has passed.
// Unlike `orderingClosed`, this is NOT affected by the daily closed window
// — so an order placed before the deadline stays editable during the next
// day's closed window (it only locks after its own deadline).
export function pastCutoff(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const cutoff = new Date(y, m - 1, d, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(ORDER_CONFIG.CLOSE_HOUR, ORDER_CONFIG.CLOSE_MINUTE, 0, 0);
  return Date.now() >= cutoff.getTime();
}

// Returns a human-friendly label for when the ordering window closes today.
// E.g., "today at 8:19 PM" or "today at 12:00 AM" (if midnight)
export function formatTodaysCloseTime() {
  const closeDate = new Date();
  closeDate.setHours(ORDER_CONFIG.CLOSE_HOUR, ORDER_CONFIG.CLOSE_MINUTE, 0, 0);
  const time = closeDate.toLocaleTimeString("en-US",
    { hour: "2-digit", minute: "2-digit", hour12: true });
  return "today at " + time;
}

// Returns the next Date at which the ordering window opens again.
//  - Before OPEN_HOUR:OPEN_MINUTE today  → today at OPEN_HOUR:OPEN_MINUTE.
//  - OPEN_HOUR:OPEN_MINUTE or later      → tomorrow at OPEN_HOUR:OPEN_MINUTE.
//  - In-between: window is currently open; we still return tomorrow's
//    OPEN_HOUR:OPEN_MINUTE so callers can render a generic "next window" hint.
export function nextOrderingOpen(now = new Date()) {
  const t = new Date(now);
  t.setSeconds(0, 0);
  // Opening time is OPEN_HOUR:OPEN_MINUTE
  if (now.getHours() < ORDER_CONFIG.OPEN_HOUR || 
      (now.getHours() === ORDER_CONFIG.OPEN_HOUR && now.getMinutes() < ORDER_CONFIG.OPEN_MINUTE)) {
    t.setHours(ORDER_CONFIG.OPEN_HOUR, ORDER_CONFIG.OPEN_MINUTE, 0, 0);
    return t;
  }
  t.setDate(t.getDate() + 1);
  t.setHours(ORDER_CONFIG.OPEN_HOUR, ORDER_CONFIG.OPEN_MINUTE, 0, 0);
  return t;
}

// Short, human-friendly label for a future Date, e.g. "today at 12:00 PM"
// or "tomorrow at 12:00 PM" or "Mon, 2 Jun at 12:00 PM".
export function formatNextOpenLabel(date, now = new Date()) {
  const today = new Date(now); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const d0 = new Date(date); d0.setHours(0,0,0,0);
  const time = date.toLocaleTimeString("en-US",
    { hour: "2-digit", minute: "2-digit", hour12: true });
  if (d0.getTime() === today.getTime())    return "today at "    + time;
  if (d0.getTime() === tomorrow.getTime()) return "tomorrow at " + time;
  return date.toLocaleDateString("en-GB",
    { weekday: "short", day: "numeric", month: "short" }) + " at " + time;
}

// Format a number as BDT.
export function formatTk(n) {
  return "৳" + Number(n || 0).toLocaleString("en-IN");
}

// ----- Weekday helpers -----
// We store the menu as a single weeklyMenu/main document keyed by weekday.
// Display order starts on Saturday because the BD work week typically
// starts Sat/Sun (Friday is the weekend).
export const WEEKDAY_KEYS    = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // matches Date.getDay()
export const WEEKDAY_ORDER   = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
export const WEEKDAY_LABELS  = {
  sat: "Saturday", sun: "Sunday", mon: "Monday", tue: "Tuesday",
  wed: "Wednesday", thu: "Thursday", fri: "Friday"
};
export function weekdayKey(date) {
  return WEEKDAY_KEYS[date.getDay()];
}

// Display 404 content inline without changing the URL
export async function show404() {
  try {
    const resp = await fetch("404");
    if (!resp.ok) throw new Error("Failed to load 404");
    const html = await resp.text();
    document.documentElement.innerHTML = html;
    // Ensure stars.js loads for the real 404
    const starScript = document.createElement("script");
    starScript.src = "stars.js";
    document.body.appendChild(starScript);
  } catch (err) {
    console.error("Could not load 404 page:", err);
    document.documentElement.innerHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>404</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=DotGothic16&display=swap">
          <link rel="stylesheet" href="style.css">
          <style>
            body { padding: 40px; text-align: center; }
          </style>
        </head>
        <body class="login-page">
          <div class="starfield" aria-hidden="true">
            <span class="star-layer s-small"></span>
            <span class="star-layer s-big"></span>
          </div>
          <div class="shooting-stars" aria-hidden="true">
            <span class="shoot s1"></span>
            <span class="shoot s2"></span>
            <span class="shoot s3"></span>
          </div>
          <div class="lights">
            <span class="bulb c1"></span><span class="bulb c2"></span><span class="bulb c3"></span><span class="bulb c4"></span><span class="bulb c5"></span>
            <span class="bulb c1"></span><span class="bulb c2"></span><span class="bulb c3"></span><span class="bulb c4"></span><span class="bulb c5"></span>
            <span class="bulb c1"></span><span class="bulb c2"></span><span class="bulb c3"></span><span class="bulb c4"></span><span class="bulb c5"></span>
          </div>
          <div class="top-fixed">
            <div class="brand">DAWAT</div>
            <div class="tagline">★ আপনার নিমন্ত্রণ ★</div>
          </div>
          <h1>404</h1>
          <p>This page doesn't exist.</p>
          <div class="form-wrap" style="text-align:center;">
            <a href="/" class="ghost-btn" style="display:inline-block; text-decoration:none;">▶ Go home</a>
          </div>
        </body>
      </html>
    `;
    // Load stars.js for fallback 404
    const starScript = document.createElement("script");
    starScript.src = "stars.js";
    document.body.appendChild(starScript);
  }
}
