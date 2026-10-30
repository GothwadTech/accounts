# Accounts Worker Build Troubleshooting

Updated: 2026-10-30. Pages and Workers have separate Git deployment integrations.
A successful Pages check or merged PR does not prove the API Worker was deployed.
The reported MFA/passkey `Endpoint not found` error is consistent with an older
Worker or incorrect API routing, but the live revision/routing must be verified.

## What is known

- PR #24 merged as `b15959ebb988b12d685ecfddfded15d3e49264ae`.
- GitHub reports a successful Pages deployment for that merge revision.
- The PR's Worker build `23da081c-d162-439f-bd78-3ddfa8f8ebfd` failed. Available
  merge-revision checks do not establish a successful new Worker deployment.
- The repository contains MFA/passkey handlers and a default-only Worker entrypoint.
- Local build, tests, strict types, and Worker bundling pass. These do not inspect
  Cloudflare Git integration settings, build permissions, or production routing.

Do not attribute the failure to a particular setting without the build log.
A missing MFA encryption key does not explain both feature routes returning 404.

## Phone dashboard inspection

1. Open Cloudflare -> Workers & Pages -> the **accounts Worker**, not the Pages app.
2. Open Settings -> Builds / Git integration, or the equivalent build configuration.
3. Inspect the connected repository, production branch, root directory, build
   command, deploy command, and branch/watch-path controls. Labels may differ.
4. Open Builds -> the latest failed build. Read the failing phase and the final
   20–30 log lines. Record its commit and branch so old errors are not misdiagnosed.
5. Share only redacted errors or screenshots of build settings. Do not show the
   Variables and Secrets values, API tokens, cookies, or passwords.

## Repository-compatible configuration

The simplest consistent working-directory layout for the **Worker** is:

| Setting | Expected repository layout |
|---|---|
| Repository | `GothwadTech/accounts` |
| Production branch | `main` |
| Root directory | `cloudflare-worker` |
| Dependency installation | Install from that directory's `package-lock.json` (`npm ci` if explicitly configured) |
| Deploy command, from that directory | `npx wrangler deploy` |
| Wrangler configuration | `wrangler.toml` in that directory |
| Entrypoint | `src/worker.ts`, selected by Wrangler; not a manual override to `src/index.ts` |

A repository-root working directory can also work, but its install and deploy
commands must explicitly target the Worker subdirectory and its dependencies.
Do not combine one layout's root directory with the other layout's paths.

Check that production deployments are enabled and relevant Worker/config/lockfile
changes are not excluded by watch paths. Do not blindly alter the existing Pages
configuration; it is a separate integration serving `web/`.

These are compatible configuration values, **not evidence of current dashboard
settings or the cause of this failure**. Compare them with the actual log before
changing settings. Build credentials/permissions, Node version, dependency install,
preview commands, and route/binding errors can fail independently.

## Diagnose by observation

- **No build appears for the latest main commit:** inspect production branch,
  repository connection, deployment enablement, and watch-path controls.
- **A build appears and fails:** fix the exact logged failure. Retrying an unchanged
  build alone is not a reliable repair.
- **Latest Worker deploy succeeds but routes still return 404:** verify deployed
  revision and that account-host `/api/*` and the API custom domain reach this same
  Worker, rather than an older service. Do not expose session credentials to test it.
- **Routes exist but enrollment is unavailable:** check MFA key presence separately.
  Passkeys also need the exact secure account origin and supported device/browser.

Do not delete D1 data, recreate user accounts, replace signing/encryption keys,
change DNS indiscriminately, or bypass authentication to solve a deployment issue.
Review backups and the security release checklist before retrying production
rollout. This guide performs no deployment or live configuration changes.
