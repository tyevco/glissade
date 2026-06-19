---
'@glissade/export-web': patch
---

Remove the test-only `cachedFrameCount()` accessor from the
`MediabunnyVideoFrameSource` public API. The decoded-frame count is now exposed
to tests through a module-private `__cachedFrameCount` helper (not re-exported),
so the lookahead/eviction bound stays assertable without a public class method.
