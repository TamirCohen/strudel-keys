# Live Strudel

A browser-based Strudel workspace with live code, recording, a piano roll, and a colored all-tracks timeline.

## Run locally

Requires Node.js 22.15 or newer. Run `npm ci`, then `npm run dev` and open the printed local URL. Click **Audio** to enable playback. Drum samples require internet access. Projects autosave in this browser; **Save** downloads a portable JSON backup.

## One musical source

Every track stores Strudel code—not a second editable note array or an edit log. For supported repeating patterns, adding, moving, resizing, deleting, quantizing, or recording rewrites the current notes as compact native mini-notation. Shared sounds, banks, effects, and volume are factored out once. No UUIDs, JSON payloads, or accumulating filter callbacks appear in generated code. Undo history stays outside Strudel.

Use **Simplify** beside Run track to clean up older generated edit wrappers. It preserves the current audible notes and effects, including genuine added notes; it does not guess that additions should be deleted. Simplification can be undone. The app recompiles generated code and checks the resulting notes and controls before applying it.

Playback, metronome, count-in, recording timestamps, and playheads use the same Strudel scheduler. Project tempo is stored as `setcpm(...)`; a tempo command applied from a track updates that shared tempo. One cycle is four beats. The loop selector controls the editor/recording span; it does not truncate arbitrary live-code patterns.

Each track has its own code scope. For example, `$: s("bd*4, [~ cp]*2").bank("RolandTR909")`, or `$: note("c3 e3 g3 b3").s("sawtooth").lpf(1200).room(.2)`. **Run track** applies code and auditions it when stopped. **Play** starts the full mix. Cmd/Ctrl+Enter runs the selected code.

The per-track volume sliders write a `postgain(...)` transform into Strudel. Mute and Solo select which track patterns enter the mix and export. **All tracks** shows colored, stacked timelines; click one to select its editor.

## Editing and recording

- **Add track** opens a sound picker. Mute, Solo, and Delete use full labels.
- Click an empty note lane to add a note; drag to move; drag its right-edge handle to make a pitched note longer or shorter (Alt-drag also works).
- Select a note and use **Delete note**, Delete, Backspace, or right-click. **Clear** clears the selected track; **Remove all** removes every track.
- Cmd/Ctrl+Z undoes project edits and recorded takes. In the code textarea it uses normal text undo; the Undo button always acts on the project.
- Drum keys: A S D F G H J K. Synth keys: A W S E D F T G Y H U J K. Z/X changes octave. Physical key positions work across keyboard languages.
- Space starts/stops playback outside form fields. Shift+R records. Count-in is one bar when enabled. Hold synth keys for sustained notes; recording overdubs the selected track.
- Quantize uses the selected grid. The original code remains available through undo. Time-varying patterns refresh their projected notes as playback advances.

Project export includes native Strudel banks and synths, isolated track transforms, and the shared tempo. Included sample maps are RolandTR909 and BossDR660, plus Roland/tr909 aliases. Additional sample collections can be loaded with `samples()`. This is the actual Strudel runtime, not every sample collection preloaded on strudel.cc. Code executes JavaScript in this page: only run code you trust.

## Sounds and limitations

Drum samples stream from the pinned tidal-drum-machines URLs listed in `public/samples.json`; see `public/credits.html`. Immediate keyboard monitoring uses the shared AudioContext with a lightweight instrument preview; its synth envelope may differ from a track's Strudel effects. Playback itself runs the Strudel pattern.

Note rewriting supports a conservative subset of static native patterns and controls. Randomness, alternation, custom callbacks, unknown effects, and patterns whose repeat exceeds the editor span remain playable/editable as code, but visual rewrites and recording into them are rejected with an explanation. They are never silently flattened into a loop. Exact off-grid recordings may need readable timecat/slow/late expressions rather than mini-notation. Input latency depends on browser, hardware, and keyboard rollover. Held recordings are capped to the editor span. Switching tabs stops transport.

## Checks

Run `npm test` and `npm run build`. For browser regression tests, install Chromium with `npx playwright install chromium`, leave the dev server running, then run `node tests/browser.mjs`.

Tests cover canonical state and legacy migration, repeated-pattern export, note/effect editing, undo, recording, non-English keyboard input, volume/code synchronization, shared metronome timing, clap identity during playback, persistence, and narrow-screen layout.

## Personal GitHub

The configured repository is **TamirCohen/strudel-keys**. Use the dedicated personal SSH identity configured in this repository; do not use a work-account identity. The existing GitHub Actions workflow handles Pages deployment when changes are pushed. Local development does not publish automatically.
