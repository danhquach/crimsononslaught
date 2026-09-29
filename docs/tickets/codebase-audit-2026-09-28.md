# Codebase audit, round 1 (CO-150)

Ticket: [#230](https://github.com/danhquach/crimsononslaught/issues/230) · Tree: `main` at `1d2f079` (CO-185 merged) · Date: 2026-09-28

One pass over the whole repository. The pass fixes nothing: every **fix** row becomes its own follow-up ticket (the Ticket column), and the audit closes when this document merges.

**Severity:** **S-1** means critical: exploitable, or it loses player data for everyone. **S-2** is major. **S-3** is significant, but has a workaround or needs a deliberate setup. **S-4** is minor. **S-5** is trivial or cosmetic.

**Method.** Code reading, plus scratch Vitest probes that fed hostile values through the real resolvers, `parseSave`, the passive caps and a throwing `localStorage`. One production build was inspected. `npm audit` was run, and a mirror clone of the public repo was scanned: every commit, blob and PR ref. The deployed site was not walked live, so the switch-run result in §1.5 comes from reading the code, not from playing it.

**Headline.** There are no S-1 or S-2 findings, and nothing blocks handing the build to testers. There are two S-3s: the `main` ruleset can be bypassed, and the boss can be stun-locked. The test switches work on the live site and do count toward the Profile. That is S-4; option A below was chosen.

---

## Decision: test switches in production

**Facts.** `BootScene` honours `?seed`, `?timeScale`, `?startAt`, `?invulnerable`, `?loadout`, `?enemies` and `?debug` in every build. Nothing checks `import.meta.env`. `endRun` always runs `recordRun` and then stores the result, so a switched run still adds wins, raises the best time and banks Embers. For example, `?startAt=1170` sets the best time to at least 19:30 even if the hero dies at once. The e2e suite runs against `npm run dev`, never the production build (`playwright.config.ts` webServer).

**Decided 2026-09-28: option A.**

| Option | Effect |
|---|---|
| **A. Gate the switches behind `import.meta.env.DEV`** (chosen) | CI is unchanged, because e2e already runs in DEV. The one save write stays branch-free, and `fullRun.spec` keeps covering it. Cost: manual walks of the deployed site lose the switches, so they use the dev server or a staging `--mode` build. Keep `?seed` in production: it does not change outcomes, and bug reports quote it. |
| B. Keep the switches, and have production skip the Profile and Embers | Adds a "tainted run" branch to `endRun`, and `fullRun.spec` loses coverage of the real write. The live site still allows invulnerable and debug play. |

---

## 1. Security (web surface)

| # | Check | Finding | Sev | Decision | Ticket |
|---|---|---|---|---|---|
| 1.1 | URL, save and settings values are parsed safely, range-clamped, and cannot crash boot or inject markup | Clean. Every parameter goes through an allow-list or a clamp. For example, `timeScale=1e308` becomes 30, `startAt=-5` or `NaN` becomes 0, and `loadout=__proto__,…` drops everything but valid spell ids. The code has no `innerHTML`, `eval` or `document.title` sink, and no regex runs on input. Three edge cases remain. `timeScale=1e-320` is accepted, which freezes the clock. `loadout` and `enemies` are neither de-duplicated nor capped: 400k copies reach the spellbook and one log line. Save counts accept values up to 1e308 (see 5.5). | S-5 | fix: add a `timeScale` floor, de-duplicate and cap the lists | [#316](https://github.com/danhquach/crimsononslaught/issues/316) |
| 1.2 | Dev and debug scenes, and the tuning switches, in the production build | All switches and both debug scenes (`?debug=textures\|collisions`) are live on the deployed site. `?debug` is an exact-match allow-list. | S-4 | fix: option A | [#316](https://github.com/danhquach/crimsononslaught/issues/316) |
| 1.3 | CSP and headers; third-party requests at runtime | No CSP; GitHub Pages cannot send headers, and `index.html` has no meta CSP. There is one third-party call: the Help feedback form posts to the form service, and only when the player presses Send. No fonts, CDNs or analytics. | S-4 | fix: meta CSP injected at build time only (dev HMR needs inline script), with `connect-src 'self'` plus the form service | [#316](https://github.com/danhquach/crimsononslaught/issues/316) |
| 1.4 | Things in the bundle that should not ship | Clean. No source maps, no `window.__` hooks, no TODO notes or local paths. The `console.info` lines (`[rng] seed=`, `[run]`, `[save]`) print only allow-listed ids and numbers. | — | accept: the logs help bug reports | — |
| 1.5 | A switched run (`?invulnerable=1&startAt=1170`) counts toward the Profile and Embers | Yes: it adds wins, raises the best time and banks Embers (see the decision above). There is no server or leaderboard, and `localStorage` is editable anyway, so only the player's own save is affected. | S-4 | fix: option A | [#316](https://github.com/danhquach/crimsononslaught/issues/316) |
| 1.6 | The feedback form's access key is in the bundle | The key is public by design (this form service's keys are meant to sit in the page). The 30 s cooldown resets on reload, so the worst case is form spam. | S-5 | accept | — |

## 2. Supply chain and CI

| # | Check | Finding | Sev | Decision | Ticket |
|---|---|---|---|---|---|
| 2.1 | Dependency advisories | `npm audit` and `npm audit --omit=dev` both found 0 vulnerabilities (2026-09-28). | — | accept | — |
| 2.2 | Lockfile integrity; dev tools stay out of the bundle | Clean. Lockfile v3, 173 packages. Every package resolves from the npm registry and has a sha512 hash. The runtime is only phaser and its dependency eventemitter3. `vitest` is imported only from `*.test.ts`. | — | accept | — |
| 2.3 | Workflow permissions per job | Least privilege: the workflow gets `contents: read`, and only the deploy job adds `pages: write` and `id-token: write`. No `pull_request_target`, no `${{ github.event.* }}` in `run:`, and fork PRs get no secret. | — | accept | — |
| 2.4 | Actions pinned by tag or by commit | All five are GitHub-owned and pinned by major tag, not by SHA. The repo allows any action. | S-4 | fix (low priority): pin to SHAs, or allow only GitHub-owned actions | [#314](https://github.com/danhquach/crimsononslaught/issues/314) |
| 2.5 | Deploy only from a green `main` | Yes. Deploy needs a passing `check` job (lint, test, build, e2e) on a push to `main`. There is no manual trigger, and the Pages environment allows only `main`. | — | accept | — |
| 2.6 | Branch protection | There is no classic protection. The `protect-main` ruleset blocks deletion and force-push and requires a PR with one approval, but it has **no required status check**, and merges go through the admin bypass. So a red PR can reach `main`; a red `main` still does not deploy. | S-3 | fix: require the CI check, and set approvals so merges no longer need `--admin` (owner's call) | [#314](https://github.com/danhquach/crimsononslaught/issues/314) |
| 2.7 | Dependabot | Alerts and security updates are off, and there is no `dependabot.yml`. Secret scanning and push protection are on. | S-4 | fix: turn on alerts and security updates | [#314](https://github.com/danhquach/crimsononslaught/issues/314) |
| 2.8 | Art and audio scripts: what they fetch, where keys come from | Clean. No script makes a network call, and none reads a key. Downloads are placed by hand and checked by sha256. ffmpeg runs through `execFileSync` with an argument array, so no shell is involved. `.env*` is git-ignored, and `.env.example` is empty. | — | accept | — |

## 3. Public-repo hygiene (full history, including PR refs)

| # | Check | Finding | Sev | Decision | Ticket |
|---|---|---|---|---|---|
| 3.1 | Local paths, usernames, hostnames | Clean across history. `settings.local.json` is ignored only by the owner's global gitignore, not by the repo. | S-5 | fix: add it to `.gitignore` | [#314](https://github.com/danhquach/crimsononslaught/issues/314) |
| 3.2 | Emails and identities | Clean. One author identity; the committers are that identity and GitHub. Co-author trailers use only noreply addresses. | — | accept | — |
| 3.3 | Keys and tokens | No keys. Three commits carry a session-link trailer from the coding assistant; the links need a login and grant nothing. | S-5 | accept: keep the trailer out of future commits; a rewrite is not worth it | — |
| 3.4 | Per-agent scratch files | Clean. The only file ever committed under `.claude/` is `CLAUDE.md`. | — | accept | — |
| 3.5 | OS junk | Clean: no `.DS_Store`, `Thumbs.db` or `._*`, ever. | — | accept | — |
| 3.6 | Art metadata (C2PA, EXIF) | `public/` assets are clean. `docs/art/sheets/` on `main` still carries generator provenance: 22 JPEGs with a C2PA manifest, 5 PNGs with a `caBX` chunk, and 2 JPEGs with an EXIF generator tag. None of it is personal data. These sheets are source files, not shipped assets. | S-4 | fix: strip losslessly at `HEAD`. Accept what is in history. | [#317](https://github.com/danhquach/crimsononslaught/issues/317) |
| 3.7 | Names of commercial games or studios | Clean: a scan for about 90 titles and studios, plus "inspired by" and "clone of" phrasings, found nothing. | — | accept | — |

## 4. Gameplay loopholes and exploits

| # | Check | Finding | Sev | Decision | Ticket |
|---|---|---|---|---|---|
| 4.1 | Caps that can be stacked past | Clean where caps exist. The cooldown floor (0.35), crit (0.75), damage reduction (0.6) and move speed (320) all clamp. `takePassive` throws at cap, and offers filter by rank. Power, Expanse and Persistence stay uncapped by spec §5. | — | accept | — |
| 4.2 | Crowd control on the boss | The boss takes stuns and staggers like any enemy. With 4 Persistence, or 2 Persistence plus Everfrost, the Lightning Sword's stagger outlasts the gap between blades, so the boss never moves again. This was worked out from the config numbers, not simulated in the engine. | S-3 | fix: diminishing returns on boss CC (decided 2026-09-28) | [#315](https://github.com/danhquach/crimsononslaught/issues/315) |
| 4.3 | Offers that do nothing at a clamp | Haste is still offered at the cooldown floor, and Ward and Precision at theirs. `eligiblePassives` checks rank only, while relic offers already check the clamp. | S-5 | fix: reuse the relic `atCap` check | [#315](https://github.com/danhquach/crimsononslaught/issues/315) |
| 4.4 | Rewards that fire twice or never across scene changes | Clean. The only Ember write is `endRun`, guarded by `phase === 'over'`. Level-up and relic overlays cannot stack. Picks are sent once. Several level-ups queue in order. Collection is idempotent. | — | accept | — |
| 4.5 | Boss and hero dying close together | The outcome is decided when each death clip ends, not at the killing blow. The boss clip runs 1000 ms and the hero clip 750 ms. If the boss dies and the hero reaches 0 HP within 250 ms, the run records a **loss**, although the boss Embers are banked. If the hero reaches 0 HP 250–1000 ms after the boss, it records a **win** with a dead hero. | S-4 | fix: decide at the killing blow, and stop damage to the hero after it | [#315](https://github.com/danhquach/crimsononslaught/issues/315) |
| 4.6 | Dead hero during the death clip | At 0 HP the hero still collects gems and Embers, and can be shown a level-up or relic overlay. The run still ends. | S-5 | fix: skip collection and overlays while the hero is dead | [#315](https://github.com/danhquach/crimsononslaught/issues/315) |
| 4.7 | Unbounded growth after a run | Clean. `GameScene` removes all 12 listeners on shutdown, the HUD and poll listeners are removed too, every pool has `maxSize`, and the code uses no tweens or timers. | — | accept | — |
| 4.8 | Pause, blur, and the boss and wave clock under `timeScale` | Clean. The run clock is the scene's delta, and blur or hidden opens Pause. `timeScale` is clamped to 30 and stepped in slices of about 16 ms. Wave and elite windows are contiguous and half-open, and `startAt` ≥ 1200 is rejected. | — | accept | — |
| 4.9 | Values pushed to NaN, Infinity or negative | Clean in play. Every division is guarded, and XP and Ember inputs are checked with `!(x > 0)`. Only a hand-edited save can overflow Embers (see 5.5). | — | accept | — |
| 4.10 | Farming Embers or XP | Clean. A kill counts once. Splitlings drop no loot. The boss and chests pay once. Only a switched run farms quickly (1.5). | — | accept | — |
| 4.11 | Unlimited rerolls and bans | By design (#228): each one costs the level's pick. | S-5 | accept | — |

## 5. Correctness and robustness

| # | Check | Finding | Sev | Decision | Ticket |
|---|---|---|---|---|---|
| 5.1 | Every random draw goes through the seeded RNG | Clean for gameplay. `src/` has no `Math.random`, and ESLint bans it. Ten seeded streams exist; the music and player-name streams seed from the clock by design. The only exception is Phaser's camera shake, which draws from `Math.random` internally but moves only the render matrix. | S-5 | accept: cosmetic | — |
| 5.2 | The core layer has no engine imports | Clean. An import graph of all 187 files reachable from `src/core` and `src/config` never reaches `phaser` or the engine folders. | — | accept | — |
| 5.3 | Back-to-back runs leak nothing | Clean by code reading. Every `on` has a matching `off` on shutdown, and the keyboard listeners are cleared by Phaser's plugin shutdown. The audio listeners are added once per page by design. Not measured in a browser. | — | accept | — |
| 5.4 | Storage full or unavailable | No crash: all three storage calls are wrapped, and a scratch test covered each failure. A throwing getter, a `SecurityError`, a quota error on write and a throw during import all passed, and boot completes with an empty save. But a failed write is silent: in a private window, Embers and upgrades last only for the session and vanish on reload without notice. | S-4 | fix: one line on Result or Intro when the last store failed | [#316](https://github.com/danhquach/crimsononslaught/issues/316) |
| 5.5 | Save parser: shape and ranges | The shape check is sound: bad input resets cleanly, `__proto__` does not pollute, ranks are capped at `maxRank`, and the name is re-validated. But `currency` and the counters accept any integer up to 1e308. A currency of 1e308 renders as a 411-character label, and an overflow to Infinity resets the save. Unknown keys are kept, though nothing reads them. | S-5 | fix: `Number.isSafeInteger` plus a ceiling. Accept the unknown keys. | [#316](https://github.com/danhquach/crimsononslaught/issues/316) |
| 5.6 | Two tabs | The last writer wins, so progress banked in the other tab is lost. Nothing is duplicated. | S-5 | accept: single-player | — |

---

## Follow-up tickets

The ten proposed fixes were merged into four tickets by area (2026-09-28).

| Ticket | Sev | Summary | Rows |
|---|---|---|---|
| CO-187 [#314](https://github.com/danhquach/crimsononslaught/issues/314) | S-3 | Repo and CI settings: require the CI check on `main`, merge without the admin bypass, turn on Dependabot, pin actions by SHA, ignore `settings.local.json` | 2.4, 2.6, 2.7, 3.1 |
| CO-188 [#315](https://github.com/danhquach/crimsononslaught/issues/315) | S-3 | Gameplay: diminishing returns on boss crowd control, decide the outcome at the killing blow, no offers at a clamp, no collection while dead | 4.2, 4.3, 4.5, 4.6 |
| CO-189 [#316](https://github.com/danhquach/crimsononslaught/issues/316) | S-4 | Boot, save and page: DEV-gate the test switches (option A), build-time CSP meta, tell the player when a save fails, clamp edge values | 1.1, 1.2, 1.3, 1.5, 5.4, 5.5 |
| CO-190 [#317](https://github.com/danhquach/crimsononslaught/issues/317) | S-4 | Strip C2PA and EXIF provenance from `docs/art/sheets/` | 3.6 |
