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
import { REGISTRIES, SELECTORS, COMMANDS, PARSER_SUGGESTIONS, PARSER_REGISTRIES, COMMAND_DESCRIPTIONS, PARSERS, BRIGADIE_PARSERS, PARSER_KINDS } from './Constants';
import { validateArgument } from './Utils';

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

export interface ContextAnalysis {
  type: AnalysisType;
  parts: string[];
  currentIndex: number;
  currentPart: string;
}

export class CompletionProvider {
  private fetcher: DataFetcher;
  private registryFetcher: DataFetcher; 
  private cachedCommands: Map<string, ParsedCommand> = new Map();
  private cachedRegistries: Map<string, string[]> = new Map();
  private version: string;

  constructor(options: CompletionOptions = {}) {
    this.version = options.version || 'summary';
    this.fetcher = new DataFetcher({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: this.version,
    });
    
    // Add a dedicated fetcher for registries using the registries branch
    this.registryFetcher = new DataFetcher({
        cacheProvider: options.cacheProvider,
        baseUrl: options.baseUrl,
        version: 'registries'
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
    const commands = await this.loadCommandTree();
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
    if (currentNode && currentNode.redirect) {
        const redirect = this.handleRedirect(commands, parts, 0, currentIndex, currentNode);
        if (redirect) {
            currentNode = redirect.node;
            commandName = redirect.name;
        }
    }
    
    for (let i = 1; i < currentIndex && currentNode; i++) {
      const part = parts[i] || '';
      const nextNode = this.findNextNode(currentNode, part);
      
      if (nextNode) {
        if (this.isRedirect(nextNode, part)) {
          const redirect = this.handleRedirect(commands, parts, i, currentIndex, nextNode);
          if (redirect) {
            currentNode = redirect.node;
            commandName = redirect.name;
            i = redirect.newIndex;
          } else if (part === 'run' || nextNode.redirect?.[0] === 'execute') {
            // It directed to root or back to execute, if nothing followed, return undefined to trigger top-level
            return undefined;
          }
        } else {
            if (nextNode.type === NodeType.Argument && nextNode.parser) {
                const consumed = this.getTokensConsumed(nextNode.parser, nextNode.properties, parts.length - i);
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

  private findNextNode(currentNode: CommandNode, part: string): CommandNode | undefined {
    if (currentNode.children && currentNode.children[part]) {
      return currentNode.children[part];
    } 
    
    if (currentNode.children) {
      for (const [childName, childNode] of Object.entries(currentNode.children)) {
        if (childNode.type === NodeType.Literal && childName.toLowerCase().startsWith(part.toLowerCase())) {
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
    return !!node.redirect || (node.type === NodeType.Literal && part === COMMANDS.RUN);
  }

  private handleRedirect(
    commands: Map<string, ParsedCommand>,
    parts: string[],
    i: number,
    currentIndex: number,
    node: CommandNode
  ): { node: CommandNode; name: string; newIndex: number } | undefined {
    const redirect = node.redirect as any;
    if (redirect) {
        const path = Array.isArray(redirect) ? redirect : [redirect];
        const rootName = path[0];
        const targetCmd = commands.get(rootName);
        if (targetCmd) {
            let current = targetCmd.node;
            for (let j = 1; j < path.length && current; j++) {
                const nextKey = path[j];
                current = current.children?.[nextKey] as CommandNode;
            }
            if (current) {
                return { node: current, name: rootName, newIndex: i };
            }
        }
    }

    const nextPart = parts[i + 1];
    if (nextPart && commands.has(nextPart)) {
        const targetCmd = commands.get(nextPart)!;
        return { node: targetCmd.node, name: nextPart, newIndex: i + 1 };
    }

    // Default: if it's a redirect to root (like 'run' at the end of parts)
    return undefined;
  }

  private async getNodeSuggestions(
    node: CommandNode,
    commandName: string,
    currentPart: string
  ): Promise<CompletionItem[]> {
    const redirect = node.redirect as any;
    if (redirect) {
        const path = Array.isArray(redirect) ? redirect : [redirect];
        const rootName = path[0];
        
        // We need to get the tree from the provider's commands map
        const commands = await this.loadCommandTree();
        const targetCmd = commands.get(rootName);
        if (targetCmd) {
            let current = targetCmd.node;
            for (let j = 1; j < path.length && current; j++) {
                const nextKey = path[j];
                current = current.children?.[nextKey] as CommandNode;
            }
            if (current) {
                return this.getNodeSuggestions(current, commandName, currentPart);
            }
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
    node: CommandNode,
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

    const isEntity = parser.includes('entity') || 
                     parser.includes('game_profile') || 
                     parser.includes('mob') || 
                     parser.includes('player') || 
                     parser.includes('selector') ||
                     parser.includes('score_holder') ||
                     parser.includes('target');
    
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
      
      // If we already matched a selector and it's not partial, we can return early or keep going
      // Usually we want to show BOTH selectors and entities
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

  private getTokensConsumed(parser: string, properties?: Record<string, any>, remaining?: number): number {
    if (parser === PARSERS.VEC3 || parser === PARSERS.BLOCK_POS) return 3;
    if (parser === PARSERS.VEC2 || parser === PARSERS.ROTATION || parser === PARSERS.COLUMN_POS) return 2;
    if (parser === PARSERS.MESSAGE || (parser === BRIGADIE_PARSERS.STRING && properties?.type === 'greedy')) {
        return remaining || 1;
    }
    return 1;
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

  private async loadCommandTree(): Promise<Map<string, ParsedCommand>> {
    if (this.cachedCommands.size > 0) {
      return this.cachedCommands;
    }
    
    try {
      const data = await this.fetcher.fetch<CommandNode>('commands/data.json');
      
      if (data?.children) {
        for (const [name, node] of Object.entries(data.children)) {
          if (node.type === NodeType.Literal) {
            const description = this.getCommandDescription(name, node);
            this.cachedCommands.set(name, { name, description, node });
          }
        }
      }
    } catch {
      // Return empty map
    }
    
    return this.cachedCommands;
  }

  private getCommandDescription(name: string, node: CommandNode): string {
    return COMMAND_DESCRIPTIONS[name] || `/${name} command`;
  }

  async clearCache(): Promise<void> {
    this.cachedCommands.clear();
    this.cachedRegistries.clear();
    await this.fetcher.clearCache();
  }
}