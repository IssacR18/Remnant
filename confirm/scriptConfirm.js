/* ==== Supabase config (EDIT THESE) ==== */
const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co"; // your project URL
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM"; // Project Settings → API → anon key
/* ===================================== */

const PENDING_EMAIL_KEY = "remnantPendingEmail";
const CHECK_CONFIRMED_ENDPOINT = "/api/auth/check-confirmed";
const POLL_INTERVAL_MS = 7000;

const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const selectors = {
  card: document.querySelector("[data-confirm-card]"),
  email: document.querySelector("[data-confirm-email]"),
  status: document.querySelector("[data-confirm-status]"),
  confirmBtn: document.querySelector("[data-confirm-complete]"),
  resendBtn: document.querySelector("[data-resend-email]")
};

let trackedEmail = null;
let pollTimer = null;
let isFinalizing = false;

const safeSessionStorage = {
  get(key) {
    try {
      return window.sessionStorage?.getItem(key) ?? null;
    } catch (_) {
      return null;
    }
  },
  set(key, value) {
    try {
      window.sessionStorage?.setItem(key, value);
    } catch (_) {
      /* storage blocked */
    }
  },
  remove(key) {
    try {
      window.sessionStorage?.removeItem(key);
    } catch (_) {
      /* storage blocked */
    }
  }
};

const setStatus = (message, type = "info") => {
  if (!selectors.status) return;
  selectors.status.textContent = message || "";
  if (!type) {
    selectors.status.removeAttribute("data-status");
  } else {
    selectors.status.setAttribute("data-status", type);
  }
};

const setEmail = (email) => {
  if (!selectors.email) return;
  selectors.email.textContent = email || "your inbox";
};

const updateTrackedEmail = (email, { persist = false } = {}) => {
  if (!email) return;
  if (trackedEmail === email) return;
  trackedEmail = email;
  setEmail(email);
  if (persist) safeSessionStorage.set(PENDING_EMAIL_KEY, email);
};

const clearPolling = () => {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
};

const startPolling = (email) => {
  if (!email || isFinalizing) return;
  clearPolling();
  pollTimer = window.setInterval(async () => {
    await handleApiConfirmation(trackedEmail || email, { silent: true });
  }, POLL_INTERVAL_MS);
};

const clearUrlArtifacts = ({ removeHash = false, removeSearchParams = [] } = {}) => {
  const url = new URL(window.location.href);
  if (removeHash) url.hash = "";
  if (Array.isArray(removeSearchParams) && removeSearchParams.length > 0) {
    removeSearchParams.forEach((param) => url.searchParams.delete(param));
  }
  window.history.replaceState(window.history.state, document.title, url.toString());
};

const isConfirmed = (user) =>
  Boolean(user?.email_confirmed_at || user?.confirmed_at || user?.confirmed_at?.length);

const getPendingEmail = async () => {
  const stored = safeSessionStorage.get(PENDING_EMAIL_KEY);
  if (stored) return stored;
  if (!sb) return null;
  const { data: sessionData } = await sb.auth.getSession();
  return sessionData?.session?.user?.email ?? null;
};

const finalizeConfirmation = async (user) => {
  if (isFinalizing) return true;
  isFinalizing = true;
  safeSessionStorage.remove(PENDING_EMAIL_KEY);
  clearPolling();

  let resolvedUser = user;
  if (!resolvedUser) {
    try {
      const { data } = await sb.auth.getSession();
      const sessionUser = data?.session?.user ?? null;
      if (sessionUser && isConfirmed(sessionUser)) resolvedUser = sessionUser;
    } catch (_) {
      resolvedUser = user ?? null;
    }
  }

  if (resolvedUser && isConfirmed(resolvedUser)) {
    setStatus("You're confirmed! Redirecting to your vault...", "success");
    window.setTimeout(() => {
      window.location.href = "/vault/";
    }, 600);
    return true;
  }

  setStatus("Email confirmed! Sign in to continue.", "success");
  window.setTimeout(() => {
    window.location.href = "/signin/";
  }, 1300);
  return true;
};

const handleAuthFromUrl = async () => {
  if (!sb) return false;
  let handled = false;

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (hash) {
    const hashParams = new URLSearchParams(hash);

    const errorMessage = hashParams.get("error_description");
    if (errorMessage) {
      setStatus(decodeURIComponent(errorMessage), "error");
    }

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) {
        setStatus(error.message || "We could not confirm your session. Try again.", "error");
      } else {
        await finalizeConfirmation();
        handled = true;
      }
    }

    clearUrlArtifacts({ removeHash: true });
  }

  const searchParams = new URLSearchParams(window.location.search);
  const code = searchParams.get("code");
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      setStatus(error.message || "Confirmation link expired. Request a new one below.", "error");
    } else {
      await finalizeConfirmation();
      handled = true;
    }
    clearUrlArtifacts({ removeSearchParams: ["code", "type"] });
  }

  return handled;
};

const handleConfirmedRedirect = async ({ quietPending = false } = {}) => {
  if (!sb) return false;
  const { data, error } = await sb.auth.getUser();
  if (error) {
    const message = (error.message || "").toLowerCase();
    if (!message.includes("session")) {
      setStatus(error.message || "Could not verify your confirmation. Try again.", "error");
    } else if (!quietPending) {
      setStatus(
        "We haven't detected the confirmation yet. If you just clicked the link, wait a few seconds and try again.",
        "info"
      );
    }
    return false;
  }

  const user = data?.user;
  if (user && isConfirmed(user)) {
    await finalizeConfirmation(user);
    return true;
  }

  if (!quietPending) {
    setStatus(
      "We haven't detected the confirmation yet. If you just clicked the link, wait a few seconds and try again.",
      "info"
    );
  }
  return false;
};

const checkConfirmedViaApi = async (email) => {
  if (!email) return null;
  try {
    const endpoint = `${CHECK_CONFIRMED_ENDPOINT}?email=${encodeURIComponent(email)}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return data;
  } catch (error) {
    console.warn("confirm-page: cross-device check failed", error);
    return null;
  }
};

const handleApiConfirmation = async (email, { silent = false } = {}) => {
  if (!email || isFinalizing) return false;
  const data = await checkConfirmedViaApi(email);
  if (!data) {
    if (!silent) setStatus("We couldn't verify your confirmation yet. Try again in a moment.", "info");
    return false;
  }

  if (data.email) updateTrackedEmail(data.email, { persist: true });

  if (data.confirmed) {
    await finalizeConfirmation();
    return true;
  }

  if (!silent) {
    setStatus("Still waiting for that confirmation link. If you already clicked it, give it another moment.", "info");
  }

  return false;
};

const handleResend = async (emailHint) => {
  if (!sb || !selectors.resendBtn) return;
  const btn = selectors.resendBtn;

  let targetEmail = emailHint;
  if (!targetEmail) {
    const { data } = await sb.auth.getUser();
    targetEmail = data?.user?.email ?? null;
  }

  if (!targetEmail) {
    setStatus("We could not find an email to resend to. Create an account first.", "error");
    return null;
  }

  updateTrackedEmail(targetEmail, { persist: true });

  const originalLabel = btn.textContent;
  btn.textContent = "Sending...";
  btn.classList.add("is-loading");
  btn.disabled = true;

  const { error } = await sb.auth.resend({ type: "signup", email: targetEmail });

  if (error) {
    setStatus(error.message || "We couldn't resend the confirmation email. Try again later.", "error");
  } else {
    setStatus("Confirmation email sent again. Give it a moment and check junk or spam folders.", "success");
  }

  window.setTimeout(() => {
    btn.textContent = originalLabel;
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }, 800);

  return targetEmail;
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) {
    setStatus("There was a problem loading our authentication tools. Refresh the page to try again.", "error");
    return;
  }

  FormUtils?.addSharedAnimations?.();
  FormUtils?.addEntranceAnimation?.(selectors.card, 100);

  const handledViaUrl = await handleAuthFromUrl();
  if (handledViaUrl) return;

  const { data: sessionData } = await sb.auth.getSession();
  const user = sessionData?.session?.user ?? null;

  const pendingEmail = user?.email ?? (await getPendingEmail());
  if (pendingEmail) updateTrackedEmail(pendingEmail);

  if (!trackedEmail) {
    setStatus("We could not detect a recent signup. Head back to sign up for an account.", "error");
    return;
  }

  if (user && isConfirmed(user)) {
    await finalizeConfirmation(user);
    return;
  }

  setStatus("Waiting for your confirmation link to be clicked.", "info");
  startPolling(trackedEmail);
  await handleApiConfirmation(trackedEmail, { silent: true });

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
      const refreshedUser = session?.user;
      if (refreshedUser?.email) {
        updateTrackedEmail(refreshedUser.email, { persist: true });
      }
      if (refreshedUser && isConfirmed(refreshedUser)) {
        await finalizeConfirmation(refreshedUser);
      }
    }

    if (event === "SIGNED_OUT" && !isFinalizing) {
      setStatus("Your session ended. Sign in again to continue.", "error");
    }
  });

  selectors.confirmBtn?.addEventListener("click", async () => {
    if (!selectors.confirmBtn || isFinalizing) return;
    const btn = selectors.confirmBtn;
    const originalLabel = btn.textContent;
    btn.textContent = "Checking...";
    btn.classList.add("is-loading");
    btn.disabled = true;

    await sb.auth.refreshSession().catch(() => null);
    const handled = await handleConfirmedRedirect({ quietPending: true });
    if (!handled) {
      await handleApiConfirmation(trackedEmail, { silent: false });
    }

    window.setTimeout(() => {
      btn.textContent = originalLabel;
      btn.classList.remove("is-loading");
      btn.disabled = false;
    }, 800);
  });

  selectors.resendBtn?.addEventListener("click", async () => {
    const updatedEmail = await handleResend(trackedEmail);
    if (updatedEmail) {
      updateTrackedEmail(updatedEmail, { persist: true });
      startPolling(updatedEmail);
    }
  });
});
