import { describe, it, expect } from 'vitest';
import '../../../src/static/js/shared-utils.js';

const { shouldGroupWithPrevious } = window.AcbUtils;

const T0 = '2026-03-01T12:00:00.000Z';
const T1 = '2026-03-01T12:02:00.000Z'; // +2 min (within group)
const T2 = '2026-03-01T12:06:00.000Z'; // +6 min (breaks group)

describe('shouldGroupWithPrevious', () => {
  it('returns true when same author within 5 minutes', () => {
    expect(shouldGroupWithPrevious('agent-a', T0, 'agent-a', T1, false, false)).toBe(true);
  });

  it('returns false when authors differ', () => {
    expect(shouldGroupWithPrevious('agent-a', T0, 'agent-b', T1, false, false)).toBe(false);
  });

  it('returns false when time gap is >= 5 minutes', () => {
    expect(shouldGroupWithPrevious('agent-a', T0, 'agent-a', T2, false, false)).toBe(false);
  });

  it('returns false when isSystem is true', () => {
    expect(shouldGroupWithPrevious('system', T0, 'system', T1, true, false)).toBe(false);
  });

  it('returns false when isHuman is true', () => {
    expect(shouldGroupWithPrevious('human', T0, 'human', T1, false, true)).toBe(false);
  });

  it('returns false when prevAuthorKey is null (first message in thread)', () => {
    expect(shouldGroupWithPrevious(null, null, 'agent-a', T0, false, false)).toBe(false);
  });
});
