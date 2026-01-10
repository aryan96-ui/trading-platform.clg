const urlParams = new URLSearchParams(window.location.search);
const isRegister = urlParams.get('register') === 'true';

document.getElementById('form-title').textContent = isRegister ? 'Register' : 'Login';
document.getElementById('submit-btn').textContent = isRegister ? 'Register' : 'Login';
document.getElementById('switch-link').textContent = isRegister ? 'Login here' : 'Register here';
document.getElementById('switch-link').href = isRegister ? 'login.html' : 'login.html?register=true';

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const endpoint = isRegister ? '/api/register' : '/api/login';

    try {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            if (isRegister) {
                const messageContainer = document.getElementById('message-container') || document.getElementById('message');
                if (messageContainer) {
                    messageContainer.innerHTML = '<div class="message success">Registration successful! Redirecting to login...</div>';
                }
                setTimeout(() => window.location.href = 'login.html', 2000);
            } else {
                // Save user data to localStorage
                localStorage.setItem('userEmail', data.user.email);
                localStorage.setItem('userBalance', data.user.balance);
                localStorage.setItem('user', JSON.stringify(data.user));

                // Redirect to trading dashboard
                window.location.href = 'dashboard-standalone.html';
            }
        } else {
            const messageContainer = document.getElementById('message-container') || document.getElementById('message');
            if (messageContainer) {
                messageContainer.innerHTML = `<div class="message error">${data.message}</div>`;
            }
        }
    } catch (error) {
        const messageContainer = document.getElementById('message-container');
        if (messageContainer) {
            messageContainer.innerHTML = '<div class="message error">Connection error. Please make sure the server is running.</div>';
        }
    }
});
