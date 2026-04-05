import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';

export interface HoverContext {
  text: string;
  line: number;
  character: number;
}

export interface HoverResult {
  contents: MarkupContent[];
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface MarkupContent {
  kind: 'markdown' | 'plaintext';
  value: string;
}

export interface HoverOptions {
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
  permissions?: {
    type: string;
    permission?: {
      type: string;
      level?: string;
    };
  };
}

const COMMAND_DOCS: Record<string, string> = {
  '/give': 'Give items to a player\nUsage: /give <targets> <item> [amount]',
  '/tell': 'Send a private message to a player\nUsage: /tell <targets> <message>',
  '/title': 'Display titles to players\nUsage: /title <targets> <subcommand>',
  '/effect': 'Give or remove status effects\nUsage: /effect <targets> <effect> [seconds] [amplifier]',
  '/enchant': 'Enchant items\nUsage: /enchant <targets> <enchantment> [level]',
  '/execute': 'Execute a command conditionally\nUsage: /execute <subcommand> <value> <command>',
  '/fill': 'Fill an area with blocks\nUsage: /fill <from> <to> <block> [destroy|hollow|keep|outline|replace]',
  '/setblock': 'Set a block\nUsage: /setblock <position> <block> [destroy|keep|replace]',
  '/summon': 'Summon an entity\nUsage: /summon <entity> [position] [nbt]',
  '/kill': 'Kill entities\nUsage: /kill [targets]',
  '/clear': 'Clear items from inventory\nUsage: /clear <targets> [item] [maxCount]',
  '/tp': 'Teleport entities\nUsage: /tp [targets] <destination>',
  '/teleport': 'Teleport entities\nUsage: /teleport <targets> <destination>',
  '/time': 'Change the time\nUsage: /time <set|add|query> <value>',
  '/weather': 'Set weather\nUsage: /weather <clear|rain|thunder> [duration]',
  '/gamerule': 'Set game rules\nUsage: /gamerule <rule> [value]',
  '/difficulty': 'Set game difficulty\nUsage: /difficulty <peaceful|easy|normal|hard>',
  '/scoreboard': 'Manage scoreboard objectives\nUsage: /scoreboard <objectives|players|teams>',
  '/team': 'Manage teams\nUsage: /team <add|empty|join|leave|list|modify|remove>',
  '/data': 'Modify NBT data\nUsage: /data <merge|get|modify|remove> <target>',
  '/particle': 'Create particles\nUsage: /particle <name> <pos> [count] [speed]',
  '/playsound': 'Play a sound\nUsage: /playsound <sound> <targets> [pos] [volume] [pitch]',
  '/stopsound': 'Stop sounds\nUsage: /stopsound <targets> [sound]',
  '/spawnpoint': 'Set spawn point\nUsage: /spawnpoint <targets> [pos]',
  '/bossbar': 'Manage boss bars\nUsage: /bossbar <add|get|list|remove|set>',
  '/clone': 'Clone blocks\nUsage: /clone <from> <to> <destination> [masked|replace]',
  '/datapack': 'Manage data packs\nUsage: /datapack <disable|enable|list|load>',
  '/function': 'Run functions\nUsage: /function <name> [if|unless]',
  '/recipe': 'Manage recipes\nUsage: /recipe <give|take> <targets> [recipe]',
};

export class HoverProvider {
  private fetcher: DataFetcher;
  private commandTree: Map<string, CommandNode> = new Map();

  constructor(options: HoverOptions = {}) {
    this.fetcher = new DataFetcher({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: options.version || 'summary',
    });
  }

  async getHover(context: HoverContext): Promise<HoverResult | null> {
    const text = context.text.trim();
    
    if (!text.startsWith('/')) {
      return null;
    }
    
    const parts = text.slice(1).split(/\s+/).filter(p => p.length > 0);
    
    if (parts.length === 0) {
      return null;
    }
    
    const commandName = parts[0];
    const docs = COMMAND_DOCS[commandName] || COMMAND_DOCS['/' + commandName];
    
    if (docs) {
      const startChar = text.indexOf(parts[parts.length - 1]);
      return {
        contents: [{ kind: 'markdown', value: docs }],
        range: {
          start: { line: context.line, character: startChar },
          end: { line: context.line, character: startChar + parts[parts.length - 1].length },
        },
      };
    }
    
    return null;
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