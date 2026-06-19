import { describe, expect, it } from 'vitest';
import { parseArgs, KNOWN_BOOLEAN_FLAGS } from '../src/args.js';

describe('parseArgs (positional/flag argv parser)', () => {
  it('a boolean flag NEVER consumes the next token — the scene path survives', () => {
    // the bug: `gs render --cache scene.js` greedily ate scene.js as --cache's value
    const { positional, flags } = parseArgs(['scene.js', '--cache']);
    expect(positional).toEqual(['scene.js']);
    expect(flags.get('cache')).toBe('');
  });

  it('a boolean flag before the positional does NOT eat the scene path', () => {
    const { positional, flags } = parseArgs(['--cache', 'scene.js']);
    expect(positional).toEqual(['scene.js']);
    expect(flags.get('cache')).toBe('');
  });

  it('a value-taking flag still consumes its value (--cache-max-size 2GB)', () => {
    const { positional, flags } = parseArgs(['scene.js', '--cache-max-size', '2GB']);
    expect(positional).toEqual(['scene.js']);
    expect(flags.get('cache-max-size')).toBe('2GB');
  });

  it('--flag=value form is honored for both boolean and value flags', () => {
    const { flags } = parseArgs(['scene.js', '--cache=.gscache', '--fps=30']);
    expect(flags.get('cache')).toBe('.gscache');
    expect(flags.get('fps')).toBe('30');
  });

  it('every KNOWN_BOOLEAN_FLAG refuses to consume a following non-flag token', () => {
    for (const name of KNOWN_BOOLEAN_FLAGS) {
      const { positional, flags } = parseArgs([`--${name}`, 'scene.js']);
      expect(flags.get(name), name).toBe('');
      expect(positional, name).toEqual(['scene.js']);
    }
  });

  it('mixes boolean + value flags + positional in any order', () => {
    const { positional, flags } = parseArgs(['scene.js', '--cache', '--out', 'out.mp4', '--force']);
    expect(positional).toEqual(['scene.js']);
    expect(flags.get('cache')).toBe('');
    expect(flags.get('out')).toBe('out.mp4');
    expect(flags.get('force')).toBe('');
  });

  it('a trailing value flag with no value becomes empty (no token to consume)', () => {
    const { flags } = parseArgs(['scene.js', '--out']);
    expect(flags.get('out')).toBe('');
  });
});
