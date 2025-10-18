/* ==== Supabase config (EDIT THESE) ==== */
const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM";     // Project Settings → API → anon key
/* ===================================== */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const COMING_SOON_STORAGE_KEY = 'remnantComingSoonDismissed';

class LoginForm1 {
  constructor() {
    this.form = document.getElementById('loginForm');
    this.submitBtn = this.form.querySelector('.login-btn');
    this.passwordToggle = document.getElementById('passwordToggle');
    this.passwordInput = document.getElementById('password');
    this.successMessage = document.getElementById('successMessage');
    this.isSubmitting = false;

    this.validators = {
      email: FormUtils.validateEmail,
      password: FormUtils.validatePassword
    };

    this.init();
  }

  init() {
    this.addEventListeners();
    FormUtils.setupFloatingLabels(this.form);
    this.addInputAnimations();
    FormUtils.setupPasswordToggle(this.passwordInput, this.passwordToggle);
    this.setupSocialButtons();
    FormUtils.addSharedAnimations();
    this.redirectIfAlreadySignedIn();
  }

  async redirectIfAlreadySignedIn() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) window.location.href = "/vault/";
  }

  addEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));

    Object.keys(this.validators).forEach(fieldName => {
      const field = document.getElementById(fieldName);
      if (field) {
        field.addEventListener('blur', () => this.validateField(fieldName));
        field.addEventListener('input', () => FormUtils.clearError(fieldName));
      }
    });

    const inputs = this.form.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('focus', (e) => this.handleFocus(e));
      input.addEventListener('blur', (e) => this.handleBlur(e));
    });

    const checkbox = document.getElementById('remember');
    if (checkbox) {
      checkbox.addEventListener('change', () => this.animateCheckbox());
    }

    const forgotLink = document.querySelector('.forgot-password');
    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => this.handleForgotPassword(e));
    }

    const signupLink = document.querySelector('.signup-link a');
    if (signupLink) {
      signupLink.addEventListener('click', (e) => this.handleSignupLink(e));
    }

    this.setupKeyboardShortcuts();
  }

  addInputAnimations() {
    const inputs = this.form.querySelectorAll('input');
    inputs.forEach((input, index) => {
      setTimeout(() => {
        input.style.opacity = '1';
        input.style.transform = 'translateY(0)';
      }, index * 150);
    });
  }

  setupSocialButtons() {
    const socialButtons = document.querySelectorAll('.social-btn');
    socialButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const provider = btn.classList.contains('google-btn') ? 'google' : 'github';

        // lil animation
        btn.style.transform = 'scale(0.95)';
        btn.style.opacity = '0.8';
        setTimeout(() => { btn.style.transform = 'scale(1)'; btn.style.opacity = '1'; }, 200);

        FormUtils.showNotification(`Connecting to ${provider === 'google' ? 'Google' : 'GitHub'}...`, 'info', this.form);

        try {
          const { error } = await sb.auth.signInWithOAuth({
            provider,
            options: { redirectTo: window.location.origin + "/auth/callback.html" }
          });
          if (error) throw error;
        } catch (err) {
          FormUtils.showNotification(err.message || 'OAuth failed. Try again.', 'error', this.form);
        }
      });
    });
  }

  handleFocus(e) {
    const wrapper = e.target.closest('.input-wrapper');
    if (wrapper) wrapper.classList.add('focused');
  }

  handleBlur(e) {
    const wrapper = e.target.closest('.input-wrapper');
    if (wrapper) wrapper.classList.remove('focused');
  }

  animateCheckbox() {
    const checkmark = document.querySelector('.checkmark');
    if (checkmark) {
      checkmark.style.transform = 'scale(0.8)';
      setTimeout(() => { checkmark.style.transform = 'scale(1)'; }, 150);
    }
  }

  async handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('email')?.value.trim();
    if (!email) {
      FormUtils.showNotification('Enter your email first.', 'info', this.form);
      return;
    }
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth/callback.html"
      });
      if (error) throw error;
      FormUtils.showNotification('If an account exists, a reset link was sent.', 'success', this.form);
    } catch (err) {
      FormUtils.showNotification(err.message || 'Could not send reset email.', 'error', this.form);
    }
  }

  handleSignupLink(e) {
    e.preventDefault();
    const link = e.target;
    link.style.transform = 'scale(0.95)';
    setTimeout(() => {
      link.style.transform = 'scale(1)';
      window.location.href = '/signup/';
    }, 120);
  }

  handleSocialLogin(e) {
    // (kept for compatibility; real OAuth is in setupSocialButtons)
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const isValid = this.validateForm();
    if (!isValid) return this.shakeForm();

    this.isSubmitting = true;
    this.submitBtn.classList.add('loading');

    try {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      // REAL Supabase login (replaces simulateLogin)
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // success → show message then redirect
      this.showSuccessMessage();

    } catch (error) {
      console.error('Login error:', error);
      this.showLoginError(error.message);
    } finally {
      this.isSubmitting = false;
      this.submitBtn.classList.remove('loading');
    }
  }

  validateForm() {
    let isValid = true;
    Object.keys(this.validators).forEach(fieldName => {
      if (!this.validateField(fieldName)) isValid = false;
    });
    return isValid;
  }

  validateField(fieldName) {
    const field = document.getElementById(fieldName);
    const validator = this.validators[fieldName];
    if (!field || !validator) return true;

    const result = validator(field.value.trim(), field);
    if (result.isValid) {
      FormUtils.clearError(fieldName);
      FormUtils.showSuccess(fieldName);
    } else {
      FormUtils.showError(fieldName, result.message);
    }
    return result.isValid;
  }

  shakeForm() {
    this.form.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => { this.form.style.animation = ''; }, 500);
  }

  showSuccessMessage() {
    this.form.style.opacity = '0';
    this.form.style.transform = 'translateY(-20px)';

    const elementsToHide = ['.divider', '.social-login', '.signup-link'];
    elementsToHide.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-20px)';
      }
    });

    setTimeout(() => {
      this.form.style.display = 'none';
      elementsToHide.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) el.style.display = 'none';
      });

      this.successMessage.classList.add('show');

      // quick redirect
      setTimeout(() => { window.location.href = "/vault/"; }, 900);
    }, 300);
  }

  showLoginError(message) {
    FormUtils.showNotification(message || 'Login failed. Please try again.', 'error', this.form);
    const card = document.querySelector('.login-card');
    card.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => { card.style.animation = ''; }, 500);
  }

  resetForm() { /* not needed now, kept for parity */ }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('#loginForm')) {
        e.preventDefault();
        this.handleSubmit(e);
      }
      if (e.key === 'Escape') {
        ['email','password'].forEach(fieldName => FormUtils.clearError(fieldName));
      }
    });
  }

  // Public helpers
  validate() { return this.validateForm(); }
  getFormData() {
    const formData = new FormData(this.form);
    const data = {};
    for (let [k, v] of formData.entries()) data[k] = v;
    return data;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginCard = document.querySelector('.login-card');
  FormUtils.addEntranceAnimation(loginCard);
  new LoginForm1();

  const homeReturnLink = document.querySelector('[data-home-return]');
  if (homeReturnLink) {
    homeReturnLink.addEventListener('click', () => {
      try { window.localStorage?.setItem(COMING_SOON_STORAGE_KEY, 'true'); } catch {}
    });
  }
});

// Keep focus behavior as you had it
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const activeElement = document.activeElement;
    if (activeElement && activeElement.tagName !== 'INPUT') {
      const emailInput = document.querySelector('#email');
      if (emailInput && !emailInput.value) setTimeout(() => emailInput.focus(), 100);
    }
  }
});
