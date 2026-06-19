/**
 * Chromium e2e harness for <gs-player> (DESIGN.md §4.3 / §8): two instances —
 * one WITH `controls` (the FINAL controls DOM: a button[part=button], a
 * range[part=scrubber], a span[part=time]) and one WITHOUT (UWKP's lazy
 * behavior: zero controls DOM). The ELEMENT=1 spec clicks/drags the real
 * controls and reads playback STATE off the element's `.player`. The scene is
 * assigned via the `scene` property — scene structure is code (§2.3).
 */

import '@glissade/element';
import bounce from './scenes/golden-bounce';
import type { GsPlayerElement } from '@glissade/element';

declare global {
  interface Window {
    __elementReady?: boolean;
    /** Playhead time of the controls instance. */
    __elTime(): number;
    __elPlaying(): boolean;
    __elDuration(): number;
  }
}

const withControls = document.querySelector<GsPlayerElement>('#withControls')!;
const noControls = document.querySelector<GsPlayerElement>('#noControls')!;
withControls.scene = bounce;
noControls.scene = bounce;

window.__elTime = () => withControls.player?.playhead.peek() ?? 0;
window.__elPlaying = () => withControls.player?.playing ?? false;
window.__elDuration = () => withControls.player?.duration ?? 0;
window.__elementReady = true;
