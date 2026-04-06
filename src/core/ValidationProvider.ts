import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';
import { 
  type Diagnostic, 
  DiagnosticSeverity, 
  NodeType, 
  type CommandNode 
} from './Types';
import { validateArgument } from './Utils';

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

interface Token {
  text: string;
  start: number;
  end: number;
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
    const text = context.text;
    
    if (!text.trim().startsWith('/')) {
      return diagnostics;
    }
    
    const tokens = this.tokenize(text);
    if (tokens.length === 0) {
      return diagnostics;
    }
    
    const firstToken = tokens[0];
    if (!firstToken) return diagnostics;

    const commandName = firstToken.text;
    const validCommands = await this.loadCommands();
    
    if (!validCommands.has(commandName)) {
      diagnostics.push({
        range: {
          start: { line: context.line, character: firstToken.start },
          end: { line: context.line, character: firstToken.end },
        },
        severity: DiagnosticSeverity.Error,
        message: `Unknown command: /${commandName}`,
        code: 'UNKNOWN_COMMAND',
      });
      return diagnostics;
    }
    
    let currentNode: CommandNode | undefined = validCommands.get(commandName);
    let currentCommandName = commandName;

    // Follow redirect if the root node itself is a redirect (e.g., 'tp' -> 'teleport')
    if (currentNode && currentNode.redirect) {
        const redirect = this.handleRedirect(validCommands, tokens, 0, currentNode);
        if (redirect) {
            currentNode = redirect.node;
            currentCommandName = redirect.name;
        }
    }

    for (let i = 1; i < tokens.length && currentNode; i++) {
        const token = tokens[i];
        if (!token) break;
        
        let nextNode: CommandNode | undefined = this.findNextNode(currentNode, token.text);

        if (nextNode) {
            const isRedirect = this.isRedirect(nextNode, token.text);
            
            if (nextNode.type === NodeType.Argument && nextNode.parser) {
                const consumed = this.getTokensConsumed(nextNode.parser, nextNode.properties, tokens.length - i);
                const argTokens = tokens.slice(i, i + consumed);
                
                if (argTokens.length > 0) {
                    const argText = argTokens.map(t => t.text).join(' ');
                    
                    const validation = validateArgument(argText, nextNode);
                    if (!validation.isValid) {
                        diagnostics.push({
                            range: {
                                start: { line: context.line, character: token.start },
                                end: { line: context.line, character: argTokens[argTokens.length - 1]!.end },
                            },
                            severity: DiagnosticSeverity.Error,
                            message: validation.message || `Invalid argument for ${nextNode.properties?.name || 'value'}`,
                            code: 'INVALID_ARGUMENT',
                        });
                        currentNode = undefined;
                        break;
                    }
                }
                
                i += consumed - 1;
                currentNode = nextNode;
            } else {
                currentNode = nextNode;
            }

            if (isRedirect) {
                const redirect = this.handleRedirect(validCommands, tokens, i, currentNode);
                if (redirect) {
                    currentNode = redirect.node;
                    currentCommandName = redirect.name;
                    // For keyword redirects like 'run', we consumed the next token as command name
                    if (token.text === 'run') {
                        i++;
                    }
                }
            }
        } else {
            diagnostics.push({
                range: {
                    start: { line: context.line, character: token.start },
                    end: { line: context.line, character: token.end },
                },
                severity: DiagnosticSeverity.Error,
                message: `Unknown argument or subcommand: ${token.text}`,
                code: 'UNKNOWN_SUBCOMMAND',
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

  private tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    
    // Skip leading slash
    if (text.startsWith('/')) {
        i++;
    }

    while (i < text.length) {
        // Skip whitespace
        while (i < text.length && /\s/.test(text[i]!)) {
            i++;
        }
        
        if (i >= text.length) break;
        
        const start = i + 1;
        let current = "";
        
        if (text[i] === '"') {
            // Quoted string
            current += text[i];
            i++;
            while (i < text.length) {
                if (text[i] === '\\' && i + 1 < text.length) {
                    current += text[i]! + text[i+1];
                    i += 2;
                } else if (text[i] === '"') {
                    current += text[i];
                    i++;
                    break;
                } else {
                    current += text[i];
                    i++;
                }
            }
        } else if (text[i] === '{' || text[i] === '[') {
            // Brackets (NBT or selectors)
            const open = text[i];
            const close = open === '{' ? '}' : ']';
            let depth = 0;
            
            while (i < text.length) {
                current += text[i];
                if (text[i] === open) depth++;
                else if (text[i] === close) depth--;
                
                i++;
                if (depth === 0) break;
            }
        } else {
            // Regular word
            while (i < text.length && !/\s/.test(text[i]!)) {
                current += text[i]!;
                i++;
            }
        }
        
        if (current.length > 0) {
            tokens.push({
                text: current,
                start: start,
                end: start + current.length
            });
        }
    }
    
    return tokens;
  }

  private findNextNode(currentNode: CommandNode, part: string): CommandNode | undefined {
    if (currentNode.children && currentNode.children[part]) {
      return currentNode.children[part];
    } 
    
    if (currentNode.children) {
      // Case-insensitive literal check
      for (const [childName, childNode] of Object.entries(currentNode.children)) {
        if (childNode.type === NodeType.Literal && childName.toLowerCase() === part.toLowerCase()) {
          return childNode;
        }
      }
      
      // Try all arguments until one validates
      for (const node of Object.values(currentNode.children)) {
        if (node.type === NodeType.Argument) {
          if (validateArgument(part, node).isValid) {
            return node;
          }
        }
      }
    }

    return undefined;
  }

  private isRedirect(node: CommandNode, part: string): boolean {
    return !!node.redirect || (node.type === NodeType.Literal && part === 'run');
  }

  private handleRedirect(
    commands: Map<string, CommandNode>,
    tokens: Token[],
    i: number,
    node: CommandNode
  ): { node: CommandNode; name: string } | undefined {
    const redirect = node.redirect as any;
    if (redirect) {
        const path = Array.isArray(redirect) ? redirect : [redirect];
        const rootName = path[0];
        const targetCmd = commands.get(rootName);
        if (targetCmd) {
            let current = targetCmd;
            for (let j = 1; j < path.length && current; j++) {
                const nextKey = path[j];
                current = current.children?.[nextKey] as CommandNode;
            }
            if (current) {
                return { node: current, name: rootName };
            }
        }
    }

    // Special case for 'run' in execute
    const nextToken = tokens[i + 1];
    if (nextToken && commands.has(nextToken.text)) {
        const targetNode = commands.get(nextToken.text);
        if (targetNode) {
            return { node: targetNode, name: nextToken.text };
        }
    }

    return undefined;
  }

  private getTokensConsumed(parser: string, properties?: Record<string, any>, remaining?: number): number {
    if (parser === 'minecraft:vec3' || parser === 'minecraft:block_pos') return 3;
    if (parser === 'minecraft:vec2' || parser === 'minecraft:rotation' || parser === 'minecraft:column_pos') return 2;
    if (parser === 'minecraft:message' || (parser === 'brigadier:string' && properties?.type === 'greedy')) {
        return remaining || 1;
    }
    return 1;
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