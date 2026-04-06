import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { RegistryProvider } from '../src/core/RegistryProvider';

describe('RegistryProvider', () => {
  let provider: RegistryProvider;

  beforeEach(() => {
    provider = new RegistryProvider({ 
      cacheProvider: new MemoryCache(),
      baseUrl: 'http://invalid.url' // Use invalid URL to ensure network failure tests pass as expected
    });
  });

  test('returns empty array when network fails', async () => {
    const items = await provider.getItems();
    expect(items).toEqual([]);
  });

  test('getBlocks returns empty when network fails', async () => {
    const blocks = await provider.getBlocks();
    expect(blocks).toEqual([]);
  });

  test('getEntities returns empty when network fails', async () => {
    const entities = await provider.getEntities();
    expect(entities).toEqual([]);
  });

  test('getEffects returns empty when network fails', async () => {
    const effects = await provider.getEffects();
    expect(effects).toEqual([]);
  });

  test('getEnchantments returns empty when network fails', async () => {
    const enchantments = await provider.getEnchantments();
    expect(enchantments).toEqual([]);
  });

  test('getParticles returns empty when network fails', async () => {
    const particles = await provider.getParticles();
    expect(particles).toEqual([]);
  });

  test('getSounds returns empty when network fails', async () => {
    const sounds = await provider.getSounds();
    expect(sounds).toEqual([]);
  });

  test('getBiomes returns empty when network fails', async () => {
    const biomes = await provider.getBiomes();
    expect(biomes).toEqual([]);
  });

  test('getDimensions returns empty when network fails', async () => {
    const dimensions = await provider.getDimensions();
    expect(dimensions).toEqual([]);
  });

  test('clearCache clears cache', async () => {
    await provider.getItems();
    await provider.clearCache();
    const items = await provider.getItems();
    expect(items).toEqual([]);
  });
});