/* ==== Supabase config (EDIT THESE) ==== */
const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co"; // your project URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM"; // Project Settings → API → anon key
/* ===================================== */

const PENDING_EMAIL_KEY = "remnantPendingEmail";

const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const selectors = {
  card: document.querySelector("[data-confirm-card]"),
  email: document.querySelector("[data-confirm-email]"),
  status: document.querySelector("[data-confirm-status]"),
  confirmBtn: document.querySelector("[data-confirm-complete]"),
  resendBtn: document.querySelector("[data-resend-email]"),
  magicBtn: document.querySelector("[data-send-magic]") // <-- add this button in HTML
};

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

/* ===== Cross-device helpers (NEW) ===== */
let redirected = false;
const goVault = () => {
  if (redirected) return;
  redirected = true;
  safeSessionStorage.remove(PENDING_EMAIL_KEY);
  window.location.replace("/vault/");
};

async function checkConfirmedViaAdmin(email) {
  try {
    const r = await fetch(`/api/auth/check-confirmed?email=${encodeURIComponent(email)}`);
    const j = await r.json();
    if (!j.ok) return { confirmed: false };
    return { confirmed: !!j.confirmed };
  } catch {
    return { confirmed: false };
  }
}

async function sendMagicLink(email) {
  setStatus("Sending a sign-in link…", "info");
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: "https://remnant0.com/vault/" } // change to your domain if needed
  });
  if (error) setStatus(error.message || "Could not send sign-in link.", "error");
  else setStatus("Sign-in link sent. Check your inbox.", "success");
}

/* ===== Core handlers (patched to use goVault) ===== */
const handleAuthFromUrl = async () => {
  if (!sb) return;

  // Handle hash tokens (#access_token & #refresh_token)
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
        setStatus("You're confirmed! Redirecting…", "success");
        goVault();
      }
    }

    clearUrlArtifacts({ removeHash: true });
  }

  // Handle auth code (?code=)
  const searchParams = new URLSearchParams(window.location.search);
  const code = searchParams.get("code");
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      setStatus(error.message || "Confirmation link expired. Request a new one below.", "error");
    } else {
      setStatus("You're confirmed! Redirecting…", "success");
      goVault();
    }
    clearUrlArtifacts({ removeSearchParams: ["code", "type"] });
  }
};

const handleConfirmedRedirect = async () => {
  if (!sb) return;
  const { data, error } = await sb.auth.getUser();
  if (error) {
    setStatus(error.message || "Could not verify your confirmation. Try again.", "error");
    return;
  }

  const user = data?.user;
  if (user && isConfirmed(user)) {
    setStatus("You're all set. Taking you to your vault…", "success");
    goVault();
  } else {
    setStatus("We haven't detected the confirmation yet. If you just clicked the link, wait a few seconds and try again.", "info");
  }
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

  setEmail(targetEmail);
  safeSessionStorage.set(PENDING_EMAIL_KEY, targetEmail);

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

  setTimeout(() => {
    btn.textContent = originalLabel;
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }, 800);

  return targetEmail;
};

/* ===== Page boot ===== */
document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) {
    setStatus("There was a problem loading our authentication tools. Refresh the page to try again.", "error");
    return;
  }

  FormUtils?.addSharedAnimations?.();
  FormUtils?.addEntranceAnimation?.(selectors.card, 100);

  await handleAuthFromUrl();

  const { data: sessionData } = await sb.auth.getSession();
  const user = sessionData?.session?.user ?? null;

  let email = user?.email ?? (await getPendingEmail());
  if (email) {
    setEmail(email);
  }

  if (!email) {
    setStatus("We could not detect a recent signup. Head back to sign up for an account.", "error");
  } else if (user && isConfirmed(user)) {
    setStatus("You're confirmed! Redirecting to your vault...", "success");
    goVault();
  } else {
    setStatus("Waiting for your confirmation link to be clicked.", "info");
  }

  // Cross-device: if no session here but we know the email, poll the server
  const currentSession = sessionData?.session ?? null;
  if (!currentSession && email) {
    let tries = 0;
    const poll = setInterval(async () => {
      tries += 1;
      const { confirmed } = await checkConfirmedViaAdmin(email);
      if (confirmed) {
        setStatus("Email confirmed on another device.", "success");
        // reveal magic sign-in button for this device
        if (selectors.magicBtn) {
          selectors.magicBtn.hidden = false;
        }
        clearInterval(poll);
      }
      if (tries >= 12) clearInterval(poll); // stop after ~2 minutes (every 10s)
    }, 10000);
  }

  // Auth state listener
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
      const refreshedUser = session?.user;
      if (refreshedUser?.email) {
        email = refreshedUser.email;
        setEmail(refreshedUser.email);
        safeSessionStorage.set(PENDING_EMAIL_KEY, refreshedUser.email);
      }
      if (refreshedUser && isConfirmed(refreshedUser)) {
        setStatus("Email confirmed! Redirecting to your vault...", "success");
        goVault();
      }
    }
    if (event === "SIGNED_OUT") {
      setStatus("Your session ended. Sign in again to continue.", "error");
    }
  });

  // Manual "I've clicked the link" button
  selectors.confirmBtn?.addEventListener("click", async () => {
    if (!selectors.confirmBtn) return;
    const btn = selectors.confirmBtn;
    const originalLabel = btn.textContent;
    btn.textContent = "Checking...";
    btn.classList.add("is-loading");
    btn.disabled = true;

    const { data: { session } = { session: null } } = await sb.auth.getSession();
    if (!session) {
      setStatus("No session yet on this device. You can click the email again, or send a sign-in link to this device below.", "info");
    } else {
      await sb.auth.refreshSession().catch(() => null);
      await handleConfirmedRedirect();
    }

    setTimeout(() => {
      btn.textContent = originalLabel;
      btn.classList.remove("is-loading");
      btn.disabled = false;
    }, 800);
  });

  // Resend the confirmation email
  selectors.resendBtn?.addEventListener("click", async () => {
    const updatedEmail = await handleResend(email);
    if (updatedEmail) email = updatedEmail;
  });

  // Send magic link to this device (when user confirmed elsewhere)
  selectors.magicBtn?.addEventListener("click", async () => {
    const e = email || (await getPendingEmail());
    if (!e) return setStatus("No email found to send the link to.", "error");
    await sendMagicLink(e);
  });

  // Debug (optional)
  console.log("[confirm] href=", location.href);
});
