---
'@glissade/cli': patch
---

`gs render --frame N --out foo.png` now writes that single PNG file at the path, instead of creating a directory `foo.png/` containing `frame-0000N.png` + caption sidecars. A single frame to a `*.png` `--out` is a still; rendering into a directory still works with a directory `--out`. Reported downstream.
