# Publishing to itch.io

The itch.io build is the same production build as the GitHub Pages one, zipped
with `index.html` at the root (#422). itch.io serves it in an iframe on its own
domain.

## Build the zip

1. Copy `.env.example` to `.env` and set `VITE_FEEDBACK_ACCESS_KEY` (never
   commit `.env`). The key is baked into the bundle at build time. **A zip built
   without it has no feedback form** on the Help screen; the script warns loudly
   but still builds.
2. `npm run package:itch`

It runs `npm run build`, zips the contents of `dist/` into
`dist-itch/crimson-onslaught-<version>-web.zip` (git-ignored) and checks what
itch.io limits for an HTML upload: `index.html` at the zip root, fewer than 1000
files, and under 500 MB zipped and unpacked. It needs the `zip` and `unzip` commands and clears `dist-itch/` first. It
prints the path, file count and size, never the key.

## Page settings on itch.io

- Kind of project: **HTML**; upload the zip and tick **This file will be played in the browser**.
- Viewport: **960 x 540**.
- **Fullscreen button**: on.
- **Mobile friendly**: off (there are no touch controls).
- **Automatically start on page load**: off. The player's click also unlocks audio.
- **Scrollbars**: off.

## Saves

Progress lives in `localStorage` under the key `co.save.v1`, inside the itch.io
iframe's origin. It is separate from the GitHub Pages build's save, so a player
who moves between the two starts over. Clearing the browser's site data for
itch.io clears it. If a browser blocks storage for third-party frames, the game
still plays and says on the Result screen that progress is not kept.

## Browsers

`npm run test:itch` plays a full walk of the game (Help and the feedback form,
a run, End run, Result) in a cross-origin iframe, checks that the run is saved,
reloads, and checks the save is read back, with no CSP violation and no console
error. The host page is on `127.0.0.1` and the game on `localhost`, so the game's
storage is third-party, as on itch.io. The walk ends the run with End run and does not
reach the boss; the manual smoke check below covers that.

| Browser                 | How checked                    | Result |
| ----------------------- | ------------------------------ | ------ |
| Chromium (Chrome, Edge) | `npm run test:itch`, automated | Passes (2026-10-04) |
| Firefox                 | `npm run test:itch`, automated | Passes (2026-10-04) |
| WebKit                  | `npm run test:itch`, automated | Passes (2026-10-04); storage in the third-party frame persists |
| Safari (macOS, iOS)     | Manual, by the PM              | Not yet checked |

Playwright's WebKit reports its own screenshot `<style>` element as a CSP
violation; the spec ignores exactly that, and only in WebKit. A control at the end of
the spec triggers one real violation in the frame, so a listener that stopped
firing would fail the test.

Playwright's WebKit is not Safari: it does not apply Intelligent Tracking
Prevention, which can partition or clear a third-party frame's storage. The Safari
row needs a real check: play a run on the itch.io page, reload, and see whether
the Profile screen still shows the run.

## AI-generated content

Say so on the itch.io page (the AI disclosure field):

- **Art**: AI-generated (sprites, backgrounds, menu art, icons), then cut, cleaned
  and arranged by hand and by script. The prompts are recorded in
  `docs/art/prompts/`.
- **Audio**: not AI-generated. Most sound effects and all five music loops are
  synthesized by scripts in this repository (`scripts/gen-audio.mjs`); four
  effects are CC0 recordings from SFXMint (`public/assets/audio/CREDITS.md`).
- **Code**: written with an AI assistant's help.

## Licences

- The game: MIT (`LICENSE`).
- Phaser 3: MIT, bundled in the build.
- The menu row-label font, Grenze Gotisch: SIL Open Font License 1.1
  (`public/assets/fonts/OFL.txt`), shipped in the zip. The title itself is a painted image.
- Four sound effects: CC0 1.0 from SFXMint.

## Upload with butler

The page is `<itch-user>/crimson-onslaught` (the account that owns the page), channel `html5`. After
`npm run package:itch`:

```sh
butler push dist-itch/crimson-onslaught-<version>-web.zip <itch-user>/crimson-onslaught:html5 --userversion <version>
```

`butler` is itch.io's command-line uploader. Sign in once on the publisher's
machine with `butler login`; never commit credentials. A CI upload would use a
`BUTLER_API_KEY` secret, which is not set up. Uploading by hand through the
page's Uploads section also works.

## Smoke check

1. After the first upload, set the page settings above and save the page as **Draft**.
2. Open the draft page and check:
   - The game fills the 960 x 540 frame and the fullscreen button works.
   - The title screen draws in the menu font and music starts after the first click.
   - Help, About: the **Send feedback** form is there and a test message sent from
     this real page arrives. `npm run test:itch` only proves the request leaves the
     iframe, not that the endpoint accepts itch.io's origin; if the form key has an
     allowed-domains setting, it must include itch.io's frame host (`*.itch.zone`).
   - A short run plays, ends and shows the Result screen.
   - A full run reaches the boss (20:00); kill it or die to it, and the Result screen
     shows. The automated walk does not cover this, as the built page ignores `?startAt=`.
   - In real Safari (macOS), repeat a run, reload, and check Profile still shows it;
     record the result in the Safari row of the Browsers table.
   - Reload the page: Profile still shows the run.
   - The browser console shows no errors or CSP violations.
3. Set the project to **Public**.
