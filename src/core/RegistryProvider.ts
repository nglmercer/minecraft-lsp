import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';

export interface RegistryEntry {
  name: string;
  protocol_id?: number;
}

export interface RegistryData {
  entries?: Record<string, RegistryEntry>;
}

export class RegistryProvider {
  private fetcher: DataFetcher;
  private cache: Map<string, string[]> = new Map();

  constructor(options: RegistryProviderOptions = {}) {
    this.fetcher = new DataFetcher({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: options.version,
    });
  }

  async getItems(): Promise<string[]> {
    return this.loadRegistry('items');
  }

  async getBlocks(): Promise<string[]> {
    return this.loadRegistry('blocks');
  }

  async getEntities(): Promise<string[]> {
    return this.loadRegistry('entities');
  }

  async getEffects(): Promise<string[]> {
    return this.loadRegistry('potions');
  }

  async getEnchantments(): Promise<string[]> {
    return this.loadRegistry('enchantments');
  }

  async getParticles(): Promise<string[]> {
    return this.loadRegistry('particles');
  }

  async getSounds(): Promise<string[]> {
    return this.loadRegistry('sounds');
  }

  async getBiomes(): Promise<string[]> {
    return this.loadRegistry('worldgen/biome');
  }

  async getDimensions(): Promise<string[]> {
    return this.loadRegistry('dimension');
  }

  async getLootTables(): Promise<string[]> {
    return this.loadRegistry('loot_tables');
  }

  async getRecipes(): Promise<string[]> {
    return this.loadRegistry('recipes');
  }

  async getTags(type: 'blocks' | 'items' | 'entities'): Promise<string[]> {
    return this.loadRegistry(`tags/${type}`);
  }

  async getAllRegistries(): Promise<Record<string, string[]>> {
    const registries = [
      'items', 'blocks', 'entities', 'potions', 'enchantments',
      'particles', 'sounds', 'dimension', 'loot_tables', 'recipes'
    ];
    
    const result: Record<string, string[]> = {};
    await Promise.all(
      registries.map(async (name) => {
        result[name] = await this.loadRegistry(name);
      })
    );
    return result;
  }

  private async loadRegistry(name: string): Promise<string[]> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }
    
    try {
      const data = await this.fetcher.fetch<RegistryData>(`registries/${name}.json`);
      const entries: string[] = [];
      
      if (data?.entries) {
        for (const [key] of Object.entries(data.entries)) {
          entries.push(key.replace(/^minecraft:/, ''));
        }
      }
      
      entries.sort();
      this.cache.set(name, entries);
      return entries;
    } catch {
      return [];
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }
}

export interface RegistryProviderOptions {
  cacheProvider?: CacheProvider;
  baseUrl?: string;
  version?: string;
}