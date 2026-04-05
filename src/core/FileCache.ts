import { type CacheProvider } from './Cache';

export interface FileCacheOptions {
  filePath?: string;
}

export class FileCache implements CacheProvider {
  private filePath: string;
  private cache: Map<string, { value: any; expiry: number | null }> = new Map();

  constructor(options: FileCacheOptions = {}) {
    this.filePath = options.filePath || '.cache.json';
  }

  private async load(): Promise<void> {
    try {
      const file = Bun.file(this.filePath);
      if (await file.exists()) {
        const data = await file.json();
        this.cache = new Map(Object.entries(data));
        this.cleanExpired();
      }
    } catch {
      this.cache = new Map();
    }
  }

  private async save(): Promise<void> {
    const data = Object.fromEntries(this.cache);
    await Bun.write(this.filePath, JSON.stringify(data));
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, item] of this.cache) {
      if (item.expiry && now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  async get(key: string): Promise<any | null> {
    await this.load();
    const item = this.cache.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      await this.save();
      return null;
    }
    return item.value;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.load();
    const expiry = ttl ? Date.now() + ttl : null;
    this.cache.set(key, { value, expiry });
    await this.save();
  }

  async has(key: string): Promise<boolean> {
    await this.load();
    const item = this.cache.get(key);
    if (!item) return false;
    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      await this.save();
      return false;
    }
    return true;
  }

  async delete(key: string): Promise<void> {
    await this.load();
    this.cache.delete(key);
    await this.save();
  }

  async clear(): Promise<void> {
    this.cache.clear();
    await this.save();
  }
}