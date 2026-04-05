import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';

export interface CompletionItem {
  label: string;
  kind?: CompletionKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export enum CompletionKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export interface CompletionContext {
  line: number;
  character: number;
  text: string;
  lineText: string;
  triggerCharacter?: string;
}

export interface CompletionOptions {
  cacheProvider?: CacheProvider;
  baseUrl?: string;
  version?: string;
}

export class CompletionProvider {
  private fetcher: DataFetcher;
  private cachedData: Map<string, any[]> = new Map();
  private version: string;

  constructor(options: CompletionOptions = {}) {
    this.version = options.version || 'summary';
    this.fetcher = new DataFetcher({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: this.version,
    });
  }

  async getCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    const analysis = this.analyzeContext(context);
    
    if (analysis.type === 'command') {
      return this.getCommandCompletions(context, analysis);
    }
    
    return [];
  }

  private analyzeContext(context: CompletionContext): { type: string; prefix?: string; command?: string } {
    const text = context.lineText.toLowerCase();
    
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      return {
        type: 'command',
        prefix: parts[0] || '',
        command: parts[0] || '',
      };
    }
    
    return { type: 'unknown' };
  }

  private async getCommandCompletions(
    context: CompletionContext,
    analysis: { type: string; prefix?: string; command?: string }
  ): Promise<CompletionItem[]> {
    const allCommands = await this.loadCommands();
    
    if (!analysis.command) {
      return allCommands.map((cmd) => ({
        label: '/' + cmd.name,
        kind: CompletionKind.Function,
        detail: cmd.description,
        insertText: '/' + cmd.name + ' ',
      }));
    }
    
    return allCommands
      .filter((cmd) => cmd.name.toLowerCase().startsWith(analysis.command!.toLowerCase()))
      .map((cmd) => ({
        label: '/' + cmd.name,
        kind: CompletionKind.Function,
        detail: cmd.description,
        insertText: '/' + cmd.name + ' ',
      }));
  }

  private async loadCommands(): Promise<any[]> {
    if (this.cachedData.has('commands')) {
      return this.cachedData.get('commands')!;
    }
    
    try {
      const data = await this.fetcher.fetch<{ commands: any[] }>('commands/commands.json');
      const commands = data?.commands ?? [];
      this.cachedData.set('commands', commands);
      return commands;
    } catch {
      return [];
    }
  }

  async clearCache(): Promise<void> {
    this.cachedData.clear();
    await this.fetcher.clearCache();
  }
}