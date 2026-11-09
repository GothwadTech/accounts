# Account UI review: initial twelve and five approval-gated phases

The owner's latest instruction is **visual review**, not authentication validation in
Arena. `npm run preview:ui` serves the shared UI with simulated responses on port 3002.
There are no added banners, preview buttons or alternate page designs. The simulated
identifier/password flow uses private local configuration; it does not issue real
sessions, use cookies, open the account database or call the production Worker.
Its single in-memory display state is shared by the review process. Sign-out resets
the displayed sign-in flag; restarting resets fictional edits as well. It is not authentication, account isolation or a production test.
Real Cloudflare authentication/provider/security verification remains a separate pilot.

## Initial twelve — implemented, awaiting owner visual review

**Backlog IDs:** 1, 2, 3, 9, 11, 13, 21, 26, 31, 52, 54, 99.

1. Local inline SVG icons replace reliance on the external icon font, including dynamic dialogs.
2. Setting labels and values occupy separate lines.
3. Passkeys use the same icon/text/chevron row structure as other settings.
9. Home shortcuts form a balanced two-column grid, with a narrow-screen fallback.
11. Optional birthday is no longer a security recommendation.
13. The blanket “Your account looks secure” conclusion is removed.
21. Section URLs retain account path/query context and support reload/history navigation.
26. Search includes Google accounts and Passkeys and opens their settings dialogs.
31. Mobile search gets its own full-width row instead of competing with account controls.
52. Password dates come from recorded password-change/reset events, not profile updates or
    fabricated dates. The UI explicitly says **Last recorded change**; missing history is
    **Not available**. Audit delivery is best-effort, so this is not a guarantee of the
    latest actual password change if an event was not recorded.
54. Recovery verification comes from the verified-address record matching the current
    recovery address; address presence is not verification. Missing metadata stays unknown.
99. Failed activity/authorization requests show an error and Retry instead of empty data.

The original remaining **98** recommendations are allocated below exactly once.
The owner approved Phases 1–2 together, then explicitly approved **Phases 3, 4 and 5
together** on 2026-11-06. All five UI phases are now implemented: **110/110 review
IDs addressed**, including the initial twelve. Stop for owner visual review. This is
completion of the scoped UI recommendations, not production deployment, a security
certification, guaranteed service availability or a complete accessibility audit.

## Phase 1 — Visual hierarchy, Home and mobile polish (20) — implemented

**Backlog IDs:** 4, 5, 6, 7, 8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 32, 37, 38, 39, 40, 48.

- Typography, contrast, borders, radii, reading width and spacing.
- Meaningful Home recommendations/actions, shortcut priorities and a compact hero.
- Copyable email, collapsed metadata, storage footprint and honest zero-use visuals.
- Touch targets, long-page context, mobile density, long values, zoom/width resilience and photo framing.

Review gate: inspect all sections at desktop/mobile widths and both themes, including
long names/emails and zero-storage fixtures. Preserve the approved form dimensions.

## Phase 2 — Navigation, profile clarity and drawer behavior (20) — implemented

**Backlog IDs:** 22, 23, 24, 25, 27, 28, 29, 30, 33, 34, 35, 41, 42, 43, 44, 45, 46, 47, 49, 50.

- Refine history/refresh/scroll behavior, current-section semantics, search synonyms,
  exact destinations, keyboard result handling and the search shortcut.
- Drawer keyboard/expanded/focus handling.
- Profile grouping, mailbox/phone wording, visibility/privacy controls, date privacy,
  optional fields and precise photo-size/processing copy.

Review gate: keyboard navigation, account-preserving links, search destinations,
reload/Back/Forward and profile dialogs. Never display privacy controls without real support.

### Combined Phase 1–2 implementation and verification

- Page-scoped CSS refines type hierarchy, readable secondary text, card shapes,
  reading width, spacing, long-value wrapping, 48px targets and mobile density.
  Sign-in/sign-up form dimensions and the approved account-menu design are unchanged.
- Home has a smaller hero, email-copy action with a restricted-clipboard fallback,
  native collapsed account metadata, a compact storage summary and four prioritized
  shortcuts. Recovery and optional authenticator suggestions open their actual settings;
  no score, optional-profile pressure, forced password or secure-account verdict is added.
- Zero storage means a genuinely empty bar; fractional use is not forced to 1%.
  Unknown usage/quota stays unavailable. Both Home and Data use the same formatter.
- Navigation keeps account paths, query parameters and hash across refresh/history.
  Paired history/hash events render once. History entries retain reading position;
  delayed content can finish restoration unless the user interacts. Current navigation
  exposes `aria-current`; the mobile header keeps the section name visible while scrolling.
  Connected-service links retain the active account selector when reloaded by navigation.
- Search understands synonyms such as 2FA, sessions, quota, avatar and mailbox.
  Results focus exact controls or open the real dialog. Arrow keys, Enter, Escape,
  Tab dismissal and Ctrl/Cmd K work, with desktop shortcut hints and combobox semantics.
  Search never automatically revokes sessions, exports data or changes permissions.
- The existing drawer now has expanded/current semantics, an explicit close target,
  Escape, arrow navigation, wrapped Tab focus, trigger-focus restoration, closed-state
  inertness and breakpoint cleanup. This is drawer behavior, not Phase 3's modal overhaul.
- Profile separates name/photo, optional birthday/gender and contact roles. The fixed
  account address does not promise mailbox provisioning. Phone ownership/SMS limitations
  are explicit. Sharing information is read-only: no invented public/private switch or
  privacy promise. Birthday has named-month UTC display and a joined 48px Day/Month/Year
  editor; birthday and gender can be cleared through the existing profile endpoint.
- Photo input accepts PNG/JPEG/WebP up to 8 MB. Local preview supports zoom and horizontal/
  vertical framing; only an explicitly saved 256 × 256 JPEG under 2 MB is uploaded.
  The simulator applies only fictional profile/photo edits in process memory; real
  security/provider/external changes are still rejected.
- Added eight automated regressions covering summaries, exact search targets, crop
  bounds, date rendering, account-query preservation and history/scroll restoration.
  Browser QA covers all six sections at 1280/800/390/320px in both themes, sampled
  helper/placeholder contrast, 48px controls, drawer focus/keyboard/breakpoint cleanup,
  exact search and dialogs, optional-field validation/removal, crop pixels and explicit
  save/removal, delayed-content scroll restoration, long legacy values, zero use and
  200%-equivalent reflow (640px CSS viewport at a 1280px desktop baseline).
- Local gates: **300/300 tests**, frontend build, strict Worker TypeScript, visual
  browser QA and patch hygiene pass. No JavaScript errors, horizontal overflow,
  authentication cookies or preview strip in the checked visual flows. This does not
  certify production authentication, provider behavior or a complete accessibility audit.

## Phase 3 — Security methods, recovery and safe dialogs (20) — implemented

**Backlog IDs:** 51, 53, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 101, 102.

- Distinguish Off, unavailable and error states; backup readiness, device prominence,
  security priorities and selected-account context.
- Safe bulk sign-out, friendly availability copy and no password-strength pressure.
- Google/passkey/recovery-code counts, provider/unsupported explanations, linking stages,
  cancellation, removal warnings and local MFA QR/manual setup.
- Dialog focus trapping/restoration and an inert background.

Review gate: visual states first; real ownership/MFA/revocation/provider behavior separately
in the authorized Cloudflare pilot. Do not treat a fixture as proof of account security.

## Phase 4 — Sessions, activity, connected apps and data privacy (20) — implemented

**Backlog IDs:** 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90.

- Current-session ordering, start time, session-versus-device wording, timezone and dates.
- Activity filters/day groups, retained-history pagination, icons and refresh after changes.
- Catalog deduplication, included-versus-connected services, unfinished products,
  real permission/publisher information and disconnect effects.
- Ordering, deletion scope, export categories and storage freshness/source.

Review gate: empty/error/populated histories, connected-app distinctions and precise
privacy/destructive-action language. Backend-dependent metadata must be real or unavailable.

## Phase 5 — Forms, accessibility and reliability hardening (18) — implemented

**Backlog IDs:** 36, 91, 92, 93, 94, 95, 96, 97, 98, 100, 103, 104, 105, 106, 107, 108, 109, 110.

- Keyboard-aware dialogs.
- Inline/associated errors, dirty-close protection, unchanged Save, pending-action guards,
  account-switch invalidation, durable success and explicit Retry patterns.
- Truthful photo-processing stages, live regions, reduced motion, icon names, skip link,
  visible focus and zoom resilience.
- Lazy section data and stale-account response guards.

Review gate: keyboard/screen-reader-oriented checks, narrow/zoomed layouts, interrupted
requests, repeated submissions and switching-account races. Final production validation
remains separate from the visual simulator.

## Combined Phase 3–5 implementation and acceptance

### Security methods and dialogs

- Security shows the selected account, actual Google/passkey counts and backend-derived
  authenticator/recovery-code metadata. Off, unavailable, unknown and request failure
  remain distinct. Recovery readiness does not imply that a user has a usable saved copy.
- Current sessions are prominent and ordered first. Single/bulk sign-out requires an
  account-specific confirmation explaining retained current-session/other-account access.
- Password copy follows the existing 8–128-character policy without strength/complexity
  pressure. Server password/Google/MFA, stable-subject, last-method and revocation guards
  are unchanged. Google availability and passkey support/limits have explicit explanations.
- Google/passkey setup describes stages and cancellation, includes current counts and
  confirms removals in-dialog. Google popup cancellation and account invalidation stop
  pending verification UI from applying a result to a different account.
- MFA uses a locally bundled MIT QR encoder and a manual setup key. No external QR
  service receives the key. Nothing is enabled before server confirmation. One-time
  recovery codes require saved-copy acknowledgement before Done; discard warns that
  an unsaved copy will be lost. Secret values are not persisted in browser storage.
- Shared modal lifecycle traps/restores focus, makes background content inert, supports
  Enter for non-destructive forms, and fits the keyboard-reduced visual viewport,
  including viewport offsets. Escape/backdrop/cancel respects pending and dirty states.

### Sessions, activity, apps and data

- Session cards distinguish a browser/app session from a physical device, show real
  start/last-active timestamps with local timezone and use unavailable labels for gaps.
- Activity has category filters, local-day groups, event-specific icons, explicit refresh
  and client-side Show more over returned records. The API still returns up to 30 recent
  retained events; paging does not claim access to a lifetime history or unreturned data.
- Included identity services, actual optional grants and unconnected catalog entries are
  deduplicated by app ID and shown separately. Included is not automatically provisioned
  or verified available; Contacts remains in development. Permission and publisher data
  are real registry/grant fields or explicitly unavailable, not trust badges.
- Disconnect explains grant/refresh revocation versus already-copied data and app-owned
  sessions. Existing revocation endpoints remain authoritative. App links reject unsafe
  URL schemes/credentials and retain the active account where a handoff is appropriate.
- Accounts export is prioritized before destructive actions and accurately lists profile,
  session records, app grants and up to 100 retained activity records. It is not a Mail/
  Drive/sibling-service export. Storage is an Accounts quota snapshot with an unavailable
  measurement timestamp, not a live per-service usage claim.
- Account deletion requires explicit username and scope acknowledgement, preserves backend
  proof requirements, and does not promise deletion of separate service databases, backups
  or legal records. Other signed-in Accounts identities are not claimed to be deleted.

### Form, accessibility and reliability safeguards

- Shared form actions associate inline errors with fields, preserve failed input, disable
  unchanged profile Save, prevent repeated pending writes and discard stale completions.
  Success persists in an accessible dashboard status region instead of relying on a toast.
  Error recovery offers an explicit retry; security writes are not automatically replayed.
- Photo processing has local-read/preview/upload/confirmation status. Only the explicitly
  saved framed image is uploaded; pending and stale-account guards also apply to removal.
- A skip link, visible focus, decorative icon semantics, search announcements, reduced-motion
  support and narrow/zoom-equivalent layouts supplement the modal/drawer keyboard behavior.
- Initial data loads only for the visible section. Account-bound cache/render tickets reject
  late sessions, methods, activity, grants, exports and form results. Switching clears old
  account-owned content, closes dialogs and rolls back failed hydration instead of showing
  mixed-account security details. Existing cookie/token/authentication contracts are untouched.

### Evidence and boundaries

- **309/309 automated tests pass**, including nine final-phase tests for factor states,
  session ordering/timestamps, catalog/URL/permission presentation, cache races, retry,
  independently decoded QR output and truthful destructive/export/storage copy.
- Build, strict Worker TypeScript and patch hygiene pass. Runtime gates also enforce
  English-only text, valid ESM/CSS references and the 500-line file limit.
- Browser checks pass across six sections at 1280/800/390/320px and both themes, with
  zero cookies, no strip, no horizontal overflow or JavaScript errors. Dedicated checks
  cover unchanged Save, focus/inertness/Enter, dirty/pending/retry, software-keyboard viewport,
  session confirmations, factor failures/unavailability, history filters/paging, app grants,
  scope warnings, reduced motion and durable feedback.
- The actual displayed QR SVG was independently decoded. Synthetic MFA responses verify
  stage/acknowledgement UI, not real enrollment. Synthetic two-account responses exercise
  the real menu-switch path and history invalidation; delayed old session/profile data
  cannot replace the new account's screen. This is not real session isolation proof.
- axe-core reports no automated WCAG A/AA violations in the six sections and name dialog
  at desktop/light and narrow/dark, plus no-results search. Manual assistive-technology,
  actual mobile keyboard, provider, ownership, MFA and revocation pilots remain separate.
- The visual simulator still refuses real security/provider/external writes and uses only
  fictional process-memory profile/photo edits. No deployment, production migration,
  secrets, DNS, sibling-repository work or production validation was performed.
