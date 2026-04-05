import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';

export interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: DiagnosticSeverity;
  message: string;
  code?: string;
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface ValidationContext {
  text: string;
  line: number;
  character: number;
}

export interface ValidationOptions {
  cacheProvider?: CacheProvider;
  baseUrl?: string;
  version?: string;
}

interface CommandNode {
  type: string;
  children?: Record<string, CommandNode>;
  executable?: boolean;
  parser?: string;
  properties?: Record<string, any>;
}

export class ValidationProvider {
  private fetcher: DataFetcher;
  private commandTree: Map<string, CommandNode> = new Map();

  constructor(options: ValidationOptions = {}) {
    this.fetcher = new DataFetcher({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: options.version || 'summary',
    });
  }

  async validate(context: ValidationContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const text = context.text.trim();
    
    if (!text.startsWith('/')) {
      return diagnostics;
    }
    
    const parts = text.slice(1).split(/\s+/).filter(p => p.length > 0);
    
    if (parts.length === 0) {
      return diagnostics;
    }
    
    const commandName = parts[0];
    const validCommands = await this.loadCommands();
    
    if (!validCommands.has(commandName)) {
      diagnostics.push({
        range: {
          start: { line: context.line, character: 1 },
          end: { line: context.line, character: 1 + commandName.length },
        },
        severity: DiagnosticSeverity.Error,
        message: `Unknown command: /${commandName}`,
        code: 'UNKNOWN_COMMAND',
      });
      return diagnostics;
    }
    
    let currentNode = validCommands.get(commandName)!;
    
    for (let i = 1; i < parts.length && currentNode; i++) {
      const part = parts[i];
      
      if (currentNode.children?.[part]) {
        currentNode = currentNode.children[part];
      } else if (currentNode.children) {
        let found = false;
        for (const [childName, childNode] of Object.entries(currentNode.children)) {
          if (childNode.type === 'literal' && childName.toLowerCase() === part.toLowerCase()) {
            currentNode = childNode;
            found = true;
            break;
          }
        }
        if (!found) {
          diagnostics.push({
            range: {
              start: { line: context.line, character: this.getCharacterPosition(text, i) },
              end: { line: context.line, character: this.getCharacterPosition(text, i) + part.length },
            },
            severity: DiagnosticSeverity.Error,
            message: `Unknown subcommand: ${part}`,
            code: 'UNKNOWN_SUBCOMMAND',
          });
          break;
        }
      } else if (!currentNode.executable) {
        diagnostics.push({
          range: {
            start: { line: context.line, character: this.getCharacterPosition(text, i) },
            end: { line: context.line, character: this.getCharacterPosition(text, i) + part.length },
          },
          severity: DiagnosticSeverity.Warning,
          message: `Unexpected argument: ${part}`,
          code: 'UNEXPECTED_ARGUMENT',
        });
      }
    }
    
    if (currentNode && !currentNode.executable && !currentNode.children) {
      const lastPart = parts[parts.length - 1];
      diagnostics.push({
        range: {
          start: { line: context.line, character: this.getCharacterPosition(text, parts.length - 1) },
          end: { line: context.line, character: this.getCharacterPosition(text, parts.length - 1) + lastPart.length },
        },
        severity: DiagnosticSeverity.Information,
        message: `Incomplete command`,
        code: 'INCOMPLETE_COMMAND',
      });
    }
    
    return diagnostics;
  }

  private getCharacterPosition(text: string, wordIndex: number): number {
    const parts = text.split(/\s+/);
    let position = 1;
    
    for (let i = 0; i < wordIndex && i < parts.length; i++) {
      position += parts[i].length + 1;
    }
    
    return position;
  }

  private async loadCommands(): Promise<Map<string, CommandNode>> {
    if (this.commandTree.size > 0) {
      return this.commandTree;
    }
    
    try {
      const data = await this.fetcher.fetch<CommandNode>('commands/data.json');
      
      if (data?.children) {
        for (const [name, node] of Object.entries(data.children)) {
          if (node.type === 'literal') {
            this.commandTree.set(name, node);
          }
        }
      }
    } catch {
      // Return empty map
    }
    
    return this.commandTree;
  }

  async clearCache(): Promise<void> {
    this.commandTree.clear();
    await this.fetcher.clearCache();
  }
}