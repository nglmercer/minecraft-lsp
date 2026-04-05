import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { RegistryProvider } from '../src/core/RegistryProvider';

describe('RegistryProvider', () => {
  let provider: RegistryProvider;

  beforeEach(() => {
    provider = new RegistryProvider({ cacheProvider: new MemoryCache() });
  });

  test('getItems returns item list', async () => {
    const items = await provider.getItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items).toContain('diamond');
  });

  test('getBlocks returns block list', async () => {
    const blocks = await provider.getBlocks();
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks).toContain('stone');
  });

  test('getEntities returns entity list', async () => {
    const entities = await provider.getEntities();
    expect(entities.length).toBeGreaterThan(0);
    expect(entities).toContain('minecraft:player');
  });

  test('getEffects returns effect list', async () => {
    const effects = await provider.getEffects();
    expect(effects.length).toBeGreaterThan(0);
  });

  test('getEnchantments returns enchantment list', async () => {
    const enchantments = await provider.getEnchantments();
    expect(enchantments.length).toBeGreaterThan(0);
  });

  test('getParticles returns particle list', async () => {
    const particles = await provider.getParticles();
    expect(particles.length).toBeGreaterThan(0);
  });

  test('getSounds returns sound list', async () => {
    const sounds = await provider.getSounds();
    expect(sounds.length).toBeGreaterThan(0);
  });

  test('getBiomes returns biome list', async () => {
    const biomes = await provider.getBiomes();
    expect(biomes.length).toBeGreaterThan(0);
  });

  test('getDimensions returns dimension list', async () => {
    const dimensions = await provider.getDimensions();
    expect(dimensions.length).toBeGreaterThan(0);
  });

  test('clearCache clears cache', async () => {
    await provider.getItems();
    await provider.clearCache();
    const items = await provider.getItems();
    expect(items.length).toBeGreaterThan(0);
  });
});