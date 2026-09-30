/**
 * ProTrader — Authentication Controller
 * 
 * Handles user sign-in, registration, session persistence,
 * password visibility toggling, input validation, and secure redirects.
 */

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isRegister = urlParams.get('register') === 'true' || urlParams.get('register') === '1';

    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnArrow = document.getElementById('btn-arrow');
    const switchText = document.getElementById('switch-text');
    const nameGroup = document.getElementById('name-group');
    const statusAlert = document.getElementById('status-alert');
    const alertText = document.getElementById('alert-text');
    const alertIcon = document.getElementById('alert-icon');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const nameInput = document.getElementById('name');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const forgotPasswordLink = document.getElementById('forgot-password-link');

    // 1. Toggle Mode (Login vs Register)
    if (isRegister) {
        if (formTitle) formTitle.textContent = 'Create your account';
        if (formSubtitle) formSubtitle.textContent = 'Start algorithmic paper trading with ₹100,000 virtual balance';
        if (btnText) btnText.textContent = 'Create Account';
        if (nameGroup) nameGroup.style.display = 'block';
        if (switchText) {
            switchText.innerHTML = 'Already have an account? <a href="login.html" class="auth-toggle-link">Sign In</a>';
        }
    } else {
        if (formTitle) formTitle.textContent = 'Welcome back';
        if (formSubtitle) formSubtitle.textContent = 'Sign in to your ProTrader algorithmic account';
        if (btnText) btnText.textContent = 'Sign In';
        if (nameGroup) nameGroup.style.display = 'none';
        if (switchText) {
            switchText.innerHTML = 'Don\'t have an account? <a href="login.html?register=true" class="auth-toggle-link">Create one</a>';
        }
    }

    // 2. Pre-fill remembered email
    const rememberedEmail = localStorage.getItem('protrader_remembered_email');
    if (rememberedEmail && emailInput && !isRegister) {
        emailInput.value = rememberedEmail;
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
    }

    // 3. Password Visibility Toggle
    if (togglePasswordBtn && passwordInput) {
        let isVisible = false;
        togglePasswordBtn.addEventListener('click', () => {
            isVisible = !isVisible;
            passwordInput.type = isVisible ? 'text' : 'password';
            togglePasswordBtn.innerHTML = isVisible
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                     <line x1="1" y1="1" x2="23" y2="23"></line>
                   </svg>`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                     <circle cx="12" cy="12" r="3"></circle>
                   </svg>`;
        });
    }

    // 4. Forgot Password Trigger
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            showAlert('info', 'ℹ️', 'For security, password resets are processed via administrator or support@protrader.io.');
        });
    }

    function showAlert(type, icon, message) {
        if (!statusAlert || !alertText) return;
        statusAlert.className = `status-alert ${type}`;
        if (alertIcon) alertIcon.textContent = icon;
        alertText.textContent = message;
        statusAlert.style.display = 'flex';
    }

    function hideAlert() {
        if (statusAlert) statusAlert.style.display = 'none';
    }

    function setSubmitting(submitting, actionText) {
        if (!submitBtn) return;
        submitBtn.disabled = submitting;
        if (submitting) {
            submitBtn.innerHTML = `<div class="spinner"></div><span>${actionText}</span>`;
        } else {
            submitBtn.innerHTML = `
                <span id="btn-text">${actionText}</span>
                <svg id="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            `;
        }
    }

    // 5. Form Submit Handler
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            const email = (emailInput?.value || '').trim();
            const password = passwordInput?.value || '';
            const name = (nameInput?.value || '').trim();

            // Client-side validation
            if (!email || !email.includes('@') || !email.includes('.')) {
                showAlert('error', '⚠️', 'Please enter a valid email address.');
                emailInput?.focus();
                return;
            }

            if (!password || password.length < 4) {
                showAlert('error', '⚠️', 'Password must be at least 4 characters.');
                passwordInput?.focus();
                return;
            }

            if (isRegister && password.length < 6) {
                showAlert('error', '⚠️', 'Password must be at least 6 characters for registration.');
                passwordInput?.focus();
                return;
            }

            // Save or clear remembered email
            if (rememberMeCheckbox?.checked) {
                localStorage.setItem('protrader_remembered_email', email);
            } else {
                localStorage.removeItem('protrader_remembered_email');
            }

            const endpoint = isRegister ? '/api/register' : '/api/login';
            const payload = isRegister ? { email, password, name } : { email, password };
            const actionText = isRegister ? 'Creating Account...' : 'Authenticating...';

            setSubmitting(true, actionText);

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (data.success) {
                    // Persist JWT Tokens
                    if (data.token) {
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('jwtToken', data.token);
                    }

                    // Persist User Session
                    const userObj = data.user || {
                        email,
                        name: name || 'ProTrader Trader',
                        balance: 100000,
                        isPremium: true,
                        tierLevel: 'pro'
                    };

                    localStorage.setItem('userEmail', userObj.email);
                    localStorage.setItem('userBalance', userObj.balance !== undefined ? userObj.balance : 100000);
                    localStorage.setItem('user', JSON.stringify(userObj));

                    if (typeof signIn === 'function') {
                        signIn(userObj);
                    }

                    showAlert('success', '✓', isRegister ? 'Account created! Initializing terminal...' : 'Welcome back! Launching terminal...');

                    setTimeout(() => {
                        window.location.href = 'terminal.html';
                    }, 500);
                } else {
                    setSubmitting(false, isRegister ? 'Create Account' : 'Sign In');
                    showAlert('error', '✕', data.message || 'Authentication failed. Please verify your credentials.');
                }
            } catch (err) {
                setSubmitting(false, isRegister ? 'Create Account' : 'Sign In');
                showAlert('error', '✕', 'Connection error. Please ensure the backend server is reachable.');
            }
        });
    }
});
