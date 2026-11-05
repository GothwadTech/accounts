/** One-use Google onboarding, stable identity lookup, and shared MFA/session issuance. */
import type { D1Database, Env, ResponseWrapper } from './types.ts';
import { ACCOUNT_SLOTS } from './types.ts';
import { GENDER_VALUES, isValidNewUsername, json, readJson, RESERVED_USERNAMES } from './http.ts';
import { randomToken } from './crypto.ts';
import { googleTicket, NO_PASSWORD_PREFIX } from './google-proofs.ts';
import { GOOGLE_ISSUER } from './google-oidc.ts';
import { beginMfaSignIn } from './mfa-login.ts';
import { completeSignIn } from './signin-session.ts';
import { inspectBrowserAccounts } from './browser-slots.ts';
import { logActivity } from './users.ts';

export async function handleGoogleFinish(request: Request, db: D1Database, env: Env,
  route: string, wrap: ResponseWrapper): Promise<Response> {
  if (!((route === '/auth/google/status' && request.method === 'GET') ||
    (route === '/auth/google/finish' && request.method === 'POST'))) return wrap(json({ error: 'not_found' }, 404));
  const ticket = await googleTicket(request, db);
  const expired = () => wrap(json({ error: 'verification_expired', message: 'Google verification expired. Please continue with Google again.' }, 401));
  if (!ticket) return expired();
  if (request.method === 'GET') {
    const linked = await db.prepare(`SELECT u.id, u.username, p.first_name, p.last_name
      FROM auth_external_account_links e JOIN users u ON u.id = e.user_id JOIN profiles p ON p.id = u.id
      WHERE e.issuer = ? AND e.subject = ? ORDER BY e.created_at, u.id`)
      .bind(GOOGLE_ISSUER, ticket.subject).all();
    const accounts = linked.results || [];
    return wrap(json({ ok: true, new_user: accounts.length === 0, accounts,
      first_name: ticket.first_name, last_name: ticket.last_name,
      google_email: ticket.provider_email, next_url: ticket.next_url }));
  }
  const body = await readJson(request);
  // Explicit choice is mandatory. Never silently pick the first linked account.
  const action = body.action;
  if (!['select', 'create'].includes(action)) return wrap(json({ error: 'selection_required',
    message: 'Choose a Gothwad Account or add a new account.' }, 400));
  let account = action === 'select' ? await db.prepare(`SELECT u.id, u.username, u.password_hash
    FROM auth_external_account_links e JOIN users u ON u.id = e.user_id
    WHERE e.issuer = ? AND e.subject = ? AND e.user_id = ?`)
    .bind(GOOGLE_ISSUER, ticket.subject, String(body.account_id || '')).first() : null;
  if (action === 'select' && !account) return wrap(json({ error: 'invalid_account',
    message: 'This account is not available for this Google verification.' }, 400));
  if (ticket.add_mode) {
    const slots = await inspectBrowserAccounts(request, db, env);
    if (slots.validSlots.length >= ACCOUNT_SLOTS.length && !slots.validSlots.some(s => s.userId === account?.id)) {
      return wrap(json({ error: 'max_accounts_reached', message: 'Sign out of one account before adding another.' }, 409));
    }
  }
  const marker = randomToken();
  const now = new Date().toISOString();
  if (!account) {
    const username = String(body.username || '').trim().toLowerCase();
    const first = String(body.first_name || '').trim(), last = String(body.last_name || '').trim();
    const dob = String(body.date_of_birth || '').trim(), gender = String(body.gender || '').trim();
    if (username.length < 3 || !isValidNewUsername(username) || RESERVED_USERNAMES.has(username)) return wrap(json({ error: 'invalid_username', message: 'Choose an available username with 3–24 letters and numbers only.' }, 400));
    if (!first || !last || first.length > 100 || last.length > 100) return wrap(json({ error: 'invalid_name', message: 'Enter your first and last name (up to 100 characters each).' }, 400));
    if (body.confirm_recovery_email !== true || body.accept_terms !== true) return wrap(json({ error: 'confirmation_required', message: 'Confirm your recovery email and accept the terms.' }, 400));
    if ((dob && (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(Date.parse(dob)) || new Date(dob) >= new Date() || new Date(dob).toISOString().slice(0, 10) !== dob)) ||
      (gender && !GENDER_VALUES.includes(gender))) return wrap(json({ error: 'invalid_profile', message: 'Check your date of birth and gender.' }, 400));
    const id = crypto.randomUUID();
    const disabled = NO_PASSWORD_PREFIX + crypto.randomUUID();
    // Each batch consumes one browser-bound proof. Separate fresh proofs may create
    // separate usernames for the same Google subject; replay cannot create orphans.
    try {
      const result = await db.batch([
        db.prepare(`INSERT INTO users (id, username, password_hash, created_at, updated_at)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM auth_google_tickets
            WHERE token_hash = ? AND purpose = 'auth' AND used_by IS NULL AND expires_at > ?) RETURNING id`)
          .bind(id, username, disabled, now, now, ticket.token_hash, now),
        db.prepare(`INSERT INTO profiles (id, username, first_name, last_name, recovery_email, date_of_birth, gender)
          SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`)
          .bind(id, username, first, last, ticket.provider_email, dob || null, gender || null, id),
        db.prepare(`INSERT INTO auth_external_account_links (issuer, subject, user_id, provider_email, created_at, created_passwordless)
          SELECT ?, ?, ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`)
          .bind(GOOGLE_ISSUER, ticket.subject, id, ticket.provider_email, now, id),
        db.prepare(`INSERT INTO verified_recovery_emails (user_id, email, verified_at)
          SELECT ?, ?, ? WHERE ? = 1 AND EXISTS (SELECT 1 FROM users WHERE id = ?)`)
          .bind(id, ticket.provider_email, now, ticket.authoritative, id),
        db.prepare(`UPDATE auth_google_tickets SET used_by = ? WHERE token_hash = ? AND used_by IS NULL
          AND EXISTS (SELECT 1 FROM users WHERE id = ?) RETURNING token_hash`).bind(marker, ticket.token_hash, id),
      ]);
      if (!result[0].results?.length || !result[4].results?.length) return expired();
    } catch (error) {
      // Do not mask storage outages as a username conflict.
      if (!/UNIQUE constraint failed/i.test(String(error))) throw error;
      return wrap(json({ error: 'account_conflict', message: 'This username was just registered. Choose another username or continue with Google again.' }, 409));
    }
    account = { id, username, password_hash: disabled };
    await logActivity(db, id, 'signup', 'Account created with Google', 'No password added', request);
  } else {
    const consumed = await db.prepare(`UPDATE auth_google_tickets SET used_by = ? WHERE token_hash = ?
      AND purpose = 'auth' AND used_by IS NULL AND expires_at > ?
      AND EXISTS (SELECT 1 FROM auth_external_account_links WHERE issuer = ? AND subject = ? AND user_id = ?)
      RETURNING token_hash`)
      .bind(marker, ticket.token_hash, now, GOOGLE_ISSUER, ticket.subject, account.id).first();
    if (!consumed) return expired();
  }
  const credentials = { userId: account.id, username: account.username, passwordHash: account.password_hash };
  const options = { remember: !!ticket.remember_me, addMode: !!ticket.add_mode };
  // Google authentication is a first factor, never a replacement for local MFA.
  const mfa = await beginMfaSignIn(db, credentials, options);
  if (mfa) return wrap(mfa);
  return completeSignIn(request, db, env, credentials, options, wrap, {
    statements: [], version: null, method: 'google',
    sql: `EXISTS (SELECT 1 FROM auth_google_tickets WHERE token_hash = ? AND used_by = ?)
      AND EXISTS (SELECT 1 FROM auth_external_account_links WHERE issuer = ? AND subject = ? AND user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND enabled = 1)`,
    bindings: [ticket.token_hash, marker, GOOGLE_ISSUER, ticket.subject, account.id, account.id],
  });
}
