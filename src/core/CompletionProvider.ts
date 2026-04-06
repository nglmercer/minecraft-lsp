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
import { 
  COMMANDS, 
  SELECTORS, 
  REGISTRIES, 
  PARSER_REGISTRIES, 
  PARSER_SUGGESTIONS 
} from './Constants';

export interface CompletionOptions {
  cacheProvider?: CacheProvider;
  baseUrl?: string;
  version?: string;
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
    
    if (analysis.type === 'command') {
      return this.getCommandCompletions(context, analysis);
    }
    
    return [];
  }

  private analyzeContext(context: CompletionContext): { 
    type: string; 
    parts: string[]; 
    currentIndex: number;
    currentPart: string;
  } {
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
          type: 'none',
          parts: [],
          currentIndex: 0,
          currentPart: ''
        };
    }
    
    return {
      type: 'command',
      parts: parts,
      currentIndex,
      currentPart
    };
  }

  private async getCommandCompletions(
    context: CompletionContext,
    analysis: { type: string; parts: string[]; currentIndex: number; currentPart: string }
  ): Promise<CompletionItem[]> {
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
    
    if (!traversal.currentNode || !traversal.currentNode.children) {
      return this.getTopLevelCommands(commands, true, currentPart);
    }
    
    return this.getNodeSuggestions(traversal.currentNode, traversal.commandName, currentPart);
  }

  private traversePath(
    commands: Map<string, ParsedCommand>,
    parts: string[],
    currentIndex: number
  ): { currentNode: CommandNode | undefined; commandName: string } {
    let commandName = parts[0] || '';
    let currentNode: CommandNode | undefined;
    
    if (!commands.has(commandName)) {
      return { currentNode: undefined, commandName };
    }

    currentNode = commands.get(commandName)!.node;
    
    for (let i = 1; i < currentIndex && currentNode; i++) {
      const part = parts[i];
      if (!part) break;
      
      const nextNode = this.findNextNode(currentNode, part);
      
      if (nextNode) {
        if (this.isRedirect(nextNode, part)) {
          const redirect = this.handleRedirect(commands, parts, i, currentIndex, nextNode);
          if (redirect) {
            currentNode = redirect.node;
            commandName = redirect.name;
            i = redirect.newIndex;
          } else {
            currentNode = undefined;
            break;
          }
        } else {
          currentNode = nextNode;
          if (currentNode.type === NodeType.Argument && currentNode.parser) {
              const consumed = this.getTokensConsumed(currentNode.parser);
              i += consumed - 1;
          }
        }
      } else {
        currentNode = undefined;
        break;
      }
    }

    return { currentNode, commandName };
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
      return Object.values(currentNode.children).find(node => node.type === NodeType.Argument);
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
    const redirectTarget = node.redirect?.[0];
    
    if (redirectTarget && redirectTarget !== "" && commands.has(redirectTarget)) {
        const targetCmd = commands.get(redirectTarget)!;
        return { node: targetCmd.node, name: redirectTarget, newIndex: i };
    }

    const nextPart = parts[i + 1];
    if (nextPart && commands.has(nextPart)) {
        const targetCmd = commands.get(nextPart)!;
        return { node: targetCmd.node, name: nextPart, newIndex: i + 1 };
    }

    return undefined;
  }

  private async getNodeSuggestions(
    node: CommandNode,
    commandName: string,
    currentPart: string
  ): Promise<CompletionItem[]> {
    if (!node.children) return [];

    const items: Promise<CompletionItem[]>[] = [];
    const isPartial = currentPart !== '';

    for (const [name, childNode] of Object.entries(node.children)) {
      if (childNode.type === NodeType.Literal) {
        items.push(Promise.resolve(this.getLiteralSuggestions(name, childNode, commandName, currentPart, isPartial)));
      } else if (childNode.type === NodeType.Argument) {
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

    if (currentPart.startsWith('@') && parser.includes('entity')) {
      for (const selector of SELECTORS) {
        if (selector.startsWith(currentPart)) {
          items.push({
            label: selector,
            kind: CompletionKind.Variable,
            insertText: selector + ' ',
            command: commandName,
          });
        }
      }
      return items;
    }

    const suggestions = await this.getSuggestionsForParser(parser, node.properties);
    
    if (suggestions.length > 0) {
      for (const suggestion of suggestions) {
        if (isPartial && !suggestion.toLowerCase().startsWith(currentPart.toLowerCase())) {
          continue;
        }
        items.push({
          label: suggestion,
          kind: this.getKindForParser(parser),
          insertText: suggestion + ' ',
          command: commandName,
        });
      }
    } else if (!isPartial) {
      items.push({
        label: `<${node.properties?.name || 'value'}>`,
        kind: CompletionKind.Variable,
        detail: parser.replace('minecraft:', '').replace('brigadier:', ''),
        insertText: '',
        command: commandName,
      });
    }

    return items;
  }

  private getTokensConsumed(parser: string): number {
    if (parser === 'minecraft:vec3' || parser === 'minecraft:block_pos') return 3;
    if (parser === 'minecraft:vec2' || parser === 'minecraft:rotation' || parser === 'minecraft:column_pos') return 2;
    return 1;
  }

  private getKindForParser(parser: string): CompletionKind {
    if (parser.includes('entity')) return CompletionKind.Reference;
    if (parser.includes('item')) return CompletionKind.Value;
    if (parser.includes('block')) return CompletionKind.Struct;
    if (parser.includes('sound')) return CompletionKind.Event;
    if (parser.includes('potion') || parser.includes('effect')) return CompletionKind.Enum;
    if (parser.includes('enchantment')) return CompletionKind.EnumMember;
    return CompletionKind.Variable;
  }

  private async getSuggestionsForParser(parser: string, properties?: Record<string, any>): Promise<string[]> {
    if (properties?.registry) {
      return this.loadRegistry(properties.registry.replace('minecraft:', ''));
    }

    if (parser === 'minecraft:entity_summon') {
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
    const descriptions: Record<string, string> = {
      'give': 'Give items to players',
      'take': 'Take items from players',
      'tell': 'Send a message to a player',
      'msg': 'Send a private message',
      'w': 'Send a private message',
      'title': 'Display titles to players',
      'effect': 'Give or remove effects',
      'enchant': 'Enchant items',
      'execute': 'Execute a command conditionally',
      'fill': 'Fill an area with blocks',
      'setblock': 'Set a block',
      'clone': 'Clone blocks',
      'summon': 'Summon entities',
      'kill': 'Kill entities',
      'clear': 'Clear items from inventory',
      'spawnpoint': 'Set spawn point',
      'gamerule': 'Set game rules',
      'difficulty': 'Set game difficulty',
      'time': 'Change the time',
      'weather': 'Set weather',
      'tp': 'Teleport entities',
      'teleport': 'Teleport entities',
      'particle': 'Spawn particles',
      'playsound': 'Play a sound',
      'stopsound': 'Stop sounds',
      'data': 'Modify NBT data',
      'scoreboard': 'Manage scoreboard',
      'team': 'Manage teams',
      'trigger': 'Trigger objectives',
    };
    
    return descriptions[name] || `/${name} command`;
  }

  async clearCache(): Promise<void> {
    this.cachedCommands.clear();
    this.cachedRegistries.clear();
    await this.fetcher.clearCache();
  }
}