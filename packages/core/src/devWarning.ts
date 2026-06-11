/** The configurable dev-warning channel (no DOM lib in core; console may not exist). */

export type DevWarning = (message: string) => void;

let devWarn: DevWarning = (msg) => {
  (globalThis as { console?: { warn(m: string): void } }).console?.warn(`[glissade] ${msg}`);
};

export function setDevWarning(fn: DevWarning): void {
  devWarn = fn;
}

/** Internal: emit through the configurable channel. */
export function emitDevWarning(message: string): void {
  devWarn(message);
}
