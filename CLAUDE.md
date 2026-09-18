# Workflow rules (mandatory)

- **One branch per ticket.** Never commit work directly to `main`. For each GitHub issue, create a branch first: `issue-<n>-<short-slug>` (e.g. `issue-1-scaffold`).
- **Always merge via a GitHub pull request.** Every branch lands on `main` through a PR — never a local `git merge` pushed to `main`. The PR is the merge record.
- **QA before commit.** Run the full suites from a clean install (`npm ci && npm run lint && npm test && npm run build`; `npm run test:e2e` once Playwright exists) and verify the ticket's acceptance criteria. All green before any commit.
- **Senior-dev code review before commit.** Run a senior-level code review of the working-tree diff (correctness, tests, spec acceptance criteria, conventions). Findings must be resolved or explicitly accepted.
- **MUST wait for approval before commit.** After QA and review pass, present the results and the proposed changes, then STOP and wait for the PM's explicit approval before committing (and before pushing). No exceptions — a green suite is not approval.
- **Branch review before merge.** When pushing a branch, run a code review of the full branch diff (`main..HEAD`) — correctness, tests, and the spec's acceptance criteria for that ticket.
- **Close the ticket when done.** After the work is merged, close the GitHub issue with a closing comment linking the PR.
- **Merge only when all green.** Merge to `main` only when: review findings are resolved, all tests/CI pass, and the ticket's acceptance criteria are met. No self-merge over open findings.

# Public repo — no sensitive data

This repository is public. Nothing committed, pushed, or posted (code, docs, fixtures, commit messages, PR bodies, issue comments) may contain:

- Local usernames, hostnames, or absolute paths from any machine (`/Users/<name>/...`, `*.local`).
- Real email addresses other than the commit identity below, phone numbers, or account identifiers.
- API keys, tokens, deploy secrets, or internal URLs. Secrets live in `.env` (git-ignored) or GitHub Actions secrets only.
- Per-agent memory or scratch files (`.claude/agent-memory/`, `.claude/worktrees/`) — git-ignored; never force-add.
- Names of existing commercial games, studios, or their trademarked terms — no "inspired by X" comparisons anywhere in the repo, issues, or PRs (trademark / takedown risk). Describe the genre generically ("auto-battler", "bullet heaven").

Before pushing any branch, audit `main..HEAD` plus the PR description against this list. Findings → redact before push; if already pushed, rewrite history and re-audit.

# Communication

- Default reply style: brief. Lead with the recommendation, a few bullets max, no walls of text; detail goes in docs, not chat.
- Wait for explicit confirmation before committing/pushing work (see the QA/review/approval gate above).

# Identity

- Commit as `Daniel Quach <danielq.engineer@gmail.com>` (repo-local git config, already set). Never commit with a machine-generated identity.

# Project docs

- Spec: `docs/superpowers/specs/2026-09-14-phase1-design.md` (Phase 1, partly superseded); `docs/superpowers/specs/2026-09-18-phase2-spells.md` (Phase 2 loadout, passives and spell roster)
- Tickets: GitHub issues on this repo (`gh issue view <n>`), milestone "Phase 1". Source list: `docs/tickets/phase1-tickets.md`; ID map: `docs/tickets/phase1-issue-map.md`.
- Stack: Vite + TypeScript + Phaser 3. Unit tests Vitest (`src/core/**`, no Phaser imports). Browser smoke Playwright. RNG only via `src/core/rng.ts` (no `Math.random`).
