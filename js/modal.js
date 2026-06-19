// Modal dialogs: confirmDialog, alertDialog, typeToConfirmDialog, passwordConfirmDialog
// Single backdrop element, managed globally for accessibility

let backdrop = null;
let activeResolve = null;
let lastFocus = null;

function ensureBackdrop() {
  if (backdrop) return backdrop;
  backdrop = document.createElement("div");
  backdrop.className = "dawat-modal-backdrop";
  backdrop.hidden = true;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close(false);
  });
  document.body.appendChild(backdrop);
  document.addEventListener("keydown", (e) => {
    if (!activeResolve) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close(false);
    }
  });
  return backdrop;
}

function close(result) {
  if (!activeResolve) return;
  const r = activeResolve;
  activeResolve = null;
  backdrop.hidden = true;
  backdrop.innerHTML = "";
  if (lastFocus && lastFocus.focus) {
    try { lastFocus.focus(); } catch (_) {}
  }
  r(result);
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function renderMessage(msg) {
  return escape(msg).replace(/\n/g, "<br>");
}

export function confirmDialog({
  title = "Confirm",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  hideCancel = false
} = {}) {
  return new Promise((resolve) => {
    ensureBackdrop();
    // If something's already open, dismiss it as cancel.
    if (activeResolve) close(false);
    lastFocus = document.activeElement;
    activeResolve = resolve;
    const cancelHTML = hideCancel
      ? ""
      : '<button type="button" class="ghost-btn" data-act="cancel">' + escape(cancelLabel) + '</button>';
    backdrop.innerHTML =
      '<div class="dawat-modal" role="dialog" aria-modal="true" aria-labelledby="dawat-modal-title">' +
        '<h3 id="dawat-modal-title" class="dawat-modal-title">' + escape(title) + '</h3>' +
        '<p class="dawat-modal-msg">' + renderMessage(message) + '</p>' +
        '<div class="dawat-modal-actions">' +
          cancelHTML +
          '<button type="button" class="' + (danger ? "danger-btn" : "btn-approve") + '" data-act="ok">' + escape(confirmLabel) + '</button>' +
        '</div>' +
      '</div>';
    backdrop.hidden = false;
    const okBtn = backdrop.querySelector('[data-act="ok"]');
    const cancelBtn = backdrop.querySelector('[data-act="cancel"]');
    okBtn.addEventListener("click", () => close(true));
    if (cancelBtn) cancelBtn.addEventListener("click", () => close(false));
    okBtn.focus();
  });
}

export function alertDialog({ title = "Notice", message = "", confirmLabel = "OK" } = {}) {
  return confirmDialog({ title, message, confirmLabel, hideCancel: true });
}

export function typeToConfirmDialog({
  title = "Confirm",
  message = "",
  expected,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true
} = {}) {
  if (!expected) {
    throw new Error("typeToConfirmDialog: 'expected' is required");
  }
  return new Promise((resolve) => {
    ensureBackdrop();
    if (activeResolve) close(false);
    lastFocus = document.activeElement;
    activeResolve = resolve;
    backdrop.innerHTML =
      '<div class="dawat-modal" role="dialog" aria-modal="true" aria-labelledby="dawat-modal-title">' +
        '<h3 id="dawat-modal-title" class="dawat-modal-title">' + escape(title) + '</h3>' +
        '<p class="dawat-modal-msg">' + renderMessage(message) + '</p>' +
        '<p class="dawat-modal-hint">Type <code>' + escape(expected) + '</code> to confirm:</p>' +
        '<input type="text" class="dawat-modal-input" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
        '<div class="dawat-modal-actions">' +
          '<button type="button" class="ghost-btn" data-act="cancel">' + escape(cancelLabel) + '</button>' +
          '<button type="button" class="' + (danger ? "danger-btn" : "btn-approve") + '" data-act="ok" disabled>' + escape(confirmLabel) + '</button>' +
        '</div>' +
      '</div>';
    backdrop.hidden = false;
    const input = backdrop.querySelector(".dawat-modal-input");
    const okBtn = backdrop.querySelector('[data-act="ok"]');
    const cancelBtn = backdrop.querySelector('[data-act="cancel"]');
    input.addEventListener("input", () => {
      okBtn.disabled = input.value !== expected;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !okBtn.disabled) {
        e.preventDefault();
        close(true);
      }
    });
    okBtn.addEventListener("click", () => close(input.value === expected));
    cancelBtn.addEventListener("click", () => close(false));
    input.focus();
  });
}

export function passwordConfirmDialog({
  title = "Confirm",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  verify
} = {}) {
  if (typeof verify !== "function") {
    throw new Error("passwordConfirmDialog: 'verify' is required");
  }
  return new Promise((resolve) => {
    ensureBackdrop();
    if (activeResolve) close(false);
    lastFocus = document.activeElement;
    activeResolve = resolve;
    backdrop.innerHTML =
      '<div class="dawat-modal" role="dialog" aria-modal="true" aria-labelledby="dawat-modal-title">' +
        '<h3 id="dawat-modal-title" class="dawat-modal-title">' + escape(title) + '</h3>' +
        '<p class="dawat-modal-msg">' + renderMessage(message) + '</p>' +
        '<p class="dawat-modal-hint">Enter your admin password to confirm:</p>' +
        '<input type="password" class="dawat-modal-input" autocomplete="current-password" />' +
        '<p class="dawat-modal-error" hidden></p>' +
        '<div class="dawat-modal-actions">' +
          '<button type="button" class="ghost-btn" data-act="cancel">' + escape(cancelLabel) + '</button>' +
          '<button type="button" class="' + (danger ? "danger-btn" : "btn-approve") + '" data-act="ok" disabled>' + escape(confirmLabel) + '</button>' +
        '</div>' +
      '</div>';
    backdrop.hidden = false;
    const input    = backdrop.querySelector(".dawat-modal-input");
    const okBtn    = backdrop.querySelector('[data-act="ok"]');
    const cancelBtn = backdrop.querySelector('[data-act="cancel"]');
    const errEl    = backdrop.querySelector(".dawat-modal-error");

    input.addEventListener("input", () => {
      okBtn.disabled = !input.value;
      errEl.hidden = true;
    });
    async function submit() {
      if (!input.value) return;
      okBtn.disabled = true;
      cancelBtn.disabled = true;
      errEl.hidden = true;
      try {
        const ok = await verify(input.value);
        if (ok) {
          close(true);
        } else {
          errEl.textContent = "Wrong password. Try again.";
          errEl.hidden = false;
          input.value = "";
          okBtn.disabled = true;
          cancelBtn.disabled = false;
          input.focus();
        }
      } catch (err) {
        errEl.textContent = "Could not verify. Check your connection and try again.";
        errEl.hidden = false;
        okBtn.disabled = !input.value;
        cancelBtn.disabled = false;
      }
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !okBtn.disabled) {
        e.preventDefault();
        submit();
      }
    });
    okBtn.addEventListener("click", submit);
    cancelBtn.addEventListener("click", () => close(false));
    input.focus();
  });
}
