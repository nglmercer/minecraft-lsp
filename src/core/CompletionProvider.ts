import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';
import { 
  type CompletionItem, 
  CompletionKind, 
  type CompletionContext, 
  NodeType, 
  type CommandNode, 
  type ParsedCommand 
} from './Types';
import { REGISTRIES, SELECTORS, PARSERS, PARSER_SUGGESTIONS, PARSER_REGISTRIES, PARSER_KINDS, ENTITY_PARSERS } from './Constants';
import { CommandTreeService } from './CommandTree';

export interface CompletionOptions {
  cacheProvider?: CacheProvider;
  baseUrl?: string;
  version?: string;
}

export interface ContextAnalysis {
  type: AnalysisType;
  parts: string[];
  currentIndex: number;
  currentPart: string;
}

export enum AnalysisType {
  None = 'none',
  Command = 'command',
}

export class CompletionProvider {
  private commandTree: CommandTreeService;
  private registryFetcher: DataFetcher;
  private cachedRegistries: Map<string, string[]> = new Map();

  constructor(options: CompletionOptions = {}) {
    this.commandTree = new CommandTreeService({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: options.version,
    });

    this.registryFetcher = new DataFetcher({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: 'registries',
    });
  }

  async getCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    const analysis = this.analyzeContext(context);
    
    if (analysis.type === AnalysisType.Command) {
      return this.getCommandCompletions(context, analysis);
    }
    
    return [];
  }

  private analyzeContext(context: CompletionContext): ContextAnalysis {
    const fullText = context.lineText;
    const textBeforeCursor = fullText.substring(0, context.character);
    
    const rawParts = textBeforeCursor.startsWith('/') 
      ? textBeforeCursor.slice(1).split(/\s+/)
      : textBeforeCursor.split(/\s+/);
      
    const parts = rawParts.filter((p, i) => i < rawParts.length - 1 || p.length > 0);
    const currentIndex = rawParts.length - 1;
    const currentPart = rawParts[currentIndex] || '';
    
    if (currentIndex === 0 && !textBeforeCursor.startsWith('/')) {
        return {
          type: AnalysisType.None,
          parts: [],
          currentIndex: 0,
          currentPart: ''
        };
    }
    
    return {
      type: AnalysisType.Command,
      parts: parts,
      currentIndex,
      currentPart
    };
  }

  private async getCommandCompletions(
    context: CompletionContext,
    analysis: ContextAnalysis
  ): Promise<CompletionItem[]> {
    console.log(`getCommandCompletions: text="${context.lineText}", currentIndex=${analysis.currentIndex}, currentPart="${analysis.currentPart}"`);
    const commands = await this.commandTree.loadCommands();
    const { parts, currentIndex, currentPart } = analysis;
    
    if (currentIndex === 0) {
      return this.getTopLevelCommands(commands, false, currentPart);
    }
    
    return this.getSubCommandCompletions(commands, parts, currentIndex, currentPart);
  }

  private getTopLevelCommands(
    commands: Map<string, ParsedCommand>, 
    omitSlash: boolean = false,
    filter: string = ''
  ): CompletionItem[] {
    const items: CompletionItem[] = [];
    
    for (const [name, cmd] of commands) {
      if (filter && !name.toLowerCase().startsWith(filter.toLowerCase())) {
        continue;
      }
      items.push({
        label: (omitSlash ? '' : '/') + name,
        kind: CompletionKind.Function,
        detail: cmd.description,
        insertText: name + ' ',
        command: name,
      });
    }
    
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  private async getSubCommandCompletions(
    commands: Map<string, ParsedCommand>,
    parts: string[],
    currentIndex: number,
    currentPart: string
  ): Promise<CompletionItem[]> {
    const traversal = this.traversePath(commands, parts, currentIndex);
    console.log(`getSubCommandCompletions: traversal=${traversal ? 'found' : 'missing'}, currentIndex=${currentIndex}, parts=[${parts}], currentPart="${currentPart}"`);
    
    if (!traversal || !traversal.currentNode || (!traversal.currentNode.children && !traversal.currentNode.redirect)) {
      console.log(`  - Returning top level commands (omitSlash=true)`);
      return this.getTopLevelCommands(commands, true, currentPart);
    }
    
    return this.getNodeSuggestions(traversal.currentNode, traversal.commandName, currentPart);
  }

  private traversePath(
    commands: Map<string, ParsedCommand>,
    parts: string[],
    currentIndex: number
  ): { currentNode: CommandNode; commandName: string } | undefined {
    let commandName = parts[0] || '';
    let currentNode: CommandNode | undefined;
    
    if (!commandName || !commands.has(commandName)) {
      return undefined;
    }

    currentNode = commands.get(commandName)!.node;
    
    // Follow redirect if the root node itself is a redirect
    if (currentNode?.redirect) {
      const redirect = CommandTreeService.resolveRedirectPath(commands, currentNode);
      if (redirect) {
        currentNode = redirect.node;
        commandName = redirect.name;
      }
    }
    
    for (let i = 1; i < currentIndex && currentNode; i++) {
      const part = parts[i] || '';
      const nextNode = CommandTreeService.findNextNode(currentNode, part, 'prefix');
      
      if (nextNode) {
        if (CommandTreeService.isRedirect(nextNode, part)) {
          const redirect = CommandTreeService.resolveRedirectPath(commands, nextNode);
          if (redirect) {
            currentNode = redirect.node;
            commandName = redirect.name;
          } else {
            // Fallback: check if next part is a command name
            const nextPart = parts[i + 1];
            if (nextPart) {
              const cmd = CommandTreeService.findCommandByName(commands, nextPart);
              if (cmd) {
                currentNode = cmd.node;
                commandName = cmd.name;
                i++;
              } else if (part === 'run' || nextNode.redirect?.[0] === 'execute') {
                return undefined;
              }
            } else if (part === 'run' || nextNode.redirect?.[0] === 'execute') {
              return undefined;
            }
          }
        } else {
            if (nextNode.type === NodeType.Argument && nextNode.parser) {
                const consumed = CommandTreeService.getTokensConsumed(nextNode.parser, nextNode.properties, parts.length - i);
                i += consumed - 1;
                currentNode = nextNode;
            } else {
                currentNode = nextNode;
            }
        }
      } else {
        return undefined;
      }
    }

    console.log(`traversePath: commandName="${commandName}", currentNode=${currentNode ? 'found' : 'missing'}`);
    return currentNode ? { currentNode, commandName } : undefined;
  }

  private async getNodeSuggestions(
    node: CommandNode,
    commandName: string,
    currentPart: string
  ): Promise<CompletionItem[]> {
    if (node.redirect) {
      const commands = await this.commandTree.loadCommands();
      const redirect = CommandTreeService.resolveRedirectPath(commands, node);
      if (redirect) {
        return this.getNodeSuggestions(redirect.node, commandName, currentPart);
      }
    }

    if (!node.children) return [];

    const items: Promise<CompletionItem[]>[] = [];
    const isPartial = currentPart !== '';

    console.log(`getNodeSuggestions: commandName=${commandName}, currentPart="${currentPart}", children=${Object.keys(node.children || {})}`);
    for (const [name, childNode] of Object.entries(node.children)) {
      if (childNode.type === NodeType.Literal) {
        items.push(Promise.resolve(this.getLiteralSuggestions(name, childNode, commandName, currentPart, isPartial)));
      } else if (childNode.type === NodeType.Argument) {
        console.log(`  - Checking argument: parser=${childNode.parser}`);
        items.push(this.getArgumentSuggestions(childNode, commandName, currentPart, isPartial));
      }
    }

    const results = await Promise.all(items);
    return results.flat().sort((a, b) => a.label.localeCompare(b.label));
  }

  private getLiteralSuggestions(
    name: string,
    _node: CommandNode,
    commandName: string,
    currentPart: string,
    isPartial: boolean
  ): CompletionItem[] {
    if (isPartial && !name.toLowerCase().startsWith(currentPart.toLowerCase())) {
      return [];
    }
    return [{
      label: name,
      kind: CompletionKind.Keyword,
      insertText: name + ' ',
      command: commandName,
    }];
  }

  private async getArgumentSuggestions(
    node: CommandNode,
    commandName: string,
    currentPart: string,
    isPartial: boolean
  ): Promise<CompletionItem[]> {
    const parser = node.parser || 'unknown';
    const items: CompletionItem[] = [];

    const isEntity = ENTITY_PARSERS.some(p => parser.includes(p));
    
    if (isEntity) {
      for (const selector of SELECTORS) {
        if (!isPartial || selector.startsWith(currentPart)) {
          items.push({
            label: selector,
            kind: CompletionKind.Variable,
            insertText: selector + ' ',
            command: commandName,
          });
        }
      }
    }

    const suggestions = await this.getSuggestionsForParser(parser, node.properties);
    const argName = node.properties?.name || 'value';
    
    if (suggestions.length > 0) {
      for (const suggestion of suggestions) {
        if (isPartial && !suggestion.toLowerCase().startsWith(currentPart.toLowerCase())) {
          continue;
        }
        items.push({
          label: suggestion,
          kind: this.getKindForParser(parser),
          detail: `(${argName})`,
          insertText: suggestion + ' ',
          command: commandName,
        });
      }
    } else if (!isPartial) {
      items.push({
        label: `<${argName}>`,
        kind: CompletionKind.Variable,
        detail: parser.replace('minecraft:', '').replace('brigadier:', ''),
        documentation: `Expected: ${parser}`,
        insertText: '',
        command: commandName,
      });
    }

    return items;
  }

  private getKindForParser(parser: string): CompletionKind {
    if (parser.includes(PARSER_KINDS.ENTITY)) return CompletionKind.Reference;
    if (parser.includes(PARSER_KINDS.ITEM)) return CompletionKind.Value;
    if (parser.includes(PARSER_KINDS.BLOCK)) return CompletionKind.Struct;
    if (parser.includes(PARSER_KINDS.SOUND)) return CompletionKind.Event;
    if (parser.includes(PARSER_KINDS.POTION) || parser.includes(PARSER_KINDS.EFFECT)) return CompletionKind.Enum;
    if (parser.includes(PARSER_KINDS.ENCHANTMENT)) return CompletionKind.EnumMember;
    return CompletionKind.Variable;
  }

  private async getSuggestionsForParser(parser: string, properties?: Record<string, any>): Promise<string[]> {
    if (properties?.registry) {
      return this.loadRegistry(properties.registry.replace('minecraft:', ''));
    }

    if (parser === PARSERS.ENTITY_SUMMON) {
      return this.loadRegistry(REGISTRIES.ENTITY_TYPE);
    }

    if (PARSER_SUGGESTIONS[parser]) {
        return PARSER_SUGGESTIONS[parser];
    }

    const registry = PARSER_REGISTRIES[parser];
    if (registry) {
      return this.loadRegistry(registry);
    }
    
    if (properties?.value) {
      return [properties.value.toString()];
    }
    
    return [];
  }

  private async loadRegistry(name: string): Promise<string[]> {
    if (this.cachedRegistries.has(name)) {
      return this.cachedRegistries.get(name)!;
    }
    
    try {
      const data = await this.registryFetcher.fetch<any>(`${name}/data.json`);
      let entries: string[] = [];
      
      if (Array.isArray(data)) {
        entries = data.map(key => key.replace(/^minecraft:/, ''));
      } else if (data && typeof data === 'object' && 'entries' in data && data.entries) {
        for (const [key] of Object.entries(data.entries)) {
          entries.push(key.replace(/^minecraft:/, ''));
        }
      }
      
      entries.sort();
      this.cachedRegistries.set(name, entries);
      return entries;
    } catch {
      return [];
    }
  }

  async clearCache(): Promise<void> {
    this.cachedRegistries.clear();
    await this.commandTree.clearCache();
  }
}