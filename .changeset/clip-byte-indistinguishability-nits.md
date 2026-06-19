---
'@glissade/core': patch
---

clip: close three byte-indistinguishability nits so emitted `Track[]` stays deep-equal to hand-authored `track()` on currently-unread fields:

- carry a key's `from` (`'live'`, §4.7) flag through `compileChannel` instead of dropping it;
- drop `derived` on a key whose value an override REPLACED (an overridden value is no longer builder-derived; un-overridden keys keep the flag);
- reject an ambiguous single-key override (`from` on a 1-key channel, or `from`+`to` both targeting the one key) with a `ClipError` naming the channel, rather than silently dropping a value.

Goldens unaffected (these touch unread fields / a throw path).
