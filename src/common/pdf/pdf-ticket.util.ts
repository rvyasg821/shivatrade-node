import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Short-lived, signed ticket that lets an authenticated user hand a one-shot
// token to the browser so it can open a PDF directly in a new tab (where the
// server's `Content-Disposition: inline; filename` is honoured — a JS-fetched
// blob tab is named by its random UUID instead).
//
// The secret is process-random: tickets only need to survive the few seconds
// between "mint" (authed) and "open" (window.open). A server restart simply
// invalidates outstanding tickets, which is fine — the user re-clicks.
const SECRET = randomBytes(32);
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function signPdfTicket(
    kind: string,
    id: string,
    ttlMs: number = DEFAULT_TTL_MS
): string {
    const payload = `${kind}:${id}:${Date.now() + ttlMs}`;
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

/** Returns the id when the ticket is valid for `kind` and unexpired, else null. */
export function verifyPdfTicket(
    token: string | undefined,
    kind: string
): string | null {
    try {
        const [pB64, sig] = (token || '').split('.');
        if (!pB64 || !sig) return null;
        const payload = Buffer.from(pB64, 'base64url').toString('utf8');
        const expected = createHmac('sha256', SECRET)
            .update(payload)
            .digest('base64url');
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
        const [k, id, expStr] = payload.split(':');
        if (k !== kind || !id) return null;
        if (Number(expStr) < Date.now()) return null;
        return id;
    } catch {
        return null;
    }
}
