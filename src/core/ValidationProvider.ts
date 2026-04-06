import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';
import { 
  type Diagnostic, 
  DiagnosticSeverity, 
  NodeType, 
  type CommandNode 
} from './Types';

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
    
    if (!validCommands.has(commandName!)) {
      diagnostics.push({
        range: {
          start: { line: context.line, character: 1 },
          end: { line: context.line, character: 1 + commandName!.length },
        },
        severity: DiagnosticSeverity.Error,
        message: `Unknown command: /${commandName}`,
        code: 'UNKNOWN_COMMAND',
      });
      return diagnostics;
    }
    
    let currentNode: CommandNode | undefined = validCommands.get(commandName!)!;
    
    for (let i = 1; i < parts.length && currentNode; i++) {
        const part = parts[i]!;
        
        // Literal check
        if (currentNode.children?.[part]) {
            currentNode = currentNode.children[part];
            continue;
        }

        // Case-insensitive literal check or Argument check
        if (currentNode.children) {
            let nextNode: CommandNode | undefined;
            
            // Try literal case-insensitive
            for (const [childName, childNode] of Object.entries(currentNode.children)) {
                if (childNode.type === NodeType.Literal && childName.toLowerCase() === part.toLowerCase()) {
                    nextNode = childNode;
                    break;
                }
            }

            // Try argument
            if (!nextNode) {
                const argNode: CommandNode | undefined = Object.values(currentNode.children).find(n => n.type === NodeType.Argument);
                if (argNode) {
                    const validation = this.validateArgument(part, argNode);
                    if (validation.isValid) {
                        nextNode = argNode;
                    } else {
                        diagnostics.push({
                            range: {
                                start: { line: context.line, character: this.getCharacterPosition(text, i) },
                                end: { line: context.line, character: this.getCharacterPosition(text, i) + part.length },
                            },
                            severity: DiagnosticSeverity.Error,
                            message: validation.message || `Invalid argument for ${argNode.properties?.name || 'value'}`,
                            code: 'INVALID_ARGUMENT',
                        });
                        currentNode = undefined;
                        break;
                    }
                }
            }

            if (nextNode) {
                currentNode = nextNode;
            } else {
                diagnostics.push({
                    range: {
                        start: { line: context.line, character: this.getCharacterPosition(text, i) },
                        end: { line: context.line, character: this.getCharacterPosition(text, i) + part.length },
                    },
                    severity: DiagnosticSeverity.Error,
                    message: `Unknown argument or subcommand: ${part}`,
                    code: 'UNKNOWN_SUBCOMMAND',
                });
                currentNode = undefined;
                break;
            }
        } else {
            // No children but not finished
            diagnostics.push({
                range: {
                    start: { line: context.line, character: this.getCharacterPosition(text, i) },
                    end: { line: context.line, character: this.getCharacterPosition(text, i) + part.length },
                },
                severity: DiagnosticSeverity.Warning,
                message: `Unexpected argument: ${part}`,
                code: 'UNEXPECTED_ARGUMENT',
            });
            currentNode = undefined;
            break;
        }
    }
    
    // Check for missing arguments if not executable
    if (currentNode && !currentNode.executable) {
        const missingArgs = this.getMissingArguments(currentNode);
        if (missingArgs.length > 0) {
            diagnostics.push({
                range: {
                    start: { line: context.line, character: text.length },
                    end: { line: context.line, character: text.length + 1 },
                },
                severity: DiagnosticSeverity.Warning,
                message: `Missing required argument(s): ${missingArgs.join(' ')}`,
                code: 'MISSING_ARGUMENT',
            });
        }
    }
    
    return diagnostics;
  }

  private getCharacterPosition(text: string, wordIndex: number): number {
    const parts = text.split(/\s+/);
    let position = 1;
    
    for (let i = 0; i < wordIndex && i < parts.length; i++) {
      //if (!parts[i]) continue;
      position += parts[i]!.length + 1;
    }
    
    return position;
  }

  private validateArgument(part: string, node: CommandNode): { isValid: boolean; message?: string } {
    const parser = node.parser || 'unknown';
    const name = node.properties?.name || 'value';
    
    switch (parser) {
        case 'brigadier:integer': {
            const val = parseInt(part);
            if (isNaN(val)) return { isValid: false, message: `Expected integer for "${name}"` };
            if (node.properties?.min !== undefined && val < node.properties.min) return { isValid: false, message: `Value must be at least ${node.properties.min}` };
            if (node.properties?.max !== undefined && val > node.properties.max) return { isValid: false, message: `Value must be at most ${node.properties.max}` };
            return { isValid: true };
        }
        case 'brigadier:float':
        case 'brigadier:double': {
            const val = parseFloat(part);
            if (isNaN(val)) return { isValid: false, message: `Expected number for "${name}"` };
            if (node.properties?.min !== undefined && val < node.properties.min) return { isValid: false, message: `Value must be at least ${node.properties.min}` };
            if (node.properties?.max !== undefined && val > node.properties.max) return { isValid: false, message: `Value must be at most ${node.properties.max}` };
            return { isValid: true };
        }
        case 'brigadier:bool': {
            if (part !== 'true' && part !== 'false') return { isValid: false, message: `Expected true or false for "${name}"` };
            return { isValid: true };
        }
        case 'minecraft:resource_location':
            if (!part.match(/^[a-z0-9_./-]+$/)) return { isValid: false, message: `Invalid resource location for "${name}"` };
            return { isValid: true };
        default:
            return { isValid: true };
    }
  }

  private getMissingArguments(node: CommandNode): string[] {
    const missing: string[] = [];
    let current: CommandNode = node;
    
    while (current.children && !current.executable) {
        const argNode = Object.values(current.children).find(n => n.type === NodeType.Argument);
        const children = current.children;
        const literalNodes = Object.keys(children).filter(k => children[k]!.type === NodeType.Literal);
        
        if (argNode) {
            missing.push(`<${argNode.properties?.name || 'value'}>`);
            current = argNode;
        } else if (literalNodes.length > 0) {
            missing.push(`(${literalNodes.join('|')})`);
            break; 
        } else {
            break;
        }
    }
    
    return missing;
  }

  private async loadCommands(): Promise<Map<string, CommandNode>> {
    if (this.commandTree.size > 0) {
      return this.commandTree;
    }
    
    try {
      const data = await this.fetcher.fetch<CommandNode>('commands/data.json');
      
      if (data?.children) {
        for (const [name, node] of Object.entries(data.children)) {
          if (node.type === NodeType.Literal) {
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