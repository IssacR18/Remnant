/* ==== Supabase config (EDIT THESE) ==== */
const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co"; // your project URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM";     // Project Settings → API → anon key
/* ===================================== */

const COMING_SOON_STORAGE_KEY = 'remnantComingSoonDismissed';

// uses the global 'supabase' from the CDN script
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

class SignupForm {
  constructor() {
    this.form = document.getElementById('signupForm');
    this.submitBtn = this.form?.querySelector('.login-btn');
    this.successMessage = document.getElementById('signupSuccessMessage');
    this.isSubmitting = false;

    this.validators = {
      firstName: this.validateName.bind(this, 'First name'),
      lastName: this.validateName.bind(this, 'Last name'),
      birthDate: this.validateBirthDate.bind(this),
      phoneNumber: this.validatePhone.bind(this),
      signupEmail: this.validateEmail.bind(this),
      signupPassword: this.validatePassword.bind(this),
      confirmPassword: this.validateConfirmPassword.bind(this)
    };

    this.init();
  }

  init() {
    if (!this.form) return;

    this.addEventListeners();
    FormUtils.setupFloatingLabels(this.form);
    FormUtils.addSharedAnimations();
    this.setupPasswordToggles();
    this.setupSocialButtons();
    this.addInputEntranceAnimation();
  }

  addEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));

    Object.keys(this.validators).forEach((fieldName) => {
      const field = document.getElementById(fieldName);
      if (!field) return;
      field.addEventListener('blur', () => this.validateField(fieldName));
      field.addEventListener('input', () => {
        FormUtils.clearError(fieldName);
        if (field.value.trim() !== '') field.classList.add('has-value');
        else field.classList.remove('has-value');

        if (fieldName === 'signupPassword') {
          const confirmField = document.getElementById('confirmPassword');
          if (confirmField && confirmField.value.trim() !== '') {
            this.validateField('confirmPassword');
          }
        }
      });
    });
  }

  setupPasswordToggles() {
    const toggles = this.form.querySelectorAll('[data-password-toggle]');
    toggles.forEach((toggle) => {
      const targetId = toggle.dataset.passwordToggle;
      if (!targetId) return;
      const passwordInput = document.getElementById(targetId);
      if (!passwordInput) return;
      FormUtils.setupPasswordToggle(passwordInput, toggle);
    });
  }

  setupSocialButtons() {
    const socialButtons = this.form.querySelectorAll('.social-btn');
    socialButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.style.transform = 'scale(0.95)';
        btn.style.opacity = '0.8';
        const provider = btn.classList.contains('google-btn') ? 'google' : 'github';
        FormUtils.showNotification(`Connecting to ${provider === 'google' ? 'Google' : 'GitHub'}...`, 'info', this.form);

        try {
          const { error } = await sb.auth.signInWithOAuth({
            provider,
            options: { redirectTo: window.location.origin + "/auth/callback.html" }
          });
          if (error) throw error;
        } catch (err) {
          FormUtils.showNotification(err.message || 'OAuth failed. Try again.', 'error', this.form);
        } finally {
          setTimeout(() => {
            btn.style.transform = 'scale(1)';
            btn.style.opacity = '1';
          }, 200);
        }
      });
    });
  }

  addInputEntranceAnimation() {
    const inputs = this.form.querySelectorAll('input');
    inputs.forEach((input, index) => {
      input.style.opacity = '0';
      input.style.transform = 'translateY(20px)'; // <- fixed
      setTimeout(() => {
        input.style.opacity = '1';
        input.style.transform = 'translateY(0)';
      }, index * 120);
    });
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const isValid = this.validateForm();
    if (!isValid) {
      this.shakeForm();
      return;
    }

    await this.submitFormToSupabase();
  }

  validateForm() {
    let isValid = true;
    Object.keys(this.validators).forEach((fieldName) => {
      if (!this.validateField(fieldName)) isValid = false;
    });
    return isValid;
  }

  validateField(fieldName) {
    const validator = this.validators[fieldName];
    if (typeof validator !== 'function') return true;

    const field = document.getElementById(fieldName);
    if (!field) return true;

    const result = validator(field.value.trim(), field);
    if (result.isValid) {
      FormUtils.clearError(fieldName);
      FormUtils.showSuccess(fieldName);
      return true;
    }
    FormUtils.showError(fieldName, result.message);
    return false;
  }

  validateName(label, value) {
    if (!value) return { isValid: false, message: `${label} is required` };
    if (value.length < 2) return { isValid: false, message: `${label} must be at least 2 characters` };
    return { isValid: true };
  }

  validateBirthDate(value) {
    if (!value) return { isValid: false, message: 'Birth date is required' };
    const enteredDate = new Date(value);
    const today = new Date();
    if (Number.isNaN(enteredDate.getTime())) return { isValid: false, message: 'Please enter a valid date' };
    if (enteredDate > today) return { isValid: false, message: 'Birth date cannot be in the future' };
    return { isValid: true };
  }

  validateEmail(value) {
    return FormUtils.validateEmail(value);
  }

  validatePhone(value) {
    if (!value) return { isValid: false, message: 'Phone number is required' };
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10) return { isValid: false, message: 'Enter at least 10 digits' };
    if (digits.length > 15) return { isValid: false, message: 'Phone number is too long' };
    return { isValid: true };
  }

  validatePassword(value) {
    return FormUtils.validatePassword(value);
  }

  validateConfirmPassword(value) {
    if (!value) return { isValid: false, message: 'Please re-type your password' };
    const password = document.getElementById('signupPassword')?.value.trim();
    if (value !== password) return { isValid: false, message: 'Passwords do not match' };
    return { isValid: true };
  }

  async submitFormToSupabase() {
    this.isSubmitting = true;
    this.submitBtn?.classList.add('loading');

    const firstName = document.getElementById('firstName')?.value.trim();
    const lastName  = document.getElementById('lastName')?.value.trim();
    const birthDate = document.getElementById('birthDate')?.value || null;
    const phone     = document.getElementById('phoneNumber')?.value.trim();
    const email     = document.getElementById('signupEmail')?.value.trim();
    const password  = document.getElementById('signupPassword')?.value;

    try {
      const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName, phone, birth_date: birthDate },
          // emailRedirectTo: window.location.origin + "/auth/callback.html"
        }
      });
      if (signUpErr) throw signUpErr;

      let session = signUpData?.session ?? null;

      if (!session) {
        const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email, password });
        if (signInErr) {
          const message = signInErr.message || 'Account created! Please sign in.';
          const notificationType = message.toLowerCase().includes('confirm') ? 'info' : 'error';
          FormUtils.showNotification(message, notificationType, this.form);
          this.showSuccessMessage();
          setTimeout(() => (window.location.href = "/login/indexLogin.html"), 1200);
          return;
        }
        session = signInData?.session ?? null;
      }

      if (session?.user?.id) {
        await this.upsertProfile(session.user.id, { firstName, lastName, phone, birthDate });
        this.showSuccessThenRedirect();
        return;
      } else {
        FormUtils.showNotification("Account created! You can now sign in.", "success", this.form);
        this.showSuccessMessage();
        setTimeout(() => (window.location.href = "/login/indexLogin.html"), 1200);
      }
    } catch (error) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('email')) FormUtils.showError('signupEmail', error.message);
      else if (msg.includes('password')) FormUtils.showError('signupPassword', error.message);
      else FormUtils.showNotification(error.message || 'Could not create account. Please try again.', 'error', this.form);
    } finally {
      this.isSubmitting = false;
      this.submitBtn?.classList.remove('loading');
    }
  }

  async upsertProfile(userId, { firstName, lastName, phone, birthDate }) {
    try {
      await sb.from('profiles').upsert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        birth_date: birthDate || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (_) {}
  }

  showSuccessThenRedirect() {
    this.showSuccessMessage();
    setTimeout(() => (window.location.href = "/login/vault.html"), 600);
  }

  showSuccessMessage() {
    if (!this.successMessage) return;
    this.form.style.opacity = '0';
    this.form.style.transform = 'translateY(10px)';
    setTimeout(() => {
      this.form.style.display = 'none';
      this.successMessage.classList.add('show');
    }, 300);
  }

  shakeForm() {
    this.form.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => { this.form.style.animation = ''; }, 500);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const signupCard = document.querySelector('.login-card');
  FormUtils.addEntranceAnimation(signupCard);
  new SignupForm();

  const { data: { session } } = await sb.auth.getSession();
  if (session) window.location.href = "/login/vault.html";

  const homeReturnLink = document.querySelector('[data-home-return]');
  if (homeReturnLink) {
    homeReturnLink.addEventListener('click', () => {
      try { window.localStorage?.setItem(COMING_SOON_STORAGE_KEY, 'true'); } catch {}
    });
  }
});
