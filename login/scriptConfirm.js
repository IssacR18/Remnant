/* ==== Supabase config (EDIT THESE) ==== */
const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM";
/* ===================================== */

const confirmSb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

class EmailConfirmationScreen {
  constructor() {
    this.card = document.querySelector("[data-confirm-card]");
    this.statusPane = document.querySelector("[data-status-pane]");
    this.statusTitle = document.querySelector("[data-status-title]");
    this.statusMessage = document.querySelector("[data-status-message]");
    this.statusChip = document.querySelector("[data-status-chip]");
    this.emailTarget = document.querySelector("[data-user-email]");
    this.continueBtn = document.querySelector("[data-continue]");

    if (this.continueBtn) {
      this.continueBtn.addEventListener("click", () => this.handleContinue());
    }
  }

  async init() {
    this.seedEmailFromStorage();
    await this.consumeRedirectTokens();
    await this.loadUserState();
  }

  seedEmailFromStorage() {
    const stored = this.getStoredEmail();
    if (stored) this.updateEmailDisplay(stored);
  }

  getStoredEmail() {
    try {
      return window.localStorage.getItem("remnantPendingEmail");
    } catch (_) {
      return null;
    }
  }

  setStoredEmail(email) {
    if (!email) return;
    try {
      window.localStorage.setItem("remnantPendingEmail", email);
    } catch (_) {}
  }

  clearStoredEmail() {
    try {
      window.localStorage.removeItem("remnantPendingEmail");
    } catch (_) {}
  }

  updateEmailDisplay(email) {
    if (this.emailTarget) {
      this.emailTarget.textContent = email || "your inbox";
    }
  }

  setStatus(variant, title, message, chipText) {
    if (this.statusPane) this.statusPane.dataset.statusVariant = variant;
    if (this.statusTitle) this.statusTitle.textContent = title;
    if (this.statusMessage) this.statusMessage.textContent = message;

    if (this.statusChip) {
      const fallback =
        variant === "success"
          ? "Email confirmed"
          : variant === "error"
          ? "Action needed"
          : "Awaiting confirmation";
      this.statusChip.textContent = chipText || fallback;
    }
  }

  setButtonLabel(label) {
    if (!this.continueBtn) return;
    const text = this.continueBtn.querySelector(".btn-text");
    if (text) text.textContent = label;
  }

  setButtonLoading(isLoading) {
    if (this.continueBtn) {
      this.continueBtn.classList.toggle("loading", Boolean(isLoading));
    }
  }

  async consumeRedirectTokens() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      try {
        await confirmSb.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
      } catch (error) {
        console.error("setSession error:", error);
        this.setStatus(
          "error",
          "We could not finish signing you in",
          error.message || "Please try the confirmation link again."
        );
      }
    }

    history.replaceState({}, "", window.location.pathname + window.location.search);
  }

  async loadUserState() {
    try {
      const { data: sessionData } = await confirmSb.auth.getSession();
      const session = sessionData?.session || null;

      if (session?.user) {
        this.updateEmailDisplay(session.user.email);
        const user = await this.getFreshUser(session);
        this.applyUser(user);
        return;
      }

      this.applyUser(null);
    } catch (error) {
      console.error("loadUserState error:", error);
      this.setStatus(
        "error",
        "Unable to fetch account status",
        error.message || "Refresh this page and try again."
      );
    }
  }

  async getFreshUser(session) {
    try {
      const { data, error } = await confirmSb.auth.getUser();
      if (error) throw error;
      if (data?.user) return data.user;
    } catch (error) {
      console.error("getUser error:", error);
      if (session?.user) return session.user;
      throw error;
    }
    return session?.user ?? null;
  }

  applyUser(user) {
    if (user) {
      this.updateEmailDisplay(user.email);
      this.setStoredEmail(user.email);

      if (user.email_confirmed_at) {
        this.setStatus(
          "success",
          "Email confirmed",
          "You are all set. Enter the vault to continue.",
          "Email confirmed"
        );
        this.setButtonLabel("Enter Vault");
        this.clearStoredEmail();
      } else {
        this.setStatus(
          "pending",
          "Confirm your email",
          "Open the confirmation email we sent and click the secure link. Then return here.",
          "Awaiting confirmation"
        );
        this.setButtonLabel("I confirmed my email");
      }
      return;
    }

    const stored = this.getStoredEmail();
    if (stored) this.updateEmailDisplay(stored);

    this.setStatus(
      "pending",
      "Almost there",
      "Check your inbox for the Remnant verification email. Confirm it, then continue.",
      "Awaiting confirmation"
    );
    this.setButtonLabel("Go to Vault");
  }

  async handleContinue() {
    if (!this.continueBtn || this.continueBtn.classList.contains("loading")) return;

    this.setButtonLoading(true);

    try {
      const user = await this.fetchLatestUser();

      if (user?.email_confirmed_at) {
        this.setStatus(
          "success",
          "Email confirmed",
          "Redirecting you to your vault…",
          "Email confirmed"
        );
        setTimeout(() => {
          window.location.href = "/login/vault.html";
        }, 750);
        return;
      }

      this.setStatus(
        "pending",
        "Still waiting on confirmation",
        "We will take you to the vault sign-in while you finish confirming your email.",
        "Awaiting confirmation"
      );
      await confirmSb.auth.signOut();
      setTimeout(() => {
        window.location.href = "/login/vault.html";
      }, 850);
    } catch (error) {
      console.error("handleContinue error:", error);
      this.setButtonLoading(false);
      this.setStatus(
        "error",
        "Unable to verify confirmation",
        error.message || "Please try again in a moment.",
        "Action needed"
      );
    }
  }

  async fetchLatestUser() {
    const { data: sessionData } = await confirmSb.auth.getSession();
    const session = sessionData?.session || null;
    if (!session) {
      this.applyUser(null);
      return null;
    }

    try {
      const { data, error } = await confirmSb.auth.getUser();
      if (error) throw error;
      const user = data?.user ?? null;
      this.applyUser(user);
      return user;
    } catch (error) {
      if (error.message && /jwt/i.test(error.message)) {
        const { data, error: refreshError } = await confirmSb.auth.refreshSession();
        if (refreshError) throw refreshError;
        const refreshedSession = data?.session || null;
        const refreshedUser = refreshedSession?.user ?? null;
        this.applyUser(refreshedUser);
        return refreshedUser;
      }
      throw error;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.FormUtils?.addSharedAnimations) {
    FormUtils.addSharedAnimations();
  }

  const card = document.querySelector("[data-confirm-card]");
  if (card && window.FormUtils?.addEntranceAnimation) {
    FormUtils.addEntranceAnimation(card, 80);
  }

  const screen = new EmailConfirmationScreen();
  screen.init().catch((error) => {
    console.error("EmailConfirmationScreen init error:", error);
  });
});
