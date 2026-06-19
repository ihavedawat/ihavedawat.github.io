// Ordering window: 12:30 PM to 10:00 PM (overnight cutoff for next day orders)
// Closed midnight-12:30 PM each day. Per-date cutoff: 10 PM night before delivery
export const ORDER_CONFIG = {
  OPEN_HOUR: 0,
  OPEN_MINUTE: 1,
  CLOSE_HOUR: 23,
  CLOSE_MINUTE: 59
};

export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

export function formatDateLabel(d) {
  const parts = d.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  });
  return parts.replace(",", " ·");
}

// Check if ordering for a date is closed (respects daily window + per-date cutoff)
export function orderingClosed(dateKey) {
  const now = new Date();
  if (now.getHours() < ORDER_CONFIG.OPEN_HOUR || 
      (now.getHours() === ORDER_CONFIG.OPEN_HOUR && now.getMinutes() < ORDER_CONFIG.OPEN_MINUTE)) {
    return true;
  }
  const [y, m, d] = dateKey.split("-").map(Number);
  const cutoff = new Date(y, m - 1, d, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(ORDER_CONFIG.CLOSE_HOUR, ORDER_CONFIG.CLOSE_MINUTE, 0, 0);
  return now.getTime() >= cutoff.getTime();
}

// Check if per-date cutoff (CLOSE_HOUR on previous day) has passed
export function pastCutoff(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const cutoff = new Date(y, m - 1, d, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(ORDER_CONFIG.CLOSE_HOUR, ORDER_CONFIG.CLOSE_MINUTE, 0, 0);
  return Date.now() >= cutoff.getTime();
}

export function formatTodaysCloseTime() {
  const closeDate = new Date();
  closeDate.setHours(ORDER_CONFIG.CLOSE_HOUR, ORDER_CONFIG.CLOSE_MINUTE, 0, 0);
  const time = closeDate.toLocaleTimeString("en-US",
    { hour: "2-digit", minute: "2-digit", hour12: true });
  return "today at " + time;
}

export function nextOrderingOpen(now = new Date()) {
  const t = new Date(now);
  t.setSeconds(0, 0);
  if (now.getHours() < ORDER_CONFIG.OPEN_HOUR || 
      (now.getHours() === ORDER_CONFIG.OPEN_HOUR && now.getMinutes() < ORDER_CONFIG.OPEN_MINUTE)) {
    t.setHours(ORDER_CONFIG.OPEN_HOUR, ORDER_CONFIG.OPEN_MINUTE, 0, 0);
    return t;
  }
  t.setDate(t.getDate() + 1);
  t.setHours(ORDER_CONFIG.OPEN_HOUR, ORDER_CONFIG.OPEN_MINUTE, 0, 0);
  return t;
}

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

export function formatTk(n) {
  return "৳" + Number(n || 0).toLocaleString("en-IN");
}

export function getActiveOrderDateKey(now = new Date()) {
  const today = startOfToday();
  const todayKey = toDateKey(today);
  if (now.getHours() < ORDER_CONFIG.OPEN_HOUR || 
      (now.getHours() === ORDER_CONFIG.OPEN_HOUR && now.getMinutes() < ORDER_CONFIG.OPEN_MINUTE)) {
    return todayKey;
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toDateKey(tomorrow);
}

// Weekday display order: Sat first (BD work week starts Sat/Sun, Fri is weekend)
export const WEEKDAY_KEYS    = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const WEEKDAY_ORDER   = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
export const WEEKDAY_LABELS  = {
  sat: "Saturday", sun: "Sunday", mon: "Monday", tue: "Tuesday",
  wed: "Wednesday", thu: "Thursday", fri: "Friday"
};
export function weekdayKey(date) {
  return WEEKDAY_KEYS[date.getDay()];
}

export async function show404() {
  try {
    const resp = await fetch("404");
    if (!resp.ok) throw new Error("Failed to load 404");
    const html = await resp.text();
    document.documentElement.innerHTML = html;
    const starScript = document.createElement("script");
    starScript.src = "/js/stars.js";
    document.body.appendChild(starScript);
  } catch (err) {
    document.documentElement.innerHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>404</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=DotGothic16&display=swap">
          <link rel="stylesheet" href="/css/style.css">
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
    const starScript = document.createElement("script");
    starScript.src = "/js/stars.js";
    document.body.appendChild(starScript);
  }
}
