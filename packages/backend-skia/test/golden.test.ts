/**
 * Golden-frame harness (DESIGN.md §7.3 tier 2): frame N is a pure function of
 * the document, so rasterized PNGs byte-compare on a pinned toolchain.
 * Update goldens intentionally with: GOLDEN_UPDATE=1 pnpm vitest run
 */

import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GlobalFonts } from '@napi-rs/canvas';
import { evaluate, type DisplayList, type SceneModule } from '@glissade/scene';
import { diffDisplayLists, formatDisplayDiff } from '@glissade/scene/diagnostics';
import { SkiaBackend } from '../src/index.js';
import goldenShapes from '../../examples/src/scenes/golden-shapes.js';
import goldenBounce from '../../examples/src/scenes/golden-bounce.js';
import goldenTypography from '../../examples/src/scenes/golden-typography.js';
import goldenLayout from '../../examples/src/scenes/golden-layout.js';
import goldenFilters from '../../examples/src/scenes/golden-filters.js';
import goldenPaths from '../../examples/src/scenes/golden-paths.js';
import goldenCaptions from '../../examples/src/scenes/golden-captions.js';
import goldenCaptionsPortrait from '../../examples/src/scenes/golden-captions-portrait.js';
import goldenCaptionsLong from '../../examples/src/scenes/golden-captions-long.js';
import goldenCaptionsSplit from '../../examples/src/scenes/golden-captions-split.js';
import goldenCaptionSplitBand from '../../examples/src/scenes/golden-caption-split-band.js';
import goldenCaption from '../../examples/src/scenes/golden-caption.js';
import goldenMarker from '../../examples/src/scenes/golden-marker.js';
import goldenTypewriter from '../../examples/src/scenes/golden-typewriter.js';
import goldenMotionPath from '../../examples/src/scenes/golden-motionpath.js';
import goldenOrient from '../../examples/src/scenes/golden-orient.js';
import goldenEcho from '../../examples/src/scenes/golden-echo.js';
import goldenMotionBlur from '../../examples/src/scenes/golden-motionblur.js';
import goldenCamera from '../../examples/src/scenes/golden-camera.js';
import goldenCameraFrame from '../../examples/src/scenes/golden-camera-frame.js';
import goldenChart from '../../examples/src/scenes/golden-chart.js';
import goldenGauge from '../../examples/src/scenes/golden-gauge.js';
import goldenExpr from '../../examples/src/scenes/golden-expr.js';
import goldenCompositing from '../../examples/src/scenes/golden-compositing.js';
import goldenBoxText from '../../examples/src/scenes/golden-boxtext.js';
import goldenComponent from '../../examples/src/scenes/golden-component.js';
import goldenMotionPathMorph from '../../examples/src/scenes/golden-motionpath-morph.js';
import goldenSketch from '../../examples/src/scenes/golden-sketch.js';
import goldenSketchHachure from '../../examples/src/scenes/golden-sketch-hachure.js';
import goldenWhiteboard from '../../examples/src/scenes/golden-whiteboard.js';
import goldenSvg from '../../examples/src/scenes/golden-svg.js';
import goldenSketchDrawon from '../../examples/src/scenes/golden-sketch-drawon.js';
import goldenPathDrawon from '../../examples/src/scenes/golden-path-drawon.js';
import goldenCache from '../../examples/src/scenes/golden-cache.js';
import goldenGradient from '../../examples/src/scenes/golden-gradient.js';
import goldenGradientSmooth from '../../examples/src/scenes/golden-gradient-smooth.js';
import goldenMesh from '../../examples/src/scenes/golden-mesh.js';
import goldenFontInstanced from '../../examples/src/scenes/golden-font-instanced.js';
import goldenVariableFont from '../../examples/src/scenes/golden-variable-font.js';
import goldenFontAxisAnim from '../../examples/src/scenes/golden-font-axis-anim.js';
import goldenLetterSpacing from '../../examples/src/scenes/golden-letter-spacing.js';
import goldenWoff2 from '../../examples/src/scenes/golden-woff2.js';
import { ingestFont } from '@glissade/core/font-ingest';
import goldenMorph from '../../examples/src/scenes/golden-morph.js';
import goldenPresence from '../../examples/src/scenes/golden-presence.js';
import goldenEach from '../../examples/src/scenes/golden-each.js';
import goldenSplitText, { setSplitMeasurer } from '../../examples/src/scenes/golden-splittext.js';
import goldenKinetic, { setKineticMeasurer } from '../../examples/src/scenes/golden-kinetic.js';
import goldenParticles from '../../examples/src/scenes/golden-particles.js';
import goldenKenBurns from '../../examples/src/scenes/golden-kenburns.js';
import { loadYogaLayoutEngine } from '../../scene/src/layout.js';

await loadYogaLayoutEngine(); // flexbox scenes need the engine before evaluation

// explicit fonts (§3.6): the typography scene's face ships with the repo
GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)),
  'DejaVu Sans',
);
// 0.12 instanced variable face (§3.6): the committed STATIC sfnt was produced by
// the font front door (ingestFont at a fixed wght:600 axis tuple). It's now an
// ordinary static face, so Skia loads it byte-stably like any other.
GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../../examples/assets/fonts/Inconsolata-wght600.ttf', import.meta.url)),
  'Inconsolata Semibold',
);
// 0.20 LIVE variable face (§3.6): the REAL Inconsolata-Variable.ttf, registered
// un-instanced so the golden-variable-font scene drives its `wght` axis at
// raster time via `fontVariationSettings` (Skia/@napi-rs/canvas applies it).
GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../../examples/assets/fonts/Inconsolata-Variable.ttf', import.meta.url)),
  'Inconsolata Variable',
);
// 0.13 woff2-decoded face (§3.6, DsW-aD_OUMoV item 1): the committed woff2 is
// DECODED ONCE at ingest time (sniff woff2 → fontverter → static sfnt) by the
// font front door. The decoded sfnt BYTES are registered with Skia directly —
// proving the decode path is byte-stable end to end through the rasterizer.
const woff2Path = fileURLToPath(new URL('../../examples/assets/fonts/Inconsolata-wght600.woff2', import.meta.url));
const woff2Face = await ingestFont({ family: 'Inconsolata WOFF2', src: woff2Path });
GlobalFonts.register(Buffer.from(woff2Face.bytes), 'Inconsolata WOFF2');

// o_aLYFFPjFDf: splitText() snapshots part geometry at BUILD time — before the
// per-scene setTextMeasurer() below — so thread a REAL Skia measurer into the
// splittext scene's splitText() calls. Without it the parts use the rough
// per-character estimate (cumulative drift). The fonts above are registered, so
// a bare SkiaBackend measures with the exact metrics the golden frames draw.
setSplitMeasurer(new SkiaBackend(8, 8));
// 0.56 kinetic type presets: revealWords/revealLines call splitText() at BUILD
// time too, so thread the same real Skia measurer (typeOn needs none).
setKineticMeasurer(new SkiaBackend(8, 8));

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const UPDATE = process.env['GOLDEN_UPDATE'] === '1';

/**
 * Byte-compare a rendered frame against its committed golden PNG and, on a
 * mismatch, ATTACH a DisplayList-level explanation to the thrown error (§3.3
 * gs-diff substrate). The golden is a PNG, so the actionable IR delta is the
 * purity/determinism contract: a fresh-scene re-evaluation of the same frame
 * must produce a byte-identical DisplayList. If that self-diff is non-empty,
 * the frame diverged because the scene isn't a pure function of time, and the
 * command tree names exactly which op/field moved — far better than "PNG
 * differs". (An identical IR but differing PNG points at the rasterizer /
 * toolchain instead, which the message says.)
 */
function assertFrameMatches(args: {
  name: string;
  frame: number;
  actual: Buffer;
  goldenPath: string;
  coldDisplayList: () => DisplayList;
  warmDisplayList: () => DisplayList;
}): void {
  const { name, frame, actual, goldenPath } = args;
  const golden = readFileSync(goldenPath);
  if (actual.equals(golden)) return;

  const diff = diffDisplayLists(args.warmDisplayList(), args.coldDisplayList());
  const irExplanation = diff.equal
    ? 'DisplayList IR is identical across a fresh re-evaluation — the divergence is in the rasterizer/toolchain, not the scene.'
    : `DisplayList IR diverged on a fresh re-evaluation (scene is not a pure function of time):\n${formatDisplayDiff(diff)}`;
  throw new Error(
    `golden ${name} frame ${frame} diverged from ${goldenPath}; ` +
      'if intentional, re-run with GOLDEN_UPDATE=1.\n' +
      irExplanation,
  );
}

const FRAMES = [0, 30, 60, 90, 120, 150, 179];
const FPS = 60;

const CORPUS: { name: string; mod: SceneModule }[] = [
  { name: 'shapes', mod: goldenShapes },
  { name: 'bounce', mod: goldenBounce },
  { name: 'typography', mod: goldenTypography },
  { name: 'layout', mod: goldenLayout },
  { name: 'filters', mod: goldenFilters },
  { name: 'paths', mod: goldenPaths },
  // narration-anchored captions, both safe-area aspect ratios (§narrate)
  { name: 'captions', mod: goldenCaptions },
  { name: 'captions-portrait', mod: goldenCaptionsPortrait },
  // long-caption overflow guard: auto-shrink + bottom-anchor keeps it in-frame
  { name: 'captions-long', mod: goldenCaptionsLong },
  // caption split-cues: a long segment splits into timed sub-cues
  { name: 'captions-split', mod: goldenCaptionsSplit },
  { name: 'caption-split-band', mod: goldenCaptionSplitBand },
  // CAPTION corpus coverage (lVqWHip5CpfO): glissade's OWN caption layer —
  // the DEFAULT landscape captionNode + a captionTrack with ONE long multi-line
  // segment wrapping to ~2 lines, bottom-anchored in the safe-area band. The
  // other goldens are caption-FREE, so this is the regression guard for the
  // @glissade/narrate caption render. Converges with video-canary (39af4d1c).
  { name: 'caption', mod: goldenCaption },
  // anchors (placement + pivot) and the marker highlight sweep
  { name: 'marker', mod: goldenMarker },
  // typewriter reveal + caret (partial-line masking, wrap, cursor blink)
  { name: 'typewriter', mod: goldenTypewriter },
  // motion along a path: arc-length follow + tangent orient
  { name: 'motionpath', mod: goldenMotionPath },
  // 0.26 orientation drivers: orientToPath banks a rocket to the track tangent
  // (position owned separately by followPath), and lookAt pivots a center turret
  // to face the orbiting rocket — a world-space aim angle, byte-stable on Skia.
  { name: 'orient', mod: goldenOrient },
  // 0.26 Echo motion trails: a dot orbits (position by followPath) inside an Echo,
  // leaving 6 fading ghost copies at earlier playhead offsets — a pure multi-time
  // re-eval (playhead re-addressed + restored per copy), byte-stable on Skia.
  { name: 'echo', mod: goldenEcho },
  // 0.30 sampled motion blur: a fast dot rendered at 16 sub-frame times across a
  // shutter and averaged (running-mean) → a real smear, vs a crisp reference dot.
  // Pure multi-time re-eval (playhead re-addressed + restored), byte-stable on Skia.
  { name: 'motionblur', mod: goldenMotionBlur },
  // 0.55 Camera rig: a push-in (cam/zoom ramp + cam/center pan) over a 2-depth
  // parallax layer stack under a fixed-seed whole-frame shake, with an anchor:'left'
  // bar (no-double-shift composition contract) and a pinned caption SIBLING. Pose is
  // keyed tracks + closed-form shake → a pure function of time, byte-stable on Skia.
  { name: 'camera', mod: goldenCamera },
  // 0.65 Camera NODE-FRAMING: centerOn tracks the `hero` node by id in WORLD space
  // (a far grid at depth 0.4 pans less), and a `clear` reserved band nudges the tall
  // hero's bounds above the caption zone. The focal is a pure function of time (the
  // hero's live worldMatrix + a constant clear nudge) → byte-stable on Skia.
  { name: 'camera-frame', mod: goldenCameraFrame },
  // the data-motion stack: a table → bar chart (build-time fan-out), a staggered
  // rise-in then a bar-chart race from ordinary per-bar height tracks
  { name: 'chart', mod: goldenChart },
  // the radial data-viz stack: a spec → arc zones + ticks + needle + labels
  // (build-time fan-out), a scripted needle swing that settles center while the
  // extreme zones dim independently of their full-brightness labels
  { name: 'gauge', mod: goldenGauge },
  // the Expr authoring stack: every prop a formula of t (Lissajous orbits +
  // pulsing radii/opacity) via tl.expr — no keyframes, pure function of time
  { name: 'expr', mod: goldenExpr },
  // the compositing pair (0.34): clip-on-Group (sliding tiles bitten by a card
  // region) + alpha-matte iris + luma gradient wipe — all plain tracks
  { name: 'compositing', mod: goldenCompositing },
  // 0.35 Text box-valign: baseline-anchored vs ink-centered pills
  { name: 'boxtext', mod: goldenBoxText },
  // 0.36 defineComponent: one LowerThird component instanced 3× (independent namespaces)
  { name: 'component', mod: goldenComponent },
  // following a morphing path live (re-sample as 'route/d' bends)
  { name: 'motionpath-morph', mod: goldenMotionPathMorph },
  // hand-drawn sketch styles (geometric roughening, multi-pass)
  { name: 'sketch', mod: goldenSketch },
  // hachure fill (clipped hatch under a roughened outline)
  { name: 'sketch-hachure', mod: goldenSketchHachure },
  // sketch draw-on: per-contour retreating dash (reveal 0→1)
  { name: 'sketch-drawon', mod: goldenSketchDrawon },
  // plain-shape draw-on (reveal on a non-sketch Path/Rect) + pathFromSegs
  { name: 'path-drawon', mod: goldenPathDrawon },
  // whiteboard kit: drawOnEach cascades sketched shapes drawing themselves on
  { name: 'whiteboard', mod: goldenWhiteboard },
  // SVG import: a parsed SVG document rendered as a static scene
  { name: 'svg', mod: goldenSvg },
  // §3.5 cross-frame raster cache: a cache:true static badge re-blits from the
  // LRU under a moving dot — byte-identical to the uncached render
  { name: 'cache', mod: goldenCache },
  // §2.2/§3 gradient Paint: static radial + linear fills (bounds-defaulted) and a
  // keyframe-animated radial sweeping/growing/recoloring via the paint value type
  { name: 'gradient', mod: goldenGradient },
  // 0.10.1 gradient interpolation modes: linear | smooth | gaussian melt, side by side
  { name: 'gradient-smooth', mod: goldenGradientSmooth },
  // 0.12 §3 mesh Paint: static smooth (Shepard IDW) + gaussian melt mesh fills and a
  // keyframe-animated aurora drifting its points/colors via the paint value type.
  // ONE shared CPU kernel on both backends — byte-exact on Skia, SSIM on browser↔Skia.
  { name: 'mesh', mod: goldenMesh },
  // 0.12 §3.6 instanced variable font: a wght:600-pinned static sfnt rendered
  // byte-exactly on Skia — proves variable-font support is the static-parity case
  { name: 'font-instanced', mod: goldenFontInstanced },
  // 0.20 §3.6 LIVE variable-font axis passthrough: three rows of ONE variable
  // face at the same size, differing only by static `fontVariationSettings`
  // (default/100, "wght" 900, "wght" 500) — the axes reach the glyphs at raster
  // time on Skia, so the rows render distinctly. Byte-exact on the pinned
  // toolchain; the proof the axis is applied, not dropped.
  { name: 'variable-font', mod: goldenVariableFont },
  // 0.23 ANIMATED variable-font axis: a fontAxes track sweeps wght 100->900; each
  // frame renders a distinct weight -> the animated axis reaches the glyphs on Skia.
  { name: 'font-axis-anim', mod: goldenFontAxisAnim },
  // 0.21 STATIC letter-spacing (tracking) passthrough: three rows of ONE face at
  // the same size, differing only by static `letterSpacing` (none / 14 / -3) —
  // the tracking reaches the glyphs at raster time on Skia (which honors
  // ctx.letterSpacing in render AND measure), so the rows render at distinct
  // widths. Byte-exact on the pinned toolchain; the proof tracking is applied.
  { name: 'letter-spacing', mod: goldenLetterSpacing },
  // 0.13 §3.6 woff2-decoded face (DsW-aD_OUMoV item 1): the committed woff2 is
  // decoded ONCE at ingest to a static sfnt, then rendered byte-exactly on Skia —
  // proves the woff2-decode path is byte-stable through the rasterizer
  { name: 'woff2', mod: goldenWoff2 },
  // 0.13 shared-element box-FLIP morph(): a chip grows into a document — a shared
  // morphFx Rect carries the position+scale FLIP while chip/document cross-fade.
  // Compiles to ordinary vec2/number tracks (byte-exact by construction).
  { name: 'morph', mod: goldenMorph },
  // 0.13 presence(): the "send-line agency moment" — a card + scale-only label
  // enter on a beat, live, then exit to land on HIDE; a sibling tag anchors to
  // the card's real exit. Compiles to a keyed opacity window-guard (culls outside
  // [show,hide]) + pass-through channels — byte-stable like any hand-authored doc.
  { name: 'presence', mod: goldenPresence },
  // 0.13 each(): deterministic parametric instancing — a 3×3 grid of Rects
  // generated by one each() call, popIn fanned across the clones from-center.
  // Pins id generation → scene indexing → clip fan-out, byte-stable on Skia.
  { name: 'each', mod: goldenEach },
  // 0.19 kinetic typography: splitText() word-stagger + grapheme scatter, and
  // the revealFraction count alias driving a typewriter. Pure build-time
  // expansion to ordinary nodes/tracks — byte-stable on Skia by construction.
  { name: 'splittext', mod: goldenSplitText },
  // 0.56 kinetic type presets: revealWords (word rise+fade cascade) + revealLines
  // + typeOn string-track + typeOn cursor (render-only caret) + typeOn mask
  // (render-only grapheme reveal). One-call sugar over the shipped primitives;
  // pure function of time — byte-stable on Skia by construction.
  { name: 'kinetic', mod: goldenKinetic },
  // 0.57 Particles/Emitters: a sparks radial burst + an ambient drift field, both
  // composing each() (fixed slot nodes) + bake() (seeded physics → ordinary
  // position/opacity/scale tracks on stable slot ids). Ring-buffer slot pool,
  // opacity-gated, faithful-by-construction (no render-only path); the fixed seed
  // makes the frames a pure function of time — byte-stable on Skia by construction.
  { name: 'particles', mod: goldenParticles },
  // 0.71 kenBurns(): the per-node photo pan/zoom preset — a gradient-filled Rect
  // pushed IN (scale 1→1.1) while it pans, from tracks kenBurns bakes onto the
  // node's own `<id>/scale` + `<id>/position`. The defaulted pan `from` reads the
  // Rect's STATIC constructed position, so the tracks are a pure function of time —
  // byte-stable on Skia by construction (no image decode; the gradient IS the look).
  { name: 'kenburns', mod: goldenKenBurns },
];

for (const { name, mod } of CORPUS) {
  describe(`golden frames: ${name}`, () => {
    const scene = mod.createScene();
    const backend = new SkiaBackend(scene.size.w, scene.size.h);
    scene.setTextMeasurer(backend); // §3.2: break lines with the drawing rasterizer

    for (const frame of FRAMES) {
      it(`frame ${frame} matches the committed golden PNG byte-for-byte`, () => {
        backend.render(evaluate(scene, mod.timeline, frame / FPS));
        const actual = backend.encodePng();
        const goldenPath = join(GOLDEN_DIR, `${name}-f${String(frame).padStart(4, '0')}.png`);
        if (UPDATE || !existsSync(goldenPath)) {
          mkdirSync(GOLDEN_DIR, { recursive: true });
          writeFileSync(goldenPath, actual);
          if (!UPDATE) {
            // first run bootstraps; subsequent runs must match
            expect(existsSync(goldenPath)).toBe(true);
            return;
          }
        }
        assertFrameMatches({
          name,
          frame,
          actual,
          goldenPath,
          warmDisplayList: () => evaluate(scene, mod.timeline, frame / FPS),
          coldDisplayList: () => {
            const cold = mod.createScene();
            const coldBackend = new SkiaBackend(cold.size.w, cold.size.h);
            cold.setTextMeasurer(coldBackend);
            return evaluate(cold, mod.timeline, frame / FPS);
          },
        });
      });
    }

    it('re-rendering the same frame is byte-stable in-process', () => {
      backend.render(evaluate(scene, mod.timeline, 1.234));
      const a = backend.encodePng();
      backend.render(evaluate(scene, mod.timeline, 1.234));
      const b = backend.encodePng();
      expect(a.equals(b)).toBe(true);
    });

    it('a fresh scene + random-order evaluation produces the same pixels (purity, §2.5)', () => {
      const sceneB = mod.createScene();
      const backendB = new SkiaBackend(sceneB.size.w, sceneB.size.h);
      sceneB.setTextMeasurer(backendB);
      const ts = [2.9, 0.4, 1.5, 2.0, 0.0];
      for (const t of ts) {
        backend.render(evaluate(scene, mod.timeline, t));
        backendB.render(evaluate(sceneB, mod.timeline, t));
        expect(backend.encodePng().equals(backendB.encodePng())).toBe(true);
      }
    });
  });
}

// 0.13 woff2 decode determinism (DsW-aD_OUMoV item 1): the woff2 golden above
// renders the DECODED sfnt — but the determinism contract underneath the golden
// is that the decode itself is byte-stable. Decoding the committed woff2 twice
// must produce identical sfnt bytes; otherwise the golden would only be stable
// by luck. (decode-once-at-ingest, NEVER in evaluate.)
describe('woff2 decode is byte-stable (the golden font-decode contract)', () => {
  it('decoding the committed woff2 twice yields byte-identical sfnt bytes', async () => {
    const a = await ingestFont({ family: 'Inconsolata WOFF2', src: woff2Path });
    const b = await ingestFont({ family: 'Inconsolata WOFF2', src: woff2Path });
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
    expect(createHash('sha256').update(a.bytes).digest('hex')).toBe(
      createHash('sha256').update(b.bytes).digest('hex'),
    );
    // and equal to the bytes the harness registered with Skia for the golden.
    expect(Buffer.from(a.bytes).equals(Buffer.from(woff2Face.bytes))).toBe(true);
  });
});
