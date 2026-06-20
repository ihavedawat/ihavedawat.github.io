// Shared admin view: applications list + per-card actions.
// Used by both applications.html (Applications) and users.html (Users).
// The host page sets `<body data-group="applications">` or
// `data-group="users"` to pick which set of pills/filters this page
// operates on. Everything else (card layout, actions, password reveal,
// clear-all, Firestore wiring) is the same on both pages.

import { db, auth } from "./firebase.js";
import {
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { mountNotificationBell } from "./notifications.js";
import { confirmDialog, typeToConfirmDialog, alertDialog, passwordConfirmDialog } from "./modal.js";
import { show404, formatTk } from "./app-utils.js";
import { getBalance, subscribeWallet } from "./wallet.js";

// Verify the currently-signed-in admin's password. Used to gate the
// most destructive actions (Wipe data, Clear all). Returns true on
// success, false on wrong password, throws on network/unknown errors.
async function verifyAdminPassword(password) {
  const u = auth.currentUser;
  if (!u || !u.email) return false;
  try {
    const cred = EmailAuthProvider.credential(u.email, password);
    await reauthenticateWithCredential(u, cred);
    return true;
  } catch (err) {
    const code = err && err.code ? err.code : "";
    if (code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-login-credentials" ||
        code === "auth/user-mismatch") {
      return false;
    }
    throw err;
  }
}

import { ADMIN_EMAILS } from "./admin-config.js";

// Firebase URLs
const FIREBASE_AUTH_CONSOLE = "https://console.firebase.google.com/project/igotdawat-v1/authentication/users";

const GROUPS = {
  applications: ["pending", "approved", "rejected"],
  users:        ["customer", "banned"]
};

const group = document.body.dataset.group;
if (!GROUPS[group]) {
  throw new Error('admin-view.js: missing/invalid <body data-group="…">');
}
const FILTERS = GROUPS[group];
const STORED_FILTER_KEY = "dawat:adminFilter:" + group;

// ----- Element refs -----
const appsView    = document.getElementById("apps-view");
const whoEmail    = document.getElementById("admin-who-email");
const signoutBtn  = document.getElementById("signout-btn");
const listEl      = document.getElementById("apps-list");
const subtitle    = document.getElementById("admin-subtitle");
const pills       = document.querySelectorAll(".pill[data-filter]");
const clearAllBtn = document.getElementById("clear-all-btn");

// ----- State -----
const hashRaw  = (location.hash || "").replace(/^#/, "");
const stored   = localStorage.getItem(STORED_FILTER_KEY);
let currentFilter =
  (FILTERS.includes(hashRaw)) ? hashRaw :
  (stored && FILTERS.includes(stored)) ? stored :
  FILTERS[0];

let unsubscribeList = null;
let currentItems    = [];
const APPS_PER_PAGE = 10;
let appsPage        = 0;
const filterCounts  = {}; // Track counts for each filter
const walletBalancesById = {}; // Cache user wallet balances by UID
const walletBalancesByEmail = {}; // Fallback cache when UID is missing
let unsubscribers   = []; // Track all subscriptions for cleanup

async function getWalletBalanceByEmail(email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return 0;
  if (key in walletBalancesByEmail) return walletBalancesByEmail[key];
  const walletSnap = await getDocs(query(collection(db, "wallets"), where("email", "==", key)));
  const balance = walletSnap.docs.length
    ? Number(walletSnap.docs[0].data().balance || 0)
    : 0;
  walletBalancesByEmail[key] = balance;
  return balance;
}

async function loadWalletBalancesForPage(items) {
  const ids = [...new Set(items.map((a) => a.userId).filter(Boolean))];
  const emails = [...new Set(items.map((a) => String(a.email || "").trim().toLowerCase()).filter(Boolean))];
  await Promise.all([
    ...ids.map(async (userId) => {
      walletBalancesById[userId] = await getBalance(userId);
    }),
    ...emails.map(async (email) => {
      if (!(email in walletBalancesByEmail)) {
        walletBalancesByEmail[email] = await getWalletBalanceByEmail(email);
      }
    })
  ]);
  
  // Set up subscriptions for live updates
  items.forEach((app) => {
    // Subscribe by userId if available
    if (app.userId) {
      const unsub = subscribeWallet(app.userId, (balance) => {
        walletBalancesById[app.userId] = balance;
        const span = document.querySelector(`.card-balance[data-user-id="${app.userId}"]`);
        if (span) span.textContent = `(${formatTk(balance)})`;
      });
      unsubscribers.push(unsub);
    }
    // Subscribe by email if no userId
    else {
      const email = String(app.email || "").trim().toLowerCase();
      if (email) {
        const unsub = onSnapshot(
          query(collection(db, "wallets"), where("email", "==", email)),
          (snap) => {
            const balance = snap.docs.length ? Number(snap.docs[0].data().balance || 0) : 0;
            walletBalancesByEmail[email] = balance;
            const span = document.querySelector(`.card-balance[data-email="${email}"]`);
            if (span) span.textContent = `(${formatTk(balance)})`;
          }
        );
        unsubscribers.push(unsub);
      }
    }
  });
}

function syncPills() {
  pills.forEach((pill) => {
    const filter = pill.dataset.filter;
    const count = filterCounts[filter] || 0;
    const active = filter === currentFilter;
    pill.classList.toggle("is-active", active);
    pill.setAttribute("aria-selected", active ? "true" : "false");
    pill.textContent = filter.charAt(0).toUpperCase() + filter.slice(1) + " (" + count + ")";
  });
}

function writeHash() {
  const target = currentFilter === FILTERS[0] ? "" : "#" + currentFilter;
  const want = target || location.pathname + location.search;
  if (target) {
    if (location.hash !== target) history.replaceState(null, "", target);
  } else if (location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

syncPills();
writeHash();

// Initialize count display (will be updated by subscriptions)
FILTERS.forEach(f => {
  filterCounts[f] = 0;
});
syncPills();

// ----- Sign out -----
signoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/";
});

// ----- Auth state drives access -----
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("/");
    return;
  }
  if (!ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
    await show404();
    return;
  }
  appsView.hidden       = false;
  if (subtitle) {
    subtitle.textContent = group === "users"
      ? "Manage active and banned users."
      : "Review and approve applications.";
  }
  whoEmail.textContent  = user.email;
  mountNotificationBell({ user });
  subscribeToApplications(currentFilter);
  if (window.dawatReanchorStars) window.dawatReanchorStars();
});

// ----- Filter pills -----
pills.forEach((pill) => {
  pill.addEventListener("click", () => {
    currentFilter = pill.dataset.filter;
    appsPage = 0;
    localStorage.setItem(STORED_FILTER_KEY, currentFilter);
    syncPills();
    writeHash();
    subscribeToApplications(currentFilter);
  });
});

// ----- Hash-driven filter switching (back/forward + deep links) -----
window.addEventListener("hashchange", () => {
  const f = (location.hash || "").replace(/^#/, "");
  const nextFilter = FILTERS.includes(f) ? f : FILTERS[0];
  if (nextFilter === currentFilter) return;
  currentFilter = nextFilter;
  appsPage      = 0;
  localStorage.setItem(STORED_FILTER_KEY, currentFilter);
  syncPills();
  subscribeToApplications(currentFilter);
});

// ----- Live-subscribe to applications matching the current filter -----
// "approved" status in Firestore covers two UI tabs:
//   - Approved (in Applications): not yet activated
//   - Active   (in Users): credsIssued && mustChangePassword === false
// Both subscribe to status==approved and filter on the client.
function subscribeToApplications(filter) {
  if (unsubscribeList) unsubscribeList();
  listEl.innerHTML = '<p class="apps-empty">Loading<span class="loading-dots"><span></span><span></span><span></span></span></p>';
  
  // Subscribe to all filters for count tracking
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
  
  FILTERS.forEach(f => {
    const statusForQuery = (f === "customer") ? "approved" : f;
    const q = query(
      collection(db, "applications"),
      where("status", "==", statusForQuery)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (f === "approved") {
          items = items.filter((a) => !a.credsIssued || a.mustChangePassword !== false);
        } else if (f === "customer") {
          items = items.filter((a) => !!a.credsIssued && a.mustChangePassword === false);
        }
        filterCounts[f] = items.length;
        syncPills();
      },
      (err) => console.error("Error counting " + f + ":", err)
    );
    unsubscribers.push(unsub);
  });

  // Now subscribe to the current filter for display
  const statusForQuery = (filter === "customer") ? "approved" : filter;
  const q = query(
    collection(db, "applications"),
    where("status", "==", statusForQuery)
  );
  unsubscribeList = onSnapshot(
    q,
    (snap) => {
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (filter === "approved") {
        items = items.filter((a) => !a.credsIssued || a.mustChangePassword !== false);
      } else if (filter === "customer") {
        items = items.filter((a) => !!a.credsIssued && a.mustChangePassword === false);
      }
      items.sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      currentItems = items;
      const deletableCount = items.filter((a) =>
        !(filter === "approved" && !!a.credsIssued)
      ).length;
      clearAllBtn.hidden = deletableCount === 0 || filter === "customer";
      const skipsSent = filter === "approved";
      clearAllBtn.textContent = skipsSent
        ? "Delete all unsent " + currentFilter + " (" + deletableCount + ")"
        : "Delete all " + currentFilter + " (" + deletableCount + ")";
      renderList(items);
    },
    (err) => {
      console.error(err);
      listEl.innerHTML =
        '<p class="apps-empty is-error">⚠ Could not load applications. ' +
        'You may not have permission, or the server is unreachable.</p>';
    }
  );
}

async function renderList(items) {
  if (!items.length) {
    listEl.innerHTML =
      '<p class="apps-empty">No ' + currentFilter + ' applications.</p>';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(items.length / APPS_PER_PAGE));
  if (appsPage >= totalPages) appsPage = totalPages - 1;
  if (appsPage < 0) appsPage = 0;
  const start = appsPage * APPS_PER_PAGE;
  const pageItems = items.slice(start, start + APPS_PER_PAGE);
  if ((currentFilter === "customer" || currentFilter === "banned") && pageItems.length > 0) {
    try {
      await loadWalletBalancesForPage(pageItems);
    } catch (err) {
      console.error("Failed to load wallet balances:", err);
    }
  }
  const cardsHTML = pageItems.map(cardHTML).join("");
  const pager = items.length > APPS_PER_PAGE
    ? `<div class="wallet-pager">
        <button type="button" class="ghost-btn" data-pager="prev"${appsPage === 0 ? " disabled" : ""}>◀ Prev</button>
        <span>Page ${appsPage + 1} / ${totalPages}</span>
        <button type="button" class="ghost-btn" data-pager="next"${appsPage >= totalPages - 1 ? " disabled" : ""}>Next ▶</button>
      </div>`
    : "";
  listEl.innerHTML = cardsHTML + pager;
  listEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleAction(btn.dataset.id, btn.dataset.action, btn)
    );
  });
  listEl.querySelectorAll("[data-pager]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.pager === "prev") appsPage = Math.max(0, appsPage - 1);
      else appsPage += 1;
      renderList(currentItems);
    });
  });
}

const ICON_EYE     = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.77 19.77 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.85 19.85 0 0 1-3.17 4.19M9.88 9.88a3 3 0 1 0 4.24 4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const ICON_COPY    = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_CHECK   = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function cardHTML(app) {
  const created = app.createdAt && app.createdAt.toDate
    ? (() => {
        const dt = app.createdAt.toDate();
        const date = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
        const time = dt.toLocaleTimeString();
        return date + ", " + time;
      })()
    : "—";

  let headerExtras = "";
  let actions = "";
  if (currentFilter === "pending") {
    actions = `
      <button type="button" class="btn-delete" data-action="delete"  data-id="${app.id}">🗑 Delete</button>
      <button type="button" class="btn-approve" data-action="approve" data-id="${app.id}">✓ Approve</button>
      <button type="button" class="btn-reject"  data-action="reject"  data-id="${app.id}">✗ Reject</button>`;
  } else if (currentFilter === "approved") {
    const credsSent = !!app.credsIssued;
    if (credsSent) {
      headerExtras = '<span class="card-status status-sent" title="Credentials marked as sent — waiting for user to change password">SENT</span>';
      actions = `
        <button type="button" class="btn-move"   data-action="unmark-sent" data-id="${app.id}">↶ Undo sent</button>`;
    } else {
      const mailto = gmailHref(app, "approved");
      headerExtras = `
        <a class="head-link" target="_blank" rel="noopener"
           href="${FIREBASE_AUTH_CONSOLE}"
           title="Create the user account">+ Add User</a>
        <a class="head-link" target="_blank" rel="noopener" href="${mailto}" title="Send credentials via Gmail">✉ Email</a>`;
      actions = `
        <button type="button" class="btn-delete"  data-action="delete"      data-id="${app.id}">🗑 Delete</button>
        <button type="button" class="btn-move"    data-action="to-pending"  data-id="${app.id}">↶ Move to Pending</button>
        <button type="button" class="btn-reject"  data-action="to-rejected" data-id="${app.id}">✗ Move to Rejected</button>
        <button type="button" class="btn-sent" data-action="mark-sent"   data-id="${app.id}">✉ Mark as sent</button>`;
    }
  } else if (currentFilter === "customer") {
    const banPending = !!app.banPending;
    headerExtras = '<span class="card-status status-active" title="Live customer — logged in and using their own password">ACTIVE</span>';
    if (banPending) {
      actions = `
        <button type="button" class="btn-move"   data-action="cancel-ban"      data-id="${app.id}">↶ Cancel ban</button>
        <button type="button" class="btn-reject" data-action="mark-as-banned"  data-id="${app.id}">⛔ Mark as banned</button>`;
    } else {
      actions = `
        <button type="button" class="btn-delete" data-action="wipe-data" data-id="${app.id}" title="Delete all of this user's orders, wallet, history, top-ups and notifications">Wipe data</button>
        <button type="button" class="btn-reject" data-action="begin-ban" data-id="${app.id}">⛔ Ban</button>`;
    }
  } else if (currentFilter === "rejected") {
    const mailto = gmailHref(app, "rejected");
    const notified = !!app.rejectionSent;
    if (notified) {
      headerExtras = '<span class="card-status status-sent" title="Rejection email marked as sent">SENT</span>';
      actions = `
        <button type="button" class="btn-delete"  data-action="delete"                data-id="${app.id}">🗑 Delete</button>
        <button type="button" class="btn-move"    data-action="unmark-rejection-sent" data-id="${app.id}">↶ Undo sent</button>`;
    } else {
      headerExtras = `
        <a class="head-link" target="_blank" rel="noopener" href="${mailto}" title="Email rejection notice via Gmail">✉ Email</a>`;
      actions = `
        <button type="button" class="btn-delete"  data-action="delete"             data-id="${app.id}">🗑 Delete</button>
        <button type="button" class="btn-move"    data-action="to-pending"         data-id="${app.id}">↶ Move to Pending</button>
        <button type="button" class="btn-approve" data-action="to-approved"        data-id="${app.id}">✓ Move to Approved</button>
        <button type="button" class="btn-sent" data-action="mark-rejection-sent" data-id="${app.id}">✉ Mark as sent</button>`;
    }
  } else if (currentFilter === "banned") {
    const unbanPending = !!app.unbanPending;
    headerExtras = '';
    if (unbanPending) {
      actions = `
        <button type="button" class="btn-move"    data-action="cancel-unban"       data-id="${app.id}">↶ Cancel unban</button>
        <button type="button" class="btn-approve" data-action="mark-as-unbanned"   data-id="${app.id}">✓ Mark as unbanned</button>`;
    } else {
      actions = `
        <button type="button" class="btn-approve" data-action="begin-unban"  data-id="${app.id}">↶ Unban</button>`;
    }
  }
  actions = `<div class="card-actions">${actions}</div>`;

  const pwEscaped = escape(app.issuedPassword || "");
  const pwLen = (app.issuedPassword || "").length;
  const mask = "•".repeat(pwLen);
  const passwordRow = (currentFilter === "approved" && app.issuedPassword)
    ? `<dt>Password</dt>
       <dd class="pw-cell">
         <span class="pw-wrap">
           <span class="pw-value" data-pw="${pwEscaped}" data-revealed="false">${mask}</span>
           <span class="pw-actions">
             <button type="button" class="pw-btn" data-action="toggle-pw" data-id="${app.id}" aria-label="Show password" title="Show password">${ICON_EYE}</button>
             <button type="button" class="pw-btn" data-copy-text="${pwEscaped}" aria-label="Copy password" title="Copy password">${ICON_COPY}</button>
           </span>
         </span>
       </dd>`
    : "";
  const emailKey = String(app.email || "").trim().toLowerCase();
  const walletBalance = (app.userId && walletBalancesById[app.userId] != null)
    ? walletBalancesById[app.userId]
    : walletBalancesByEmail[emailKey];
  const walletLabel = ((currentFilter === "customer" || currentFilter === "banned") && (app.userId || emailKey))
    ? ` <span class="card-balance" ${app.userId ? `data-user-id="${app.userId}"` : `data-email="${emailKey}"`}>(${formatTk(walletBalance ?? 0)})</span>`
    : "";
  return `
    <article class="app-card" data-id="${app.id}" data-email="${escape((app.email || "").toLowerCase())}" data-name="${escape(app.name || "(no name)")}">
      <header class="card-head">
        <span class="card-name">${escape(app.name || "(no name)")}${walletLabel}</span>
        <div class="card-head-right">
          ${headerExtras}
          ${currentFilter === "customer" ? "" : `<span class="card-status status-${app.status}">${app.status}</span>`}
        </div>
      </header>
      <dl class="card-fields">
        <dt>Mobile</dt>  <dd>${escape(app.mobile  || "—")}</dd>
        <dt>Email</dt>
        <dd class="copy-cell">
          <span class="copy-value">${escape(app.email || "—")}</span>
          ${app.email ? `<button type="button" class="pw-btn" data-copy-text="${escape(app.email)}" aria-label="Copy email" title="Copy email">${ICON_COPY}</button>` : ""}
        </dd>
        ${passwordRow}
        <dt>Office</dt>  <dd>${escape(app.office  || "—")}</dd>
        <dt>Address</dt> <dd>${escape(app.address || "—")}</dd>
        <dt>Applied</dt> <dd>${escape(created)}</dd>
      </dl>
      ${actions}
    </article>`;
}

function gmailHref(app, kind) {
  let subject, bodyText;
  if (kind === "rejected") {
    subject = "Update on your Dawat application";
    bodyText =
      "Hi " + (app.name || "") + ",\n\n" +
      "Thank you for your interest in Dawat.\n\n" +
      "After reviewing your application, we are unable to onboard your office at this time. " +
      "We hope to expand our service area soon and will keep your details on file.\n\n" +
      "If you believe this was a mistake or your details have changed, please reply to this email.\n\n" +
      "— Dawat";
  } else {
    subject = "Your Dawat account is ready";
    const loginUrl = window.location.origin + "/";
    bodyText =
      "Hi " + (app.name || "") + ",\n\n" +
      "Your Dawat application has been approved!\n\n" +
      "Sign in here: " + loginUrl + "\n" +
      "Email:    " + (app.email || "") + "\n" +
      "Password: " + (app.issuedPassword || "") + "\n\n" +
      "Please change your password after first sign-in.\n\n" +
      "— Dawat";
  }
  return "https://mail.google.com/mail/?view=cm&fs=1" +
    "&to=" + encodeURIComponent(app.email || "") +
    "&su=" + encodeURIComponent(subject) +
    "&body=" + encodeURIComponent(bodyText);
}

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function purgeOrdersForEmail(email) {
  const e = String(email || "").toLowerCase();
  if (!e) return;
  const snap = await getDocs(query(collection(db, "orders"), where("userEmail", "==", e)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function purgeAllUserDataForEmail(email) {
  const e = String(email || "").toLowerCase();
  if (!e) return;
  let foundUid = null;
  try {
    const wsnap = await getDocs(query(collection(db, "wallets"), where("email", "==", e)));
    for (const d of wsnap.docs) {
      if (!foundUid) foundUid = d.id;
      await deleteDoc(d.ref);
    }
  } catch (err) { console.error("wallets:", err); }
  const cols = ["orders", "walletHistory", "topups"];
  for (const col of cols) {
    const snap = await getDocs(query(collection(db, col), where("userEmail", "==", e)));
    if (snap.empty) continue;
    if (!foundUid) {
      const withUid = snap.docs.find((d) => d.data().userId);
      if (withUid) foundUid = withUid.data().userId;
    }
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n++;
      if (n >= 450) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n) await batch.commit();
  }
  const seen = new Set();
  const deleteSnap = async (snap) => {
    if (snap.empty) return;
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      if (!foundUid && d.data().userId) foundUid = d.data().userId;
      batch.delete(d.ref);
      n++;
      if (n >= 450) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n) await batch.commit();
  };
  await deleteSnap(await getDocs(query(collection(db, "notifications"), where("userEmail", "==", e))));
  if (foundUid) {
    await deleteSnap(await getDocs(query(collection(db, "notifications"), where("userId", "==", foundUid))));
  }
}

async function handleAction(id, action, btn) {
  const card = btn.closest(".app-card");

  if (action === "toggle-pw") {
    const codeEl  = card.querySelector(".pw-value");
    const revealed = codeEl.dataset.revealed === "true";
    if (revealed) {
      codeEl.textContent      = "•".repeat(codeEl.dataset.pw.length);
      codeEl.dataset.revealed = "false";
      btn.innerHTML           = ICON_EYE;
      btn.setAttribute("aria-label", "Show password");
      btn.setAttribute("title", "Show password");
    } else {
      codeEl.textContent      = codeEl.dataset.pw;
      codeEl.dataset.revealed = "true";
      btn.innerHTML           = ICON_EYE_OFF;
      btn.setAttribute("aria-label", "Hide password");
      btn.setAttribute("title", "Hide password");
    }
    return;
  }

  if (action === "mark-sent") {
    if (!(await confirmDialog({
      title: "Mark as sent",
      message: "Mark this user's credentials as sent?\n\nThe card stays in Approved until they complete their first-login password change, then moves to Active automatically.",
      confirmLabel: "Mark as sent"
    }))) return;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), {
        credsIssued:   true,
        credsIssuedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not update." });
    }
    return;
  }

  if (action === "unmark-sent") {
    if (!(await confirmDialog({
      title: "Undo mark as sent",
      message: "Undo \"Mark as sent\"? The card returns to the pre-send setup row.",
      confirmLabel: "Undo"
    }))) return;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), {
        credsIssued:   false,
        credsIssuedAt: null
      });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not update." });
    }
    return;
  }

  if (action === "mark-rejection-sent") {
    if (!(await confirmDialog({
      title: "Mark as sent",
      message: "Mark the rejection email as sent?",
      confirmLabel: "Mark as sent"
    }))) return;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), {
        rejectionSent:   true,
        rejectionSentAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not update." });
    }
    return;
  }

  if (action === "unmark-rejection-sent") {
    if (!(await confirmDialog({
      title: "Undo mark as sent",
      message: "Undo \"Mark as sent\"? The card returns to the pre-send row.",
      confirmLabel: "Undo"
    }))) return;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), {
        rejectionSent:   false,
        rejectionSentAt: null
      });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not update." });
    }
    return;
  }

  if (action === "begin-ban") {
    window.open(FIREBASE_AUTH_CONSOLE, "_blank", "noopener");
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), { banPending: true });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not start ban." });
    }
    return;
  }

  if (action === "cancel-ban") {
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), { banPending: false });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not cancel." });
    }
    return;
  }

  if (action === "mark-as-banned") {
    const name = card.dataset.name;
    if (!(await confirmDialog({
      title: "Confirm ban",
      message: "Confirm you've DISABLED " + name + " in Firebase Authentication?\n\nThis will also DELETE all of their orders.",
      confirmLabel: "Mark as banned",
      danger: true
    }))) return;
    btn.disabled = true;
    try {
      await purgeOrdersForEmail(card.dataset.email || "");
      await updateDoc(doc(db, "applications", id), {
        status:     "banned",
        banPending: false,
        bannedAt:   serverTimestamp(),
        bannedBy:   auth.currentUser ? auth.currentUser.email : null
      });
      card.classList.add("is-leaving");
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not mark as banned." });
    }
    return;
  }

  if (action === "begin-unban") {
    window.open(FIREBASE_AUTH_CONSOLE, "_blank", "noopener");
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), { unbanPending: true });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not start unban." });
    }
    return;
  }

  if (action === "cancel-unban") {
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), { unbanPending: false });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not cancel." });
    }
    return;
  }

  if (action === "mark-as-unbanned") {
    const name = card.dataset.name;
    if (!(await confirmDialog({
      title: "Confirm unban",
      message: "Confirm you've RE-ENABLED " + name + " in Firebase Authentication?",
      confirmLabel: "Mark as unbanned"
    }))) return;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "applications", id), {
        status:       "approved",
        banPending:   false,
        unbanPending: false,
        bannedAt:     null,
        bannedBy:     null,
        unbannedAt:   serverTimestamp(),
        unbannedBy:   auth.currentUser ? auth.currentUser.email : null
      });
      card.classList.add("is-leaving");
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alertDialog({ title: "Error", message: "Could not mark as unbanned." });
    }
    return;
  }

  if (action === "delete") {
    const name = card.querySelector(".card-name").textContent;
    const email = card.dataset.email || "";
    const ok = await passwordConfirmDialog({
      title: "Delete application",
      message:
        "Delete " + name + "'s application? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      verify: verifyAdminPassword
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await purgeAllUserDataForEmail(email);
      await deleteDoc(doc(db, "applications", id));
      card.classList.add("is-leaving");
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      await alertDialog({
        title: "Delete failed",
        message: "Could not delete. Check your connection and try again."
      });
    }
    return;
  }

  if (action === "wipe-data") {
    const name = card.dataset.name;
    const email = card.dataset.email || "";
    const ok = await passwordConfirmDialog({
      title: "Wipe data for " + name,
      message:
        "This permanently deletes " + name + "'s orders, wallet balance, wallet history, top-ups, and notifications. Their login stays.\n\n" +
        "This cannot be undone.",
      confirmLabel: "Wipe data",
      danger: true,
      verify: verifyAdminPassword
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await purgeAllUserDataForEmail(email);
      btn.disabled = false;
      await alertDialog({
        title: "Wiped",
        message: "All data for " + name + (email ? " (" + email + ")" : "") + " has been deleted."
      });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      await alertDialog({
        title: "Wipe failed",
        message: "Could not wipe. Try again."
      });
    }
    return;
  }

  // Status changes: approve / reject / move-between-tabs.
  const targetStatus =
    action === "approve" || action === "to-approved" ? "approved" :
    action === "reject"  || action === "to-rejected" ? "rejected" :
    action === "to-pending"                          ? "pending"  : null;
  if (!targetStatus) return;

  const buttons = card.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));

  try {
    const updates = {
      status:     targetStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser ? auth.currentUser.email : null
    };
    if (targetStatus === "approved") {
      const item = currentItems.find((x) => x.id === id);
      if (!item || !item.issuedPassword) {
        updates.issuedPassword     = generatePassword();
        updates.mustChangePassword = true;
      }
    }
    await updateDoc(doc(db, "applications", id), updates);
    card.classList.add("is-leaving");
  } catch (err) {
    console.error(err);
    buttons.forEach((b) => (b.disabled = false));
    alertDialog({ title: "Error", message: "Could not update. Check your connection and try again." });
  }
}

// Memorable-but-strong 12-char password; skips ambiguous chars (0/O/1/l/I).
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const cryptoArr = new Uint32Array(12);
  crypto.getRandomValues(cryptoArr);
  for (let i = 0; i < 12; i++) {
    out += alphabet[cryptoArr[i] % alphabet.length];
  }
  return out;
}

// Copy buttons in the card body.
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".pw-btn[data-copy-text]");
  if (!btn || btn.classList.contains("is-copied")) return;
  await navigator.clipboard.writeText(btn.dataset.copyText);
  btn.classList.add("is-copied");
  btn.innerHTML = ICON_CHECK;
  setTimeout(() => {
    btn.innerHTML = ICON_COPY;
    btn.classList.remove("is-copied");
  }, 1200);
});

// Clear-all: bulk-delete every doc currently shown on the active tab.
// Skips SENT items; requires typing the filter name to confirm.
clearAllBtn.addEventListener("click", async () => {
  if (!currentItems.length) return;
  const isSent = (a) =>
    (currentFilter === "approved" && !!a.credsIssued);
  const deletable = currentItems.filter((a) => !isSent(a));
  if (!deletable.length) {
    await alertDialog({
      title: "Nothing to delete",
      message: "Every item on this tab is marked SENT."
    });
    return;
  }
  const skipsSent = currentFilter === "approved";
  const label = (skipsSent ? "unsent " : "") + currentFilter +
                " application" + (deletable.length === 1 ? "" : "s");
  const ok = await passwordConfirmDialog({
    title: "Clear all " + currentFilter,
    message: "This will permanently delete " + deletable.length + " " + label + ".",
    confirmLabel: "Delete all",
    danger: true,
    verify: verifyAdminPassword
  });
  if (!ok) return;
  clearAllBtn.disabled = true;
  try {
    const batch = writeBatch(db);
    deletable.forEach((item) => {
      batch.delete(doc(db, "applications", item.id));
    });
    await batch.commit();
  } catch (err) {
    console.error(err);
    await alertDialog({
      title: "Clear failed",
      message: "Could not clear list. Check your connection and try again."
    });
  } finally {
    clearAllBtn.disabled = false;
  }
});
