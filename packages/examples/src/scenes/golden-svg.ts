/**
 * Golden corpus: SVG import. A small SVG document — viewBox sizing, a filled
 * rect, a stroked circle, a triangle <path>, an <ellipse>, and a <g> with a
 * translate+rotate transform — is parsed by @glissade/svg into scene nodes and
 * rendered statically. Exercises the d-string parser, the basic-shape mapping,
 * presentation inheritance, and the transform decomposition end to end.
 */

import { importSvg } from '@glissade/svg';

const SVG = `<svg viewBox="0 0 320 200">
  <rect x="0" y="0" width="320" height="200" fill="#141821"/>
  <rect x="24" y="40" width="100" height="80" rx="12" fill="#4ea1ff"/>
  <circle cx="220" cy="80" r="46" fill="none" stroke="#3ddc97" stroke-width="6"/>
  <path d="M160 150 L210 150 L185 110 Z" fill="#ffd83d"/>
  <ellipse cx="80" cy="160" rx="38" ry="18" fill="#ff6f6f"/>
  <g fill="#c792ea" transform="translate(250 150) rotate(18)">
    <rect x="-26" y="-14" width="52" height="28" rx="4"/>
  </g>
</svg>`;

const mod = importSvg(SVG).toSceneModule();

export default mod;
