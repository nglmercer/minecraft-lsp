import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { CompletionProvider } from '../src/core/CompletionProvider';
import { type CompletionContext } from '../src/core/Types';

describe('CompletionProvider - Execute Commands', () => {
  let provider: CompletionProvider;

  beforeEach(() => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
  });

  test('returns execute subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 9,
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
      character: 11,
      text: '/execute if',
      lineText: '/execute if',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns execute as subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 12,
      text: '/execute as ',
      lineText: '/execute as ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('execute nested conditionals', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 19,
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
      character: 9,
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
      character: 6,
      text: '/team ',
      lineText: '/team ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns scoreboard subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 12,
      text: '/scoreboard ',
      lineText: '/scoreboard ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });

  test('returns data subcommands', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 6,
      text: '/data ',
      lineText: '/data ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });
});

describe('CompletionProvider - Execute Redirect', () => {
  let provider: CompletionProvider;

  beforeEach(() => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
  });

  test('returns top-level commands after execute run', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 13,
      text: '/execute run ',
      lineText: '/execute run ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('give');
    expect(labels).toContain('tp');
    expect(labels.every(l => !l.startsWith('/'))).toBe(true);
  });

  test('returns top-level commands after execute at @p run ', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 19,
      text: '/execute at @p run ',
      lineText: '/execute at @p run ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('give');
    expect(labels).toContain('tp');
    expect(labels.every(l => !l.startsWith('/'))).toBe(true);
  });

  test('filters top-level commands after execute run with prefix', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 15,
      text: '/execute run gi',
      lineText: '/execute run gi',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('give');
    expect(labels).not.toContain('tp');
  });

  test('returns entity completions after execute run summon ', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 20,
      text: '/execute run summon ',
      lineText: '/execute run summon ',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    const labels = completions.map(c => c.label);
    // Should contain entities like 'zombie', 'player', etc.
    expect(labels).toContain('zombie');
  });

  test('returns coordinates after summon zombie ', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 15,
      text: '/summon zombie ',
      lineText: '/summon zombie ',
    };
    const completions = await provider.getCompletions(context);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('~ ~ ~');
  });

  test('returns NBT suggestions after coordinates', async () => {
    const context: CompletionContext = {
      line: 0,
      character: 21,
      text: '/summon zombie ~ ~ ~ ',
      lineText: '/summon zombie ~ ~ ~ ',
    };
    const completions = await provider.getCompletions(context);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('{NoAI:1}');
  });
});

describe('CompletionProvider - Argument Types', () => {
    let provider: CompletionProvider;
  
    beforeEach(() => {
      provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
    });
  
    test('returns selectors after @', async () => {
      const context: CompletionContext = {
        line: 0,
        character: 5,
        text: '/tp @',
        lineText: '/tp @',
      };
      const completions = await provider.getCompletions(context);
      const labels = completions.map(c => c.label);
      console.log('LABELS:', labels);
      expect(labels).toContain('@a');
      expect(labels).toContain('@p');
    });

    test('returns xp suggestions', async () => {
        const context: CompletionContext = {
          line: 0,
          character: 4,
          text: '/xp ',
          lineText: '/xp ',
        };
        const completions = await provider.getCompletions(context);
        expect(completions.length).toBeGreaterThan(0);
    });

    test('returns gamemode suggestions', async () => {
        const context: CompletionContext = {
          line: 0,
          character: 10,
          text: '/gamemode ',
          lineText: '/gamemode ',
        };
        const completions = await provider.getCompletions(context);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('survival');
        expect(labels).toContain('creative');
    });
});