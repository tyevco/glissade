---
"@glissade/core": patch
---

`Expr`: fail loud on non-finite results + accept lowercase constants

Two papercuts from the 0.40 evaluator review (edcc + ai-training):

- **Non-finite results now fail loud.** A formula that evaluates to `NaN` (`0/0`, `sqrt` of a negative) or `±Infinity` (`1/0`) used to coerce silently to `null` at the bound prop — a gap in an otherwise strictly fail-loud evaluator. Sampling such a formula now throws `ExprError` naming the formula and the `t` at which it blew up, so a broken expression surfaces immediately instead of a silently-missing animation. The guard fires per-sample, so a formula that is finite everywhere except one `t` still samples normally elsewhere.
- **Lowercase constant aliases.** `pi`, `tau`, and `e` now resolve to the same values as `PI`/`TAU`/`E` (they used to throw `unknown variable`), so a copy-pasted lowercase formula just works. Scientific-notation numbers (`1e3`) are unaffected. `EXPR_CONSTANTS` still advertises only the canonical uppercase names.
