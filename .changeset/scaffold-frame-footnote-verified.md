---
"@glissade/cli": patch
---

`gs scaffold --frame` — emit `footnote.verified` as a string TODO placeholder (`"TODO: e.g. verified June 2026"`), not a boolean. The verified field is the footnote card's dated caption line (a string), not an is-verified flag; the boolean tripped a type error against a real episode frame's `footnote.verified: string`. Verified against the real makeEpisode handle at the v3 cut-1 gate.
