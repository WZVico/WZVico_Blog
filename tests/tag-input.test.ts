import { describe, expect, it } from 'vitest';
import { splitTagInput } from '../src/utils/tag-input';

describe('tag input parsing', () => {
  it('preserves phrase tags when explicit delimiters are used', () => {
    expect(splitTagInput('agent, Vibe coding')).toEqual(['agent', 'Vibe coding']);
    expect(splitTagInput('agent，Vibe coding、AI tools')).toEqual(['agent', 'Vibe coding', 'AI tools']);
  });

  it('keeps whitespace splitting for legacy shorthand input', () => {
    expect(splitTagInput('写作 Markdown 指南')).toEqual(['写作', 'Markdown', '指南']);
  });

  it('supports quoted phrase tags in whitespace shorthand input', () => {
    expect(splitTagInput('"Vibe coding" agent')).toEqual(['Vibe coding', 'agent']);
  });

  it('can strip leading hashes for picks-style tag input', () => {
    expect(splitTagInput('#agent, #Vibe coding', { stripLeadingHash: true })).toEqual([
      'agent',
      'Vibe coding'
    ]);
  });
});
