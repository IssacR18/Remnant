const COMING_SOON_STORAGE_KEY = 'remnantComingSoonDismissed';

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
                if (field.value.trim() !== '') {
                    field.classList.add('has-value');
                } else {
                    field.classList.remove('has-value');
                }
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
            btn.addEventListener('click', () => {
                btn.style.transform = 'scale(0.95)';
                btn.style.opacity = '0.8';
                const provider = btn.classList.contains('google-btn') ? 'Google' : 'GitHub';
                FormUtils.showNotification(`Connecting to ${provider}...`, 'info', this.form);
                setTimeout(() => {
                    btn.style.transform = 'scale(1)';
                    btn.style.opacity = '1';
                }, 200);
            });
        });
    }

    addInputEntranceAnimation() {
        const inputs = this.form.querySelectorAll('input');
        inputs.forEach((input, index) => {
            input.style.opacity = '0';
            input.style.transform = 'translateY(20px)';
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

        await this.submitForm();
    }

    validateForm() {
        let isValid = true;
        Object.keys(this.validators).forEach((fieldName) => {
            if (!this.validateField(fieldName)) {
                isValid = false;
            }
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
        if (!value) {
            return { isValid: false, message: `${label} is required` };
        }
        if (value.length < 2) {
            return { isValid: false, message: `${label} must be at least 2 characters` };
        }
        return { isValid: true };
    }

    validateBirthDate(value) {
        if (!value) {
            return { isValid: false, message: 'Birth date is required' };
        }

        const enteredDate = new Date(value);
        const today = new Date();
        if (Number.isNaN(enteredDate.getTime())) {
            return { isValid: false, message: 'Please enter a valid date' };
        }
        if (enteredDate > today) {
            return { isValid: false, message: 'Birth date cannot be in the future' };
        }
        return { isValid: true };
    }

    validateEmail(value) {
        return FormUtils.validateEmail(value);
    }

    validatePhone(value) {
        if (!value) {
            return { isValid: false, message: 'Phone number is required' };
        }
        const digits = value.replace(/\D/g, '');
        if (digits.length < 10) {
            return { isValid: false, message: 'Enter at least 10 digits' };
        }
        if (digits.length > 15) {
            return { isValid: false, message: 'Phone number is too long' };
        }
        return { isValid: true };
    }

    validatePassword(value) {
        return FormUtils.validatePassword(value);
    }

    validateConfirmPassword(value) {
        if (!value) {
            return { isValid: false, message: 'Please re-type your password' };
        }
        const password = document.getElementById('signupPassword')?.value.trim();
        if (value !== password) {
            return { isValid: false, message: 'Passwords do not match' };
        }
        return { isValid: true };
    }

    async submitForm() {
        this.isSubmitting = true;
        this.submitBtn?.classList.add('loading');

        try {
            await this.simulateAccountCreation();
            this.showSuccessMessage();
        } catch (error) {
            FormUtils.showNotification(error.message || 'Could not create account. Please try again.', 'error', this.form);
        } finally {
            this.isSubmitting = false;
            this.submitBtn?.classList.remove('loading');
        }
    }

    simulateAccountCreation() {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                const email = document.getElementById('signupEmail')?.value.trim();
                if (email && email.endsWith('@example.com')) {
                    reject(new Error('Use a real email, not example.com, for this demo.'));
                } else {
                    resolve({ success: true });
                }
            }, 1800);
        });
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
        setTimeout(() => {
            this.form.style.animation = '';
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const signupCard = document.querySelector('.login-card');
    FormUtils.addEntranceAnimation(signupCard);
    new SignupForm();

    const homeReturnLink = document.querySelector('[data-home-return]');
    if (homeReturnLink) {
        homeReturnLink.addEventListener('click', () => {
            try {
                window.localStorage?.setItem(COMING_SOON_STORAGE_KEY, 'true');
            } catch (error) {
                // Ignore storage access issues
            }
        });
    }
});
