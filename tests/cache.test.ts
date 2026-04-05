import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { FileCache } from '../src/core/FileCache';
import { CompletionProvider, CompletionKind, type CompletionContext } from '../src/core/CompletionProvider';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  test('set and get', async () => {
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('get non-existent key', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  test('has', async () => {
    await cache.set('key', 'value');
    const result = await cache.has('key');
    expect(result).toBe(true);
  });

  test('delete', async () => {
    await cache.set('key', 'value');
    await cache.delete('key');
    const result = await cache.get('key');
    expect(result).toBeNull();
  });

  test('clear', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();
    const result1 = await cache.get('key1');
    const result2 = await cache.get('key2');
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  test('ttl expires', async () => {
    await cache.set('key', 'value', 100);
    await new Promise((r) => setTimeout(r, 150));
    const result = await cache.get('key');
    expect(result).toBeNull();
  });
});

describe('FileCache', () => {
  let cache: FileCache;
  const testFile = '.test-cache.json';

  beforeEach(() => {
    cache = new FileCache({ filePath: testFile });
  });

  afterEach(async () => {
    await cache.clear();
    try {
      await Bun.file(testFile).delete();
    } catch {}
  });

  test('set and get', async () => {
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('get non-existent key', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  test('has', async () => {
    await cache.set('key', 'value');
    const result = await cache.has('key');
    expect(result).toBe(true);
  });

  test('delete', async () => {
    await cache.set('key', 'value');
    await cache.delete('key');
    const result = await cache.get('key');
    expect(result).toBeNull();
  });

  test('clear', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();
    const result1 = await cache.get('key1');
    const result2 = await cache.get('key2');
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  test('ttl expires', async () => {
    await cache.set('key', 'value', 100);
    await new Promise((r) => setTimeout(r, 150));
    const result = await cache.get('key');
    expect(result).toBeNull();
  });

  test('persists across instances', async () => {
    await cache.set('key', 'value');
    const newCache = new FileCache({ filePath: testFile });
    const result = await newCache.get('key');
    expect(result).toBe('value');
  });
});

describe('CompletionProvider', () => {
  let provider: CompletionProvider;
  const mockCommands = [
    { name: 'give', description: 'Give item to player' },
    { name: 'tell', description: 'Send a message to a player' },
    { name: 'tp', description: 'Teleport player' },
  ];

  test('returns command completions starting with /', async () => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/',
      lineText: '/',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    expect(completions[0]!.label).toStartWith('/');
  });

  test('filters completions by prefix', async () => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/give',
      lineText: '/give',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
    expect(completions[0]!.label).toStartWith('/give');
  });

  test('returns empty for non-command context', async () => {
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
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
    provider = new CompletionProvider({ cacheProvider: new MemoryCache() });
    await provider.clearCache();
    const context: CompletionContext = {
      line: 0,
      character: 0,
      text: '/',
      lineText: '/',
    };
    const completions = await provider.getCompletions(context);
    expect(completions.length).toBeGreaterThan(0);
  });
});