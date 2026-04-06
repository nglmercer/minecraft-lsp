import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { CompletionProvider, type CompletionContext } from '../src/core/CompletionProvider';

describe('CompletionProvider', () => {
  let provider: CompletionProvider;

  beforeEach(() => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
  });

  test('returns command completions starting with /', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 1,
      text: '/',
      lineText: '/',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    expect(completions[0]!.label).toStartWith('/');
  });

  test('filters completions by prefix', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 5,
      text: '/give',
      lineText: '/give',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns empty for non-command context', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: 'hello',
      lineText: 'hello',
    };
    const completions = await provider.getCompletions(context);
    expect(completions).toEqual([]);
  });

  test('clearCache clears cached data', async () => {
    await provider.clearCache();
    const context: CompletionContext = {
      line: 0,
      character: 1,
      text: '/',
      lineText: '/',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns subcommand completions after command name', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 6,
      text: '/give ',
      lineText: '/give ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns title subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 7,
      text: '/title ',
      lineText: '/title ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns effect subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 8,
      text: '/effect ',
      lineText: '/effect ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });
});