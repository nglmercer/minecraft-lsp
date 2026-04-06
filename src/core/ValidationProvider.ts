import { type CacheProvider } from './Cache';
import { 
  type Diagnostic, 
  DiagnosticSeverity, 
  NodeType, 
  type CommandNode, 
  type ParsedCommand
} from './Types';
import { validateArgument } from './Utils';
import { CommandTreeService } from './CommandTree';

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
  private commandTree: CommandTreeService;

  constructor(options: ValidationOptions = {}) {
    this.commandTree = new CommandTreeService({
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
    const commands = await this.commandTree.loadCommands();
    
    if (!commands.has(commandName)) {
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
    
    let currentNode: CommandNode | undefined = commands.get(commandName)!.node;
    let currentCommandName = commandName;

    // Follow redirect if the root node itself is a redirect (e.g., 'tp' -> 'teleport')
    if (currentNode?.redirect) {
      const redirect = CommandTreeService.resolveRedirectPath(commands, currentNode);
      if (redirect) {
        currentNode = redirect.node;
        currentCommandName = redirect.name;
      }
    }

    for (let i = 1; i < tokens.length && currentNode; i++) {
        const token = tokens[i];
        if (!token) break;
        
        let nextNode: CommandNode | undefined = CommandTreeService.findNextNode(currentNode, token.text, 'exact');

        if (nextNode) {
            const isRedirect = CommandTreeService.isRedirect(nextNode, token.text);
            
            if (nextNode.type === NodeType.Argument && nextNode.parser) {
                const consumed = CommandTreeService.getTokensConsumed(nextNode.parser, nextNode.properties, tokens.length - i);
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
                const redirect = this.handleRedirect(commands, tokens, i, currentNode);
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

  /**
   * Handle redirect for validation - uses shared resolveRedirectPath,
   * with a fallback to check if the next token is a known command name.
   */
  private handleRedirect(
    commands: Map<string, ParsedCommand>,
    tokens: Token[],
    i: number,
    node: CommandNode
  ): { node: CommandNode; name: string } | undefined {
    // Try the explicit redirect path first
    const redirect = CommandTreeService.resolveRedirectPath(commands, node);
    if (redirect) return redirect;

    // Fallback: check if next token is a command name (e.g., 'run summon')
    const nextToken = tokens[i + 1];
    if (nextToken) {
      return CommandTreeService.findCommandByName(commands, nextToken.text);
    }

    return undefined;
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

  async clearCache(): Promise<void> {
    await this.commandTree.clearCache();
  }
}