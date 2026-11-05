# Historical comparison fixtures

Repository baseline: `6c5afeb60c1d3e05c36cea1b99bf6046bd73ddfa` (main at investigation).

`production-classic.js` copies `public/playback.js`; `production-modern.js` copies `public/ogden/speech.js` from that baseline. They intentionally retain the old filtering and cancellation behavior so the same-device differential is reproducible. These test-only fixtures are not served or imported by either application. Their names do not establish the currently deployed SHA or the actual voice selected by a real phone. The differential verifies a code-level mechanism, not a real-device recording.
