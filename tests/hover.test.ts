import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { HoverProvider } from '../src/core/HoverProvider';

describe('HoverProvider', () => {
  let provider: HoverProvider;

  beforeEach(() => {
    provider = new HoverProvider({ cacheProvider: new MemoryCache() });
  });

  test('returns hover for known command', async () => {
    const result = await provider.getHover({
      text: '/give',
      line: 0,
      character: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.contents[0]!.value).toContain('give');
  });

  test('returns null for non-command text', async () => {
    const result = await provider.getHover({
      text: 'hello',
      line: 0,
      character: 0,
    });
    expect(result).toBeNull();
  });

  test('returns null for empty command', async () => {
    const result = await provider.getHover({
      text: '/',
      line: 0,
      character: 0,
    });
    expect(result).toBeNull();
  });

  test('returns hover for title command', async () => {
    const result = await provider.getHover({
      text: '/title',
      line: 0,
      character: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.contents[0]!.value).toContain('title');
  });

  test('returns hover for execute command', async () => {
    const result = await provider.getHover({
      text: '/execute',
      line: 0,
      character: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.contents[0]!.value).toContain('execute');
  });

  test('clearCache clears cache', async () => {
    await provider.getHover({ text: '/give', line: 0, character: 0 });
    await provider.clearCache();
    const result = await provider.getHover({ text: '/give', line: 0, character: 0 });
    expect(result).not.toBeNull();
  });
});