# Accounts Plan

Updated 2026-11-05. Implementation history belongs in [TASK.md](TASK.md), operational
handoff in [HANDOVER.md](HANDOVER.md), and design details in [architecture](docs/ARCHITECTURE.md).

## Scope and architecture

- Accounts uses Cloudflare Pages, Workers and its dedicated D1 database.
- Password authentication, Google OIDC, optional MFA/passkeys, OAuth/PKCE and
  parent-domain six-account SSO share the same account/session model.
- The core stack requires no paid/card-gated service. Free operation remains
  subject to provider quotas; unlimited capacity or fixed latency is not promised.
- Mail and Store use their own databases. PlusTube, Indogram and GrixChat retain
  their separate Supabase projects. No sibling repository changes are authorized.
- Preserve dynamic APP_DOMAIN configuration, username-only primary identities,
  HttpOnly cookies, live revocation, English-only text and the 500-line file limit.

## Next work

1. Owner reviews the shorter Create New preview: optional birthday under name,
   combined email/password without confirmation or strength labels, then existing
   recovery details. Birthday is a joined Day / Month / Year field; new usernames
   are letters/numbers only. Verify the disclosure and numeric keyboard on a phone.
   Review Google Add new, two linked accounts and explicit selection of each;
   account-specific MFA/password state and stable browser indices must remain intact.
   Do not remove recovery requirements without instructions.
2. Keep password acceptance independent of strength: at least 8 characters, with
   the existing 128-character safety cap and no character-composition requirement.
3. Review and release approved Pages/Worker changes separately. Merging is not
   proof of deployment. The owner authorized merging the current changes, not a
   manual production migration or deployment. Back up D1 and apply
   SQL 11 then SQL 12 with old writes stopped and matching frontend/Worker; verify
   old links were imported. Do not roll only the Worker back to the legacy table.
4. Follow the [owner security checklist](docs/SECURITY_OWNER_CHECKLIST.md) for real
   email delivery, restore drills, live headers/quotas, cross-app and device pilots.
5. Re-check sibling repositories before using the dated handoff prompts in the
   [documentation index](docs/README.md); they are not evidence of current bugs.

Google sign-in is owner-confirmed working. Public branding/consent approval and
full production security verification are not independently established.
Microsoft/Apple sign-in, domain purchase and product renaming remain deferred.
