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

export enum NodeType {
  Literal = 'literal',
  Argument = 'argument',
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface CommandNode {
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

export interface ParsedCommand {
  name: string;
  description: string;
  node: CommandNode;
  path?: string[];
}

export interface CompletionItem {
  label: string;
  kind?: CompletionKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  filterText?: string;
  command?: string;
  arguments?: CompletionArgument[];
  range?: Range;
}

export interface CompletionArgument {
  name: string;
  parser: string;
  properties?: Record<string, any>;
}

export interface CompletionContext {
  line: number;
  character: number;
  text: string;
  lineText: string;
  triggerCharacter?: string;
}

export interface HoverContext {
  text: string;
  line: number;
  character: number;
}

export interface HoverResult {
  contents: MarkupContent[];
  range?: Range;
}

export interface MarkupContent {
  kind: 'markdown' | 'plaintext';
  value: string;
}

export interface Diagnostic {
  range: Range;
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
