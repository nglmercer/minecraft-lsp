import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';

export interface CompletionItem {
  label: string;
  kind?: CompletionKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  filterText?: string;
  command?: string;
  arguments?: CompletionArgument[];
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface CompletionArgument {
  name: string;
  parser: string;
  properties?: Record<string, any>;
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

interface CommandNode {
  type: string;
  children?: Record<string, CommandNode>;
  executable?: boolean;
  parser?: string;
  properties?: Record<string, any>;
  redirect?: string[];
  permission?: {
    type: string;
    permission?: {
      type: string;
      level?: string;
    };
  };
}

interface ParsedCommand {
  name: string;
  description: string;
  node: CommandNode;
  path?: string[];
}

const PARSER_REGISTRIES: Record<string, string> = {
  'minecraft:entity': 'entity_type',
  'minecraft:entity_summon': 'entity_type',
  'minecraft:game_profile': 'entity_type',
  'minecraft:item_predicate': 'item',
  'minecraft:item_stack': 'item',
  'minecraft:block_pos': 'dimension',
  'minecraft:resource_location': 'worldgen/biome',
  'minecraft:nbt_path': 'attribute',
  'minecraft:particle': 'particle_type',
  'minecraft:mob': 'entity_type',
  'minecraft:recipe': 'recipe_type',
  'minecraft:sound': 'sound_event',
  'minecraft:potion': 'potion',
  'minecraft:enchantment': 'enchantment',
};

const PARSER_SUGGESTIONS: Record<string, string[]> = {
  'brigadier:bool': ['true', 'false'],
  'brigadier:float': ['0.0'],
  'brigadier:integer': ['0'],
};

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
    // Registries usually reside in registries branch under <name>/data.json
    this.registryFetcher = new DataFetcher({
        cacheProvider: options.cacheProvider,
        baseUrl: options.baseUrl,
        version: 'registries' // Always use registries branch for registry data
    });
  }

  async getEntities(): Promise<string[]> {
    return this.loadRegistry('entity_type');
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
    
    // Command parts before cursor
    const rawParts = textBeforeCursor.startsWith('/') 
      ? textBeforeCursor.slice(1).split(/\s+/)
      : textBeforeCursor.split(/\s+/);
      
    const parts = rawParts.filter((p, i) => i < rawParts.length - 1 || p.length > 0);
    const currentIndex = rawParts.length - 1;
    const currentPart = rawParts[currentIndex] || '';
    
    // If we're at the very beginning and there's no slash, this is probably not a command context
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
    const items: CompletionItem[] = [];
    
    let currentNode: CommandNode | undefined;
    let commandName = parts[0];
    
    if (commands.has(commandName!)) {
      let rootNode = commands.get(commandName!)!.node;
      currentNode = rootNode;
      
      for (let i = 1; i < currentIndex && currentNode; i++) {
        const part = parts[i];
        if (!part) break;
        
        let nextNode: CommandNode | undefined;
        
        if (currentNode.children && currentNode.children[part]) {
          nextNode = currentNode.children[part];
        } else if (currentNode.children) {
          for (const [childName, childNode] of Object.entries(currentNode.children)) {
            if (childNode.type === 'literal' && childName.toLowerCase().startsWith(part.toLowerCase())) {
              nextNode = childNode;
              break;
            }
          }
          
          // If no literal match, follow the first argument node found
          if (!nextNode) {
            for (const node of Object.values(currentNode.children)) {
              if (node.type === 'argument') {
                nextNode = node;
                break;
              }
            }
          }
        }
        
        if (nextNode) {
          if (nextNode.redirect || (nextNode.type === 'literal' && part === 'run')) {
            // Redirect! Reset root and currentNode to follow the redirect.
            // Misode/mcmeta data uses an array for redirect paths, e.g., ["execute"] or [""]
            const redirectTarget = nextNode.redirect?.[0];
            
            if (redirectTarget && redirectTarget !== "" && commands.has(redirectTarget)) {
                const targetCmd = commands.get(redirectTarget)!;
                rootNode = targetCmd.node;
                currentNode = rootNode;
                commandName = redirectTarget;
                // No i++ here, the next loop iteration will process parts[i+1] against this new root
            } else {
                // Redirect to global root (top-level commands)
                const nextPart = parts[i + 1];
                if (nextPart && commands.has(nextPart)) {
                    const targetCmd = commands.get(nextPart)!;
                    rootNode = targetCmd.node;
                    currentNode = rootNode;
                    commandName = nextPart;
                    // Since we're jumping to the next word as a command name, we skip it
                    i++;
                } else if (i === currentIndex - 1) {
                    // We are at the end of the redirect, return all top-level commands
                    return this.getTopLevelCommands(commands, true, currentPart);
                } else {
                    // Path broken
                    currentNode = undefined;
                    break;
                }
            }
          } else {
            currentNode = nextNode;
          }
        } else {
          currentNode = undefined;
          break;
        }
      }
    }
    
    if (!currentNode || !currentNode.children) {
      return this.getTopLevelCommands(commands, true, currentPart);
    }
    
    const isPartial = currentPart !== '';
    
    for (const [name, node] of Object.entries(currentNode.children)) {
      if (node.type === 'literal') {
        if (isPartial && !name.toLowerCase().startsWith(currentPart.toLowerCase())) {
          continue;
        }
        items.push({
          label: name,
          kind: CompletionKind.Keyword,
          insertText: name + ' ',
          command: commandName,
        });
      } else if (node.type === 'argument') {
        const parser = node.parser || 'unknown';
        
        // Target Selector support
        if (currentPart.startsWith('@') && parser.includes('entity')) {
          const selectors = ['@p', '@a', '@r', '@e', '@s'];
          for (const selector of selectors) {
            if (selector.startsWith(currentPart)) {
              items.push({
                label: selector,
                kind: CompletionKind.Variable,
                insertText: selector + ' ',
                command: commandName,
              });
            }
          }
          continue; // Don't show registry items if typing selector
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
      }
    }
    
    return items.sort((a, b) => a.label.localeCompare(b.label));
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
      return this.loadRegistry('entity_type');
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
      // Registries in misode/mcmeta registries branch are frequently just a string array
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
    } catch (e) {
      console.error(`Failed to load registry ${name}:`, e);
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
          if (node.type === 'literal') {
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