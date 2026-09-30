/**
 * ProTrader — Premium gate
 *
 * Identity comes from the `x-user-email` header (the demo-auth convention the
 * legacy server used) and the premium flag is read from the single account
 * service. Previously the flag lived in a second store, so a user who paid on
 * one screen could still be denied on another.
 *
 * This is a plan gate, not authentication: it decides what a caller may see,
 * and it does not verify that the caller *is* that email. Real authentication
 * is a separate, larger change — see docs/01 § Security.
 */

module.exports = function requirePremium(accounts) {
    return async function premiumGate(req, res, next) {
        const email = req.headers['x-user-email'];
        if (!email) {
            return res.status(401).json({ success: false, message: 'Unauthenticated' });
        }
        if (!(await accounts.isPremium(email))) {
            return res.status(403).json({ success: false, message: 'Premium subscription required' });
        }
        req.user = { email, isPremium: true };
        next();
    };
};
