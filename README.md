# Keylab

A frontend-only QWERTY music recorder for TamirCohen. Play drum kits and synthesizers, record layered loops, edit MIDI-style note lanes, quantize timing, and copy a playable Strudel pattern.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open the printed URL **on the same machine**, or forward port 5173 when working remotely. Click **Enable audio** to preload both drum kits. Sample loading needs internet access. No backend or sign-in is used. Projects autosave in this browser; use **Save project** for a portable JSON file.

## Playing and recording

- Drums: **A S D F G H J K** = kick, snare, closed hat, open hat, clap, low tom, high tom, crash.
- Synth: **A W S E D F T G Y H U J K** plays a chromatic octave. Hold keys to sustain; play multiple keys for chords. **Z / X** lower or raise the octave.
- **Space** starts/stops playback when focus is outside a form control. **Shift+R** starts/stops recording. Recording uses a one-bar count-in by default and overdubs the selected track on each loop.
- Add a track to layer a synth or another drum kit over your existing recording. Stop before selecting another track. Sound changes between drums and synths create a new track if the current one contains notes.
- Click a note lane to add a note. Drag notes to move, **Alt+drag** synth notes to resize, right-click or use Delete/Backspace on a focused note to remove.
- Quantize affects only the selected track. Choose 1/4, 1/8, 1/16, 1/32 or eighth-note triplets. Undo restores original timing. Quantization wraps a hit near the loop end to the first beat.
- Mute and solo apply to playback and Strudel export.
- Copy the generated code into https://strudel.cc/ and run it. Export preserves timing and note durations with `timecat`, `slow`, and `late`; it also preserves overlapping notes and notes crossing a loop boundary. Drum tails play naturally.

## Sounds

Drums use pinned sample URLs from [tidal-drum-machines](https://github.com/geikha/tidal-drum-machines), the collection used by Strudel. The TR-909 kit uses RolandTR909 samples; the acoustic-style kit uses Boss DR-660 Real samples plus its clap and crash. Samples stream from the upstream repository; they are not redistributed in the build. See `public/credits.html`.

The Web Audio synths provide sawtooth, three-voice supersaw, sine, square and triangle. Exported synth tones can differ in envelope and processing from the local instrument. Input timing depends on the browser, audio hardware and keyboard rollover; this is not hardware MIDI recording. Held notes are limited to one loop length. Switching tabs stops the transport to avoid background timer throttling.

## GitHub Pages — personal account only

The intended repository is **TamirCohen/strudel-keys**. Nothing should be created or pushed using the work account. The local repository's SSH command selects only the dedicated personal key and disables SSH-agent identities. Its pre-push hook verifies the remote and authenticated GitHub username before allowing a push. The Pages workflow is restricted to owner `TamirCohen`.

1. While logged in as **TamirCohen**, add `/home/ubuntu/.ssh/id_ed25519_tamircohen_keylab.pub` at https://github.com/settings/ssh/new. This key was generated on the remote development machine, not your laptop. Never upload the private key.
2. Create an empty public repository named **strudel-keys** at https://github.com/new, owned by **TamirCohen**. SSH keys authorize Git pushes but cannot create repositories or configure Pages through GitHub's API.
3. Push this local repository to its configured personal remote: `git push -u origin main`.
4. In that repository's Settings → Pages, choose **GitHub Actions** as the source. Run/re-run the **Deploy Keylab to GitHub Pages** workflow if necessary.

The expected address after successful deployment is https://tamircohen.github.io/strudel-keys/ . It is not live until the workflow succeeds.

## Checks

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run dev
# In another terminal:
node tests/browser.mjs
```

Unit tests cover quantization, import validation, track audibility, and generated patterns queried through Strudel's actual pattern engine. The browser smoke test covers remote sample decoding, recording, held chords, playback, quantization/undo, persistence, export, a feature-detected read-only WebMCP tool and narrow-screen layout. The production app has no JavaScript runtime dependencies. Strudel is a dev-only dependency used to validate exports.
