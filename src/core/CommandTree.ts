import { type CacheProvider } from './Cache';
import { DataFetcher } from './Fetcher';
import { NodeType, type CommandNode, type ParsedCommand } from './Types';
import { validateArgument } from './Utils';
import { COMMANDS, COMMAND_DESCRIPTIONS, PARSERS, BRIGADIE_PARSERS } from './Constants';

export interface CommandTreeOptions {
  cacheProvider?: CacheProvider;
  baseUrl?: string;
  version?: string;
}

/**
 * Match mode for node traversal:
 * - 'prefix': partial matching for autocomplete (startsWith)
 * - 'exact': strict matching for validation (===)
 */
export type MatchMode = 'prefix' | 'exact';

/**
 * Shared service for loading, caching, and traversing the Minecraft command tree.
 * Used by both CompletionProvider and ValidationProvider to avoid duplicated logic.
 */
export class CommandTreeService {
  private fetcher: DataFetcher;
  private cachedCommands: Map<string, ParsedCommand> = new Map();

  constructor(options: CommandTreeOptions = {}) {
    this.fetcher = new DataFetcher({
      cacheProvider: options.cacheProvider,
      baseUrl: options.baseUrl,
      version: options.version || 'summary',
    });
  }

  /** Load and cache the full command tree from the data source */
  async loadCommands(): Promise<Map<string, ParsedCommand>> {
    if (this.cachedCommands.size > 0) {
      return this.cachedCommands;
    }

    try {
      const data = await this.fetcher.fetch<CommandNode>('commands/data.json');

      if (data?.children) {
        for (const [name, node] of Object.entries(data.children)) {
          if (node.type === NodeType.Literal) {
            const description = COMMAND_DESCRIPTIONS[name] || `/${name} command`;
            this.cachedCommands.set(name, { name, description, node });
          }
        }
      }
    } catch {
      // Return empty map on failure
    }

    return this.cachedCommands;
  }

  async clearCache(): Promise<void> {
    this.cachedCommands.clear();
    await this.fetcher.clearCache();
  }

  /**
   * Find the next matching child node from the current node.
   * 1. Exact key match
   * 2. Literal match (prefix or exact based on mode)
   * 3. First argument that validates
   */
  static findNextNode(
    currentNode: CommandNode,
    part: string,
    matchMode: MatchMode = 'exact'
  ): CommandNode | undefined {
    // 1. Direct key lookup
    if (currentNode.children?.[part]) {
      return currentNode.children[part];
    }

    if (currentNode.children) {
      // 2. Literal matching
      for (const [childName, childNode] of Object.entries(currentNode.children)) {
        if (childNode.type === NodeType.Literal) {
          const matches = matchMode === 'prefix'
            ? childName.toLowerCase().startsWith(part.toLowerCase())
            : childName.toLowerCase() === part.toLowerCase();
          if (matches) return childNode;
        }
      }

      // 3. Argument validation fallback
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

  /** Check if a node represents a redirect (explicit redirect or 'run' keyword) */
  static isRedirect(node: CommandNode, part: string): boolean {
    return !!node.redirect || (node.type === NodeType.Literal && part === COMMANDS.RUN);
  }

  /** Calculate how many tokens a given parser consumes */
  static getTokensConsumed(
    parser: string,
    properties?: Record<string, any>,
    remaining?: number
  ): number {
    if (parser === PARSERS.VEC3 || parser === PARSERS.BLOCK_POS) return 3;
    if (parser === PARSERS.VEC2 || parser === PARSERS.ROTATION || parser === PARSERS.COLUMN_POS) return 2;
    if (parser === PARSERS.MESSAGE || (parser === BRIGADIE_PARSERS.STRING && properties?.type === 'greedy')) {
      return remaining || 1;
    }
    return 1;
  }

  /**
   * Resolve a redirect by following the redirect path in the command tree.
   * Returns the target node and its root command name, or undefined if unresolvable.
   */
  static resolveRedirectPath(
    commands: Map<string, ParsedCommand>,
    node: CommandNode
  ): { node: CommandNode; name: string } | undefined {
    const redirect = node.redirect as any;
    if (!redirect) return undefined;

    const path = Array.isArray(redirect) ? redirect : [redirect];
    const rootName = path[0];
    const targetCmd = commands.get(rootName);

    if (targetCmd) {
      let current: CommandNode = targetCmd.node;
      for (let j = 1; j < path.length && current; j++) {
        const nextKey = path[j];
        current = current.children?.[nextKey] as CommandNode;
      }
      if (current) {
        return { node: current, name: rootName };
      }
    }

    return undefined;
  }

  /** Look up a command by name and return its root node */
  static findCommandByName(
    commands: Map<string, ParsedCommand>,
    name: string
  ): { node: CommandNode; name: string } | undefined {
    const cmd = commands.get(name);
    if (cmd) return { node: cmd.node, name };
    return undefined;
  }
}
