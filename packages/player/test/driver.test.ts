import { describe, expect, it } from 'vitest';
import { scrollDriver } from '../src/index.js';

// scrollDriver guards `el instanceof Element`; give node a minimal stand-in
(globalThis as Record<string, unknown>)['Element'] ??= class {};

class FakeScrollEl extends (globalThis as { Element: new () => object }).Element {
  scrollTop = 0;
  scrollLeft = 0;
  scrollHeight = 1000;
  clientHeight = 200;
  scrollWidth = 0;
  clientWidth = 0;
  private fn: (() => void) | null = null;
  addEventListener(_t: string, fn: () => void): void {
    this.fn = fn;
  }
  removeEventListener(): void {
    this.fn = null;
  }
  scrollTo(top: number): void {
    this.scrollTop = top;
    this.fn?.();
  }
}

const visibility = () => 'visible' as const;

describe('scrollDriver input mode (v2 §C.1/§C.4)', () => {
  it('writes normalized progress 0..1 when DriverContext.duration is absent', () => {
    const el = new FakeScrollEl();
    const writes: number[] = [];
    const driver = scrollDriver({ source: el as unknown as Element });
    driver.start((v) => writes.push(v), { visibility }); // no duration: input mode
    expect(writes).toEqual([0]); // initial position
    el.scrollTo(400); // 400 / (1000 - 200) = 0.5
    el.scrollTo(800);
    expect(writes).toEqual([0, 0.5, 1]);
    driver.stop();
  });

  it('still maps onto [0, duration] when driving a playhead (v1 behavior intact)', () => {
    const el = new FakeScrollEl();
    const writes: number[] = [];
    const driver = scrollDriver({ source: el as unknown as Element });
    driver.start((v) => writes.push(v), { duration: 4, visibility });
    el.scrollTo(400);
    expect(writes).toEqual([0, 2]);
    driver.stop();
  });

  it('an explicit range overrides either default', () => {
    const el = new FakeScrollEl();
    const writes: number[] = [];
    const driver = scrollDriver({ source: el as unknown as Element, range: [1, 3] });
    driver.start((v) => writes.push(v), { visibility });
    el.scrollTo(400);
    expect(writes).toEqual([1, 2]);
    driver.stop();
  });
});
