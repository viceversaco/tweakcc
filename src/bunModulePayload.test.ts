import { describe, expect, it } from 'vitest';

import {
  isChunkModule,
  MODULE_BOUNDARY,
  splitModulePayload,
} from './bunModulePayload';

describe('isChunkModule', () => {
  it('recognizes the code-split chunks emitted by Bun', () => {
    expect(isChunkModule('/$bunfs/root/chunk-zrs5zyqa.js')).toBe(true);
    expect(isChunkModule('B:/~BUN/root/chunk-b08jpphw.js')).toBe(true);
    expect(isChunkModule('chunk-abc123.js')).toBe(true);
  });

  it('does not claim the entrypoint or ordinary modules', () => {
    expect(isChunkModule('/$bunfs/root/cli')).toBe(false);
    expect(isChunkModule('/$bunfs/root/claude')).toBe(false);
    expect(isChunkModule('/$bunfs/root/chart.umd.min.js')).toBe(false);
    // Native addons and compressed assets do not survive a UTF-8 round trip.
    expect(isChunkModule('/$bunfs/root/image-processor.node')).toBe(false);
    expect(isChunkModule('/$bunfs/root/SKILL-ae461f06.md.zst')).toBe(false);
    // A directory named like a chunk must not drag its children in.
    expect(isChunkModule('/$bunfs/root/chunk-abc.js/nested.js')).toBe(false);
  });
});

describe('splitModulePayload', () => {
  const join = (parts: Array<[string, string]>) =>
    parts.map(([n, b]) => `${MODULE_BOUNDARY}${n}\n${b}`).join('');

  it('returns null for a single-module payload so legacy binaries are untouched', () => {
    expect(splitModulePayload('var a=1;')).toBeNull();
    expect(splitModulePayload('')).toBeNull();
  });

  it('round-trips names and bodies exactly', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;\nvar c=3;'],
      ['/$bunfs/root/chunk-b.js', ''],
    ];
    expect(splitModulePayload(join(parts))).toEqual(parts);
  });

  it('preserves bodies that contain blank lines and comment-like text', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', '\n\n// not a boundary\n'],
      ['/$bunfs/root/chunk-a.js', '//#__tweakcc_module__ without colon'],
    ];
    expect(splitModulePayload(join(parts))).toEqual(parts);
  });

  it('survives a patch that changes a body length', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/chunk-a.js', 'var x=200000;'],
      ['/$bunfs/root/chunk-b.js', 'var y=1;'],
    ];
    const patched = join(parts).replace(
      'var x=200000;',
      'var x=(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000);'
    );
    expect(splitModulePayload(patched)).toEqual([
      [
        '/$bunfs/root/chunk-a.js',
        'var x=(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000);',
      ],
      ['/$bunfs/root/chunk-b.js', 'var y=1;'],
    ]);
  });

  it('throws rather than mis-split a malformed boundary', () => {
    expect(() =>
      splitModulePayload(`${MODULE_BOUNDARY}no-newline-after-name`)
    ).toThrow(/Malformed tweakcc module boundary/);
  });
});
