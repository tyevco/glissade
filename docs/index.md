---
layout: home
hero:
  name: glissade
  text: glide & slide
  tagline: Programmatic motion graphics for TypeScript — realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.
  actions:
    - theme: brand
      text: Getting started
      link: /getting-started
    - theme: alt
      text: The reel
      link: /showcase.html
    - theme: alt
      text: Live showcase
      link: https://tyevco.github.io/glissade/demo/app/
    - theme: alt
      text: GitHub
      link: https://github.com/tyevco/glissade
features:
  - title: A pure function of time
    details: evaluate(scene, timeline, t) — the builder compiles to a serializable keyframe document, so any t samples in O(log keys). Scrub backward for free; render byte-identical frames in CI.
  - title: Export everywhere
    details: gs render on headless Skia (no browser), WebCodecs in the browser faster than realtime, sample-accurate audio on both paths — all from the same scene code.
  - title: Interactive, still deterministic
    details: v2 state machines drive the same timelines with velocity-matched interruptions — then record a session, replay it bit-exactly, and bake it to plain keyframes for export.
  - title: Springs done right
    details: Closed-form damped oscillators, never integrators — seek-safe at any t, velocity-matched retargeting when input interrupts mid-flight.
---
