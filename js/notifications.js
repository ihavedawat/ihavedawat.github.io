// In-app notification system. Stores in Firestore, displays in bell icon
// Schema: notifications/{auto} - userId, userEmail, audience ("user"|"admin"),
//         message, link (optional href), linkText, type, read, createdAt

import { db } from "./firebase.js";
import {
  addDoc, collection, doc, deleteDoc, getDocs, onSnapshot,
  query, serverTimestamp, where, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { confirmDialog } from "./modal.js";
import { ADMIN_EMAILS } from "./admin-config.js";

const BELL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const FIRESTORE_BATCH_LIMIT = 450;

export async function notify({ userId, userEmail = "", message, link = "", linkText = "", type = "info" }) {
  if (!userId || !message) return;
  await addDoc(collection(db, "notifications"), {
    userId,
    userEmail: String(userEmail || "").toLowerCase(),
    audience: "user",
    message, link, linkText, type,
    read: false,
    createdAt: serverTimestamp()
  });
}

// Send notification to all signed-in admins (audience="admin")
export async function notifyAdmins({ message, link = "", linkText = "", type = "info" }) {
  if (!message) return;
  await addDoc(collection(db, "notifications"), {
    userId: "",
    userEmail: "",
    audience: "admin",
    message, link, linkText, type,
    read: false,
    createdAt: serverTimestamp()
  });
}

const BLIP_URL = "../assets/sounds/notification.mp3";
let blipAudio = null;
function playBlip() {
  try {
    if (!blipAudio) {
      blipAudio = new Audio(BLIP_URL);
      blipAudio.preload = "auto";
      blipAudio.volume = 0.7;
    }
    blipAudio.currentTime = 0;
    const p = blipAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

function fmtWhen(ts) {
  if (!ts || !ts.toMillis) return "";
  const d = new Date(ts.toMillis());
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// Mount bell icon + notification panel (listens to user and admin notifications)
export function mountNotificationBell({ user }) {
  if (!user || document.getElementById("notif-bell")) return;
  const isAdmin = ADMIN_EMAILS.includes((user.email || "").toLowerCase());

  const wrap = document.createElement("div");
  wrap.id = "notif-bell";
  wrap.className = "notif-bell";
  wrap.innerHTML = `
    <button type="button" class="notif-btn ghost-btn" aria-label="Notifications" title="Notifications">
      ${BELL_SVG}
      <span class="notif-badge" hidden>0</span>
    </button>
    <div class="notif-panel" hidden>
      <div class="notif-head">
        <span>Notifications</span>
        <button type="button" class="notif-clear ghost-btn">Clear</button>
      </div>
      <ul class="notif-list"></ul>
    </div>`;

  const signoutBtn = document.getElementById("signout-btn");
  const toolbarActions = document.querySelector(".toolbar-actions");
  if (toolbarActions && signoutBtn && toolbarActions.contains(signoutBtn)) {
    wrap.classList.add("is-inline");
    signoutBtn.insertAdjacentElement("afterend", wrap);
  } else if (signoutBtn && signoutBtn.parentElement) {
    wrap.classList.add("is-inline");
    signoutBtn.insertAdjacentElement("afterend", wrap);
  } else {
    document.body.appendChild(wrap);
  }

  const btn   = wrap.querySelector(".notif-btn");
  const badge = wrap.querySelector(".notif-badge");
  const panel = wrap.querySelector(".notif-panel");
  const listEl = wrap.querySelector(".notif-list");
  const clearBtn = wrap.querySelector(".notif-clear");

  const rowsByQuery = { user: [], admin: [] };
  const seenIds = new Set();
  let firstUserSnap = true;
  let firstAdminSnap = true;
  let page = 0;
  const PAGE_SIZE = 5;

  function combined() {
    const merged = [...rowsByQuery.user, ...rowsByQuery.admin];
    merged.sort((a, b) => {
      const am = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const bm = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return bm - am;
    });
    return merged;
  }

  function render() {
    const rows = combined();
    const unread = rows.filter((r) => !r.read).length;
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
    if (!rows.length) {
      page = 0;
      listEl.innerHTML = '<li class="notif-empty">No notifications yet.</li>';
      return;
    }
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    const start = page * PAGE_SIZE;
    const shown = rows.slice(start, start + PAGE_SIZE);
    const items = shown.map((r) => {
      const when = fmtWhen(r.createdAt);
      const cls = "notif-item" + (r.read ? "" : " is-unread") + " type-" + escape(r.type || "info");
      const link = r.link
        ? ` <a class="notif-link" href="${escape(r.link)}">${escape(r.linkText || "View")}</a>`
        : "";
      return `<li class="${cls}"><span class="notif-msg">${escape(r.message).replace(/\n/g, "<br>")}</span>${link}<span class="notif-when">${when}</span></li>`;
    }).join("");
    const pager = totalPages > 1
      ? `<li class="notif-pager">
          <button type="button" class="ghost-btn notif-prev"${page === 0 ? " disabled" : ""}>◀ Prev</button>
          <span class="notif-page-info">${page + 1} / ${totalPages}</span>
          <button type="button" class="ghost-btn notif-next"${page >= totalPages - 1 ? " disabled" : ""}>Next ▶</button>
        </li>`
      : "";
    listEl.innerHTML = items + pager;
  }

  listEl.addEventListener("click", (e) => {
    if (e.target.closest(".notif-prev")) {
      e.stopPropagation();
      page = Math.max(0, page - 1);
      markVisibleRead();
      render();
      return;
    }
    if (e.target.closest(".notif-next")) {
      e.stopPropagation();
      page += 1;
      markVisibleRead();
      render();
      return;
    }
    const link = e.target.closest(".notif-link");
    if (link) {
      // If the link points to the page we're already on, the hash change
      // alone won't refresh the view — force a full reload so the target
      // tab/filter actually re-runs its setup.
      const href = link.getAttribute("href") || "";
      const here = location.pathname.split("/").pop();
      const target = href.split("#")[0].split("?")[0].split("/").pop();
      if (target && target === here) {
        // Same page — navigate to the link's full href so any existing query
        // string (e.g. ?group=users) is dropped, then force a reload so the
        // page re-runs its setup from a clean state.
        e.preventDefault();
        panel.hidden = true;
        const url = new URL(href, location.href);
        const sameDoc =
          url.pathname === location.pathname && url.search === location.search;
        if (sameDoc) {
          if (url.hash) location.hash = url.hash;
          location.reload();
        } else {
          location.assign(url.href);
        }
      } else {
        panel.hidden = true;
      }
    }
  });

  function markVisibleRead() {
    const rows = combined();
    const start = page * PAGE_SIZE;
    const visible = rows.slice(start, start + PAGE_SIZE);
    const idsToMark = visible.filter((r) => !r.read).map((r) => r.id);
    if (!idsToMark.length) return;
    idsToMark.forEach((id) => {
      for (const key of ["user", "admin"]) {
        const row = rowsByQuery[key].find((r) => r.id === id);
        if (row) row.read = true;
      }
    });
    markIdsRead(idsToMark).catch(() => {});
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = !panel.hidden;
    panel.hidden = wasOpen;
    if (!wasOpen) {
      page = 0;
      markVisibleRead();
      render();
    }
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) panel.hidden = true;
  });
  clearBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!combined().length) return;
    panel.hidden = true;
    const ok = await confirmDialog({
      title: "Clear notifications",
      message: "Clear all notifications?",
      confirmLabel: "Clear all",
      danger: true
    });
    if (!ok) return;
    clearAll({ userId: user.uid, includeAdmin: isAdmin }).catch(() => {});
  });

  function attach(qRef, key, isFirst) {
    onSnapshot(qRef, (snap) => {
      const incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (isFirst()) {
        incoming.forEach((r) => seenIds.add(r.id));
      } else {
        const fresh = incoming.find((r) => !seenIds.has(r.id) && !r.read);
        incoming.forEach((r) => seenIds.add(r.id));
        if (fresh) playBlip();
      }
      rowsByQuery[key] = incoming;
      render();
    }, () => {});
  }

  attach(
    query(collection(db, "notifications"), where("userId", "==", user.uid), limit(50)),
    "user",
    () => { if (firstUserSnap) { firstUserSnap = false; return true; } return false; }
  );
  if (isAdmin) {
    attach(
      query(collection(db, "notifications"), where("audience", "==", "admin"), limit(50)),
      "admin",
      () => { if (firstAdminSnap) { firstAdminSnap = false; return true; } return false; }
    );
  }
}

export async function markAllRead({ userId, includeAdmin = false }) {
  const queries = [
    query(collection(db, "notifications"), where("userId", "==", userId), limit(200))
  ];
  if (includeAdmin) {
    queries.push(query(collection(db, "notifications"), where("audience", "==", "admin"), limit(200)));
  }
  for (const q of queries) {
    const snap = await getDocs(q);
    if (snap.empty) continue;
    const batch = writeBatch(db);
    let n = 0;
    snap.docs.forEach((d) => {
      if (!d.data().read) {
        batch.update(doc(db, "notifications", d.id), { read: true });
        n++;
      }
    });
    if (n) await batch.commit();
  }
}

export async function markIdsRead(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  let batch = writeBatch(db);
  let n = 0;
  for (const id of ids) {
    batch.update(doc(db, "notifications", id), { read: true });
    n++;
    if (n >= 450) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n) await batch.commit();
}

export async function clearAll({ userId, includeAdmin = false }) {
  const queries = [
    query(collection(db, "notifications"), where("userId", "==", userId), limit(200))
  ];
  if (includeAdmin) {
    queries.push(query(collection(db, "notifications"), where("audience", "==", "admin"), limit(200)));
  }
  const seen = new Set();
  for (const q of queries) {
    const snap = await getDocs(q);
    if (snap.empty) continue;
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      batch.delete(d.ref);
      n++;
      if (n >= FIRESTORE_BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n) await batch.commit();
  }
}
