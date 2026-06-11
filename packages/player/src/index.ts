// @glissade/player — embed runtime: Player, Drivers, mount() (DESIGN.md §4).

export { clockDriver, scrollDriver, type Driver, type DriverContext, type ScrollDriverOptions } from './driver.js';
export {
  createPlayer,
  TargetOverlapError,
  type AttachedMachine,
  type Player,
  type PlayerInit,
  type PlayerOptions,
  type PlayHandle,
  type LoopMode,
} from './player.js';
export { mount, type Mounted } from './mount.js';
