import {type CacheProvider, MemoryCache } from './Cache';

export interface DataFetcherOptions {
  cacheProvider?: CacheProvider;
  baseUrl?: string;
  version?: string;
}

export class DataFetcher {
  private cache: CacheProvider;
  private baseUrl: string;
  private version: string;

  constructor(options: DataFetcherOptions = {}) {
    this.cache = options.cacheProvider || new MemoryCache();
    // Default to the summary branch for concise data, or specific versions
    this.baseUrl = options.baseUrl || 'https://raw.githubusercontent.com/misode/mcmeta';
    this.version = options.version || 'summary';
  }

  /**
   * Fetches data from mcmeta, utilizing the cache if available.
   * @param path The path to the json file (e.g. 'commands/data.json')
   */
  async fetch<T>(path: string): Promise<T> {
    const cacheKey = `${this.baseUrl}/${this.version}/${path}`;
    
    if (await this.cache.has(cacheKey)) {
      return (await this.cache.get(cacheKey)) as T;
    }

    const url = `${this.baseUrl}/${this.version}/${path}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Cache for 24 hours by default
    await this.cache.set(cacheKey, data, 24 * 60 * 60 * 1000);
    
    return data as T;
  }

  /**
   * Clears the internal cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }
}
