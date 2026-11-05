# Version selection homepage

Development only. Do not merge or deploy until the owner approves.

- `/` selects between Classic 1.0 and Modern Basic English 2.0.
- `/?version=classic` opens the original classic overview. Classic navigation uses an allowlisted `page` query, with browser Back/Forward support.
- All `/ogden/...` paths, queries and fragment IDs stay unchanged. Modern pages link back to `/` and directly to the classic overview.
- Successful normal sign-in/registration returns to `/`; mandatory temporary-password changes still take priority. `/?login=1` opens the existing sign-in dialog without accepting an arbitrary redirect URL.
- Account, lifetime membership, trial expiry, administrator checks and server-side publication gates remain the existing implementation. Choosing a version neither purchases access nor writes learning progress.
- Both progress systems retain their own IDs and tables. No curriculum, database migration, pricing, environment variables or payment flags change.

Mobile evidence: the existing Android Chromium/iPhone WebKit CI job includes `tests/mobile/version-selection.spec.ts`; screenshots are uploaded in its `learning-v2-mobile-results` artifact as `ui-previews/version-selector-*.png`. Automated browsers do not replace physical device testing. Any local static preview uses synthetic catalog/session responses and is not a production screenshot.

Risks for a later approved release: `/` changes from the classic overview to a version chooser; saved root bookmarks now show the chooser. Existing modern deep links remain stable. Existing auth redirects, forced password changes, navigation history and 320px layout are covered by regression tests. Review both mobile screenshots before approving deployment.
