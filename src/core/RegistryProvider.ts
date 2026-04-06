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
      version: options.version || 'registries',
    });
  }

  async getItems(): Promise<string[]> {
    return this.loadRegistry('item');
  }

  async getBlocks(): Promise<string[]> {
    return this.loadRegistry('block');
  }

  async getEntities(): Promise<string[]> {
    return this.loadRegistry('entity_type');
  }

  async getEffects(): Promise<string[]> {
    return this.loadRegistry('potion');
  }

  async getEnchantments(): Promise<string[]> {
    return this.loadRegistry('enchantment');
  }

  async getParticles(): Promise<string[]> {
    return this.loadRegistry('particle_type');
  }

  async getSounds(): Promise<string[]> {
    return this.loadRegistry('sound_event');
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
      'item', 'block', 'entity_type', 'potion', 'enchantment',
      'particle_type', 'sound_event', 'dimension', 'loot_tables', 'recipe_type'
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
      // Fetch from the registries branch structure: <name>/data.json
      const data = await this.fetcher.fetch<RegistryData | string[]>(`${name}/data.json`);
      let entries: string[] = [];
      
      if (Array.isArray(data)) {
        entries = data.map(key => key.replace(/^minecraft:/, ''));
      } else if (data && typeof data === 'object' && 'entries' in data && data.entries) {
        for (const [key] of Object.entries(data.entries)) {
          entries.push(key.replace(/^minecraft:/, ''));
        }
      }
      
      entries.sort();
      this.cache.set(name, entries);
      return entries;
    } catch (e) {
      console.error(`Failed to load registry ${name}:`, e);
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