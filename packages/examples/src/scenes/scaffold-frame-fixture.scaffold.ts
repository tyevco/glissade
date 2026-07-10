// Generated from scaffold-frame-fixture.narration.timing.json by gs scaffold --frame — a first-draft
// beat skeleton wrapped in YOUR episode frame (scaffoldFrame). Refine the // TODO
// markers, then re-run (a PURE FUNCTION of the committed manifest + the --frame path).
import { recipe } from '@glissade/scene/recipes';
import { scaffoldFrame } from "./scaffold-frame-adapter.js";
import { type NarrationTiming } from '@glissade/narrate';
import timingJson from './scaffold-frame-fixture.narration.timing.json';

const timing = timingJson as NarrationTiming;
const SIZE = { w: 1920, h: 1080 };

// scaffoldFrame(opts, buildBody) is YOUR ~6-line adapter over your episode frame:
//   makeEpisode(opts) -> buildBody(ep) -> ep.finish({ audio: opts.audio ?? [] }).
// The frame OWNS captions / labels / backdrop / duration; the body is authored
// imperatively against the ep handle (ep.push / ep.add / ep.anchor / ep.fadeIn / ep.habit).
export default scaffoldFrame(
  {
    size: SIZE,
    timing,
    require: ["seg-cold-open-a", "seg-desk", "seg-outro"], // drift-guard: every anchored segment id (frame calls narration(timing).require)
    // EDITORIAL — the scaffold can't infer these; fill once per episode:
    accent: "#888888", // TODO: your module accent color
    title: { title: "TODO: episode title" },
    habitText: "TODO: the habit-card line",
    next: { title: "TODO: next-episode title" },
    footnote: { text: "TODO: source note", verified: "TODO: e.g. verified June 2026" },
    titleOutSeg: "seg-desk", // inferred from the narration ids
    outroSeg: "seg-outro", // inferred from the narration ids
  },
  (ep) => {
    // beat 'seg-cold-open-a' — "Meet the assistant nobody manages."
    ep.push(recipe("cold-open", { id: "seg-cold-open-a", frame: ep.size })); // TODO: refine props
    ep.add(ep.fadeIn("seg-cold-open-a", ep.anchor.start("seg-cold-open-a"))); // TODO: refine the entrance
    // TODO beat: ep.push(<component for 'seg-desk'>) + ep.add(...) at ep.anchor.start("seg-desk") — "Picture it as a contractor at a desk."
    // TODO beat: ep.push(<component for 'seg-outro'>) + ep.add(...) at ep.anchor.start("seg-outro") [likely FRAME-owned → route to opts above] — "Next time, the review."
  },
);
