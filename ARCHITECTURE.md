# Live Strudel

## One musical document

Only `{ version: 3, document: string }` is shared. Local persistence stores the document text. There are no saved tracks, notes, instrument presets, gains, mute flags, or duplicate tempo fields. No older project formats are supported.

`document.js` parses the document with Acorn. Pattern rows refer to source ranges of top-level Strudel labels (`$:`, named labels, and native muted labels), or a bare pattern expression. They are views, not musical entities. A row can contain many sounds or a `stack()`.

## Source editing

The document editor, piano roll, volume, mute, deletion, and recording use one undo history. Copy and Share use the document verbatim; no exporter or runtime wrapper is involved.

The document editor is the native `StrudelMirror` from `@strudel/codemirror`, including its REPL, live mini-notation highlighting, evaluation flash, documentation, autocomplete and visual/slider widgets. It lives inside the same sandbox as audio. `native-editor.js` adds only document synchronization, shared-undo shortcuts and registry completion; `document-editor.js` is a parent-side bridge, not a custom CodeMirror instance. The pinned upstream version leaves sound/bank providers unconnected, so `sound-completion.js` supplies those two contexts from the actual player registry; other contexts use the upstream extension unchanged. There is no hand-maintained sound dictionary or second Strudel REPL. Creating the editor never evaluates the document (`autodraw:false`).

Syntax errors preserve the last valid source view and its notes, disable visual edits against stale source ranges, and display diagnostics in a reserved-height area. Incomplete typing must not collapse the workspace or move the keyboard panel.

The piano roll explicitly shows the input to a selected literal `note()` or `s()` expression, before transforms. Its literal events are queried using Strudel, then repeated across a temporary 1/2/4/8-cycle editing view. Changing the view never changes the document, playback or undo history. A single literal .slow(1|2|4|8) on that expression supplies the source-backed length. Edits are normalized to mini notation, queried again to check equivalence, and written back. Editing a particular repetition materializes the complete viewed phrase, preserving the other repetitions. A smaller view preserves all off-screen notes from the underlying phrase; clear/delete affects only visible notes. There is no extend-with-silence operation. Shared outer stack transforms and dynamic or compound slow calls are not treated as editable length. Note edits replace the string literal and, only when the edit needs a longer phrase, update or insert its native .slow() call. Comments, effects, shared declarations, sibling expressions, and transforms remain unchanged. Repetitions within the literal can be expanded or compressed; occurrences produced by outer transforms all change together.

Arbitrary Strudel is playable, but not arbitrarily invertible. Dynamic mini notation, shared-variable expressions, and shadowed pattern factories are code-only. Recording is restricted to direct literals without timing transforms other than their editable length, or global `all()`/`each()`; it never guesses an inverse transformation. Recorded notes span the selected editing view, preserve existing repetitions and off-screen notes, align to the next phrase/view boundary when already playing, and use the selected per-cycle grid. Note lengths are mini-notation weights, not synthesized envelopes.

## Playback

`player.js` uses the native StrudelMirror-owned REPL, with shared modular `@strudel/core`, `@strudel/webaudio`, tonal, mini, transpiler and draw packages (no bundled `@strudel/web` or second REPL), to evaluate the entire document once, including shared declarations, labels, `stack`, `all`, and `each`. It uses one Strudel scheduler and audio context. Derived event queries power the playing-pattern overview. Playback values are cloned before audio output because the native sound engine may mutate them.

The current text and last successfully applied text are distinguished. Typing does not run code. A failed evaluation does not replace the playing pattern or commit its staged tempo/sound registry. JavaScript side effects are not generally transactional; Reset player creates a fresh runtime if custom code modifies global runtime state.

Keyboard audition uses native registered Strudel sounds and their stop handles, never a separate synthesizer. The audition sound is an explicit temporary choice; it is not a second saved instrument model and does not claim to reproduce every effect in an arbitrary expression.

While playback is stopped, adding a piano-roll note or clicking an existing note auditions a short, bounded native sound without starting the scheduler. Piano-roll previews are suppressed during playback. Shift-click only selects. Like keyboard audition, this previews the registered sound, not arbitrary document effects.

Pattern names are native source labels such as `drums: s("bd*4")`, not project metadata. The sidebar and overview derive names from those labels; renaming replaces only the label and preserves native mute. UI names must be unique and avoid Strudel's special anonymous, mute and solo prefixes. Anonymous pasted `$:` patterns remain supported with numbered display fallbacks.

The runtime baseline includes native synths plus Strudel's standard sample maps (piano, VCSL, tidal drum machines, uzu drums/wavetables, mridangam, and the default Dirt extras) and drum-bank aliases. `default-sounds.js` loads these from Strudel's CDN at startup, like the main site; audio files are fetched on demand, not pre-downloaded. Default sounds need no document setup. Failed map loads report a connectivity warning and retry on Apply/Play. Custom libraries can still be added with `samples(...)` in the document. Sound pickers and autocomplete reflect the actual registry. This baseline is part of the runtime environment, not a separate musical project model. Runtime dependencies are pinned by the package lock.

## Temporary editor state

Pattern selection, note selection, view range, grid, octave, audition sound, scale highlighting, transient solo, metronome, and count-in are not saved music. Mute uses Strudel labels; gain and tempo edit Strudel calls. The metronome and count-in are temporary Strudel patterns on the same scheduler. Scale highlighting queries Strudel's scale implementation and never blocks a key.

## Isolation and sharing

`player.html` runs in an iframe with `sandbox="allow-scripts"`, without same-origin, popup, form, or navigation privileges. The outer app and native editor exchange document edits, control actions and playback/query messages over a private MessageChannel. User code can access the native editor and visual DOM inside that frame, but cannot access the parent app DOM or local storage. Loading either local or shared text never evaluates it; only Apply/Play and intentional edits to an already-running document do.

The sandbox allows HTTPS networking for user sample libraries and modules. It is not a network firewall or a CPU/memory quota: do not treat arbitrary shared JavaScript as harmless. Reset player discards the iframe. The app intentionally has no trust modal or automatic shared-code execution.

GitHub Pages serves both HTML entry points and module assets with CORS; development and preview servers enable CORS for the opaque-origin player. Keep `player.html` in the production build.

## Verification

- `npm test`: syntax-aware edits, native mini-notation equivalence, source-only schema, and share links.
- `npm run test:browser`: native playback, shared scope, tempo rollback, edits/undo, nested expressions, recording, scale guide, mute/solo, isolation, sharing, mobile layout, native animated highlighting, canvas widgets, source-backed sliders and editor reset. Set `TEST_URL` to test a preview build.
- CI builds both entry points and runs the browser suite before Pages deployment.
