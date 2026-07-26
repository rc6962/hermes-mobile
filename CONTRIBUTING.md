# Contributing to Hermes Mobile

## Development philosophy

This project follows **strict test-driven development (TDD)** with the RED → GREEN → REFACTOR cycle applied at every level:

1. **RED** — Write a test that fails for the expected reason (no implementation yet).
2. **GREEN** — Write the *minimum* implementation to make the test pass. Use mocks, stubs, or the simplest possible code. Do not add features that aren't tested yet.
3. **REFACTOR** — Improve the implementation while keeping all tests green. No new behavior.

Every new API contract, parser, bridge method, or state reducer starts with a test. Frontend work follows the same cycle via React Testing Library for behavior, not implementation details.

---

## Validation commands

Run these locally before every commit:

| Command | Purpose |
|---|---|
| `npm test -- --run` | Run the full test suite once (Vitest). All tests must pass. |
| `npm run typecheck` | TypeScript strict-mode check. Must pass with no errors. |
| `npm run lint` | ESLint with the project config. Must pass. |
| `node scripts/check-environment.mjs` | Verify local toolchain (Node, Java, Android SDK, ADB). |

Expected from a clean checkout:

```bash
cd mobile
npm install
npm test -- --run            # RED on missing test subjects; GREEN after implementation
npm run typecheck
npm run lint
```

CI runs the same commands. A PR that fails any command will not be merged.

---

## Secret-handling rules

**No secrets may be committed to this repository — ever.** This includes, but is not limited to:

- Hermes API keys (`API_SERVER_KEY`)
- LLM provider credentials (OpenAI, Anthropic, xAI, Google, etc.)
- APK signing keystores, passwords, or aliases
- Termux or device credentials
- Firebase / Google Services JSON keys
- Any token, password, private key, or certificate

### Preventative measures

- The `.gitignore` blocks `.env`, `.env.*`, `*.keystore`, `*.jks`, `*.p12`, and `local.properties`.
- The `.env.example` file contains **placeholders only** — never real values.
- Run `git diff --cached` before every commit and visually scan for secrets.
- If a secret is accidentally committed, rotate it immediately and contact the repository owner. Do not attempt to rewrite history without coordination.

### Local development

- Copy `.env.example` to `.env` and fill in your local settings.
- The `VITE_API_SERVER_KEY` in `.env` must be a **per-install randomly generated key**, not a shared credential.
- Never paste a real API key into issues, PR descriptions, screenshots, or CI logs.

---

## Safe Termux `RUN_COMMAND` boundaries

The Android app communicates with Hermes in Termux via the `com.termux.RUN_COMMAND` intent and
`com.termux.app.RunCommandService`. To keep the device secure:

### Allowed operations (fixed list)

| Operation | Script | Purpose |
|---|---|---|
| `start` | `termux-backend/mobile-lifecycle.sh start` | Start the Hermes API server |
| `stop` | `termux-backend/mobile-lifecycle.sh stop` | Stop the Hermes API server |
| `restart` | `termux-backend/mobile-lifecycle.sh restart` | Restart the Hermes API server |
| `doctor` | `termux-backend/mobile-lifecycle.sh doctor` | Run diagnostics |
| `update` | `termux-backend/mobile-lifecycle.sh update` | Update Hermes |

### Safety rules

1. **Never pass arbitrary user-entered text** through `RUN_COMMAND` extras. Only fixed, app-generated values from the allowlist above are acceptable.
2. **Never construct a shell command string** from user input and send it via `RUN_COMMAND`. Use the Hermes API for all chat/run operations.
3. **Do not log** the intent extras or the script output that might contain secrets.
4. **Always validate** that the requested operation is in the allowlist *before* building the intent.
5. **Handle missing Termux** gracefully — show a setup screen with instructions, not a crash.

These rules are enforced by code review and covered by the TypeScript action-contract test plus
the native Android build. The native bridge uses Java for this milestone.

---

## Branch and commit workflow

### Branch naming

| Pattern | Purpose |
|---|---|
| `feat/<short-description>` | New feature |
| `fix/<short-description>` | Bug fix |
| `chore/<short-description>` | Tooling, CI, or dependency changes |
| `docs/<short-description>` | Documentation-only changes |

Examples: `feat/sse-parser`, `fix/approval-timeout`, `chore/gradle-wrapper`, `docs/termux-setup`

### Commit messages

Use conventional commits:

```
<type>(<scope>): <short summary>

[optional body: explain what and why, not how]
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`, `ci`.

Scopes match the project layout: `api-client`, `sse`, `bridge`, `ui`, `ci`, `docs`, `termux`.

Examples:

```
feat(api-client): add authenticated health check method

test(api-client): add 401 handling tests

chore(gradle): pin Android SDK 35 and AGP 8.7

docs(contributing): clarify secret-handling rules for Termux intents
```

### Before pushing

1. Run all validation commands (tests, typecheck, lint).
2. Run `git diff --cached` to verify no secrets, debug logs, or accidental includes.
3. Rebase onto the latest `main` to keep history linear.
4. Push and open a PR.

### PR guidelines

- Every PR must add or modify tests covering the changed behavior.
- Prefer small, focused PRs over large rewrites.
- The PR description must reference any related issue or task from the plan.
- A PR that adds a new dependency must describe why it is needed.

---

## Keeping secrets out of Git

As a final safety net, run this before every commit (add as a git hook):

```bash
#!/bin/sh
# .git/hooks/pre-commit
if git diff --cached --diff-filter=ACM | grep -Eq '(API_KEY|Bearer|sk-[a-zA-Z0-9]{20,}|password|secret)'; then
  echo "ERROR: Possible secret detected in staged changes. Aborting commit."
  echo "Inspect the diff with: git diff --cached"
  exit 1
fi
```

This is optional but strongly recommended for all contributors.
