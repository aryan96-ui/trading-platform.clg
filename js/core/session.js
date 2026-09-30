/**
 * ProTrader — core/session
 *
 * The single owner of *who is signed in* on the client, mirroring the server's
 * single identity owner (src/accounts/account-service.js). Views read
 * `currentUser()` / `activeEmail()`; nothing else reads or writes the session
 * keys, so the account the terminal renders can only come from one place.
 *
 * The storage keys are the ones the payment pages already read (`userEmail`,
 * `user`), so the premium funnel keeps working — this module is simply the only
 * place the terminal reads them from.
 *
 * Before this existed, `auth.js` wrote the signed-in email and the terminal
 * ignored it, hardcoding `demo@college.com` in `core/state.js`. Logging in
 * therefore landed the user on a different account's balance.
 */
const SESSION_EMAIL_KEY = 'userEmail';
const SESSION_USER_KEY = 'user';
const DEMO_ACCOUNT_EMAIL = 'demo@college.com';

/** The signed-in user object, or null. Never invents one. */
function currentUser() {
    try {
        const raw = localStorage.getItem(SESSION_USER_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.email) return parsed;
        }
        const email = localStorage.getItem(SESSION_EMAIL_KEY);
        return email ? { email } : null;
    } catch (e) {
        return null;
    }
}

/** The signed-in email, or null when nobody is signed in. */
function sessionEmail() {
    const user = currentUser();
    return user ? user.email : null;
}

/**
 * The email every account call runs as: the signed-in user, or the demo account
 * when nobody is signed in. The fallback lives here so the rest of the client
 * never hardcodes an identity.
 */
function activeEmail() {
    return sessionEmail() || DEMO_ACCOUNT_EMAIL;
}

/** True when a real account (not the anonymous demo one) is active. */
function isSignedIn() {
    const email = sessionEmail();
    return !!email && email !== DEMO_ACCOUNT_EMAIL;
}

/** Record a successful sign-in. */
function signIn(user) {
    if (!user || !user.email) return;
    try {
        localStorage.setItem(SESSION_EMAIL_KEY, user.email);
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } catch (e) { /* storage unavailable — the session simply will not persist */ }
}

/** End the session. The server keeps none, so this is purely client state. */
function signOut() {
    try {
        localStorage.removeItem(SESSION_EMAIL_KEY);
        localStorage.removeItem(SESSION_USER_KEY);
    } catch (e) { /* best effort */ }
}
