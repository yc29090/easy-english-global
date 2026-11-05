# Android English speech compatibility fix

Development and tests only. This PR must not be merged or deployed without a later release authorization.

## Cause and scope

The published 2.0 player accepted only `en-US` with `localService === true`. Android Chrome can expose usable English voices as online or omit that flag; it can initially return an empty list. The old event handler merely asked for another click instead of resuming the already requested playback.

The native Web Speech player now explicitly selects English only: en-US, then en-GB/en-AU/en-CA/en-NZ and other English locales. Within a locale it prefers local voices. A missing localService flag is not a reason to reject English; browser-provided online English is identified honestly. No new TTS endpoint, API key, paid SDK or resource is introduced. Browser online voices can send the selected curriculum text to their browser/system provider; the visible notice and privacy page explain this. User drafts, passwords and recordings are not read or uploaded by this feature. Dictionary phonemes remain the American teaching reference and do not control the selected voice's accent.

An explicit user click owns the pending request. voiceschanged or bounded 200ms polling can resume it; discovery times out at 6 seconds. Stop, pagehide and backgrounding invalidate pending callbacks. An active cancel gets 120ms to settle, including rapid subsequent clicks. onstart is required before saying “playing”; start failure is bounded at 8 seconds, completion has its own watchdog, and errors try at most 3 explicitly English voices. Permission/cancellation failures do not silently retry. Repetition waits for a confirmed end plus 1.8 seconds and retains the chosen slow/normal setting.

## Slow playback and evidence limits

Actual utterance.rate is set to 1 or 0.55, not merely a button label. If the same voice/text has already completed a normal playback in this page, the player compares start/end event durations. A slow duration near the normal duration warns that the engine may have ignored rate and stops repetition. These timings are a diagnostic, not an acoustic measurement or pronunciation score. Without a paired normal sample the player cannot prove that the engine honors rate. There is no browser API that forces every installed TTS engine to respect a requested rate.

Unit tests exercise delayed/missing voice events, English fallback, remote/missing source flags, Chinese rejection, pause/cancel, repeat, errors and measured duration warnings. Mobile compatibility tests use **explicit API and SpeechSynthesis shims**, on Android Chromium/iPhone WebKit/iPhone-size Chromium. They validate routing of voice/lang/rate and error states; they do not prove that a real Android phone emits sound or slows it.

## Required Android device acceptance (NOT RUN by automation)

Use a later approved test build; the current production website remains unchanged during this PR. Test Android Chrome and the device's default browser separately. No microphone permission is required for speech playback.

1. Record device, Android/browser versions and the selected voice name/language/local-or-online label. Use the same word and a full short sentence.
2. Tap normal playback. Require audible English and a start confirmation, not just an enabled button. With only another English locale, require audible English plus the correct fallback label.
3. Play that same sentence normally to completion, then slowly. Repeat comparisons three times. Require clearly slower speech and a longer duration. If unchanged, mark slow playback FAIL, even if automated rate tests passed. Record any “cannot confirm slower” warning.
4. Tap repeat after slow. Require the same selected slow setting, a gap between completions, and no overlapping voices. Stop must prevent later repeats; rapidly switch normal/slow/stop and check that only the newest request runs.
5. Navigate away or put the browser in the background while loading/playing; no delayed speech may start after Stop/navigation. Return and start with a fresh click.
6. If English is genuinely unavailable or the speech provider fails, require a truthful loading/failure message and no Chinese/default-language reading. Online voices can require connectivity; no silent site-paid TTS fallback is permitted.

For a failure, provide only the displayed error, voice label, device/browser version and normal/slow observed durations. Do not send passwords, cookies or connection strings. Keep this acceptance NOT_RUN until a human actually performs it.

No curriculum, account, membership, payment, database migration or saved progress changes are part of this fix. Historical reports describing the previous local-US-only policy are retained as historical evidence; the new visible policy above supersedes it for this PR.
