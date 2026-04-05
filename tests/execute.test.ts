import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { CompletionProvider, type CompletionContext } from '../src/core/CompletionProvider';

describe('CompletionProvider - Execute Commands', () => {
  let provider: CompletionProvider;

  beforeEach(() => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
  });

  test('returns execute subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/execute ',
      lineText: '/execute ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('if');
    expect(labels).toContain('unless');
  });

  test('returns execute if subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/execute if',
      lineText: '/execute if',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns execute as subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/execute as ',
      lineText: '/execute as ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('execute nested conditionals', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/execute if entity ',
      lineText: '/execute if entity ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });
});

describe('CompletionProvider - Array Commands', () => {
  let provider: CompletionProvider;

  beforeEach(() => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
  });

  test('returns bossbar subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/bossbar ',
      lineText: '/bossbar ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('list');
  });

  test('returns team subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/team ',
      lineText: '/team ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns scoreboard subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/scoreboard ',
      lineText: '/scoreboard ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns data subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/data ',
      lineText: '/data ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });
});