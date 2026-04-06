import { LitElement, html, css, type PropertyValueMap } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { type CompletionItem, CompletionKind, type Diagnostic, DiagnosticSeverity } from '../core/Types';

/**
 * Interface for the autocomplete provider.
 */
export interface AutocompleteProvider {
  getCompletions(context: {
    line: number;
    character: number;
    text: string;
    lineText: string;
    triggerCharacter?: string;
  }): Promise<CompletionItem[]>;
}

/**
 * Interface for the validation provider.
 */
export interface ValidatorProvider {
  validate(context: {
    text: string;
    line: number;
    character: number;
  }): Promise<Diagnostic[]>;
}

@customElement('minecraft-autocomplete')
export class MinecraftAutocomplete extends LitElement {
  @property({ type: Object })
  provider?: AutocompleteProvider;

  @property({ type: Object })
  validator?: ValidatorProvider;

  @property({ type: String })
  value = '';

  @property({ type: String })
  placeholder = 'Type / to start a command...';

  @state()
  private suggestions: CompletionItem[] = [];

  @state()
  private diagnostics: Diagnostic[] = [];

  @state()
  private ghostText = '';

  @state()
  private selectedIndex = -1;

  @state()
  private showSuggestions = false;

  @query('#input')
  private inputElement?: HTMLInputElement;

  @query('.suggestions-list')
  private suggestionsList?: HTMLElement;

  static override styles = css`
    :host {
      display: inline-block;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      width: 100%;
      position: relative;
    }

    .container {
      position: relative;
      background: rgba(30, 30, 30, 0.5);
      backdrop-filter: blur(8px);
      border: 2px solid #333;
      border-radius: 8px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      transition: all 0.2s ease;
    }

    .container:focus-within {
      border-color: #555;
    }

    .container.has-error {
      border-color: #f44336;
    }

    .container.has-warning {
      border-color: #ff9800;
    }

    input {
      background: transparent;
      border: none;
      color: #e0e0e0;
      font-size: 14px;
      padding: 8px;
      outline: none;
      width: 100%;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      position: relative;
      z-index: 2;
    }

    .editor-layer {
        position: relative;
        width: 100%;
    }

    .ghost-text {
        position: absolute;
        top: 0;
        left: 0;
        padding: 8px;
        font-size: 14px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        color: rgba(255, 255, 255, 0.3);
        pointer-events: none;
        white-space: pre;
        z-index: 1;
    }

    .suggestions-list {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: rgba(37, 37, 38, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid #3c3c3c;
      border-top: none;
      max-height: 300px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
      display: none;
      scrollbar-width: thin;
      scrollbar-color: #444 #252526;
    }

    .suggestions-list.active {
      display: block;
    }

    .suggestion-item {
      padding: 6px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #cccccc;
      transition: background 0.15s ease;
    }

    .suggestion-item:hover, .suggestion-item.selected {
      background: #2a2d2e;
      color: #ffffff;
    }

    .suggestion-item.selected {
      background: #094771;
      box-shadow: inset 0 0 8px rgba(255, 255, 255, 0.1);
    }

    .kind-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      border-radius: 3px;
      flex-shrink: 0;
    }

    /* Minecraft Kind Colors */
    .kind-function { background: #ffd700; color: #000; } /* Yellow */
    .kind-keyword { background: #569cd6; color: #fff; } /* Blue/Cyan */
    .kind-variable { background: #9cdcfe; color: #000; } /* Light Blue */
    .kind-value { background: #ce9178; color: #fff; } /* Brown/Orange */
    .kind-reference { background: #4ec9b0; color: #000; } /* Teal */
    .kind-struct { background: #dcdcaa; color: #000; } /* Yellowish */
    .kind-enum { background: #b5cea8; color: #000; } /* Green */
    .kind-enum-member { background: #4fc1ff; color: #000; } /* Cyan */

    .suggestion-label {
      flex-grow: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .suggestion-detail {
      font-size: 11px;
      color: #888888;
      font-style: italic;
    }

    .suggestion-doc {
      font-size: 11px;
      color: #666;
      border-top: 1px solid #333;
      padding: 4px 12px;
      background: #1e1e1e;
    }

    /* Scrollbar Styling */
    .suggestions-list::-webkit-scrollbar {
      width: 6px;
    }
    .suggestions-list::-webkit-scrollbar-track {
      background: #1e1e1e;
    }
    .suggestions-list::-webkit-scrollbar-thumb {
      background: #444;
      border-radius: 3px;
    }
    .suggestions-list::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  `;

  override render() {
    const worstSeverity = this.diagnostics.length > 0 
      ? Math.min(...this.diagnostics.map(d => d.severity))
      : null;

    return html`
      <div class="container ${worstSeverity === DiagnosticSeverity.Error ? 'has-error' : worstSeverity === DiagnosticSeverity.Warning ? 'has-warning' : ''}">
        <div class="editor-layer">
          <div class="ghost-text">${this.ghostText}</div>
          <input
            id="input"
            type="text"
            .value="${this.value}"
            placeholder="${this.placeholder}"
            @input="${() => this.handleInput()}"
            @keydown="${this.handleKeyDown}"
            @blur="${this.handleBlur}"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        
        <div class="suggestions-list ${this.showSuggestions && this.suggestions.length > 0 ? 'active' : ''}">
          ${this.suggestions.map((item, index) => html`
            <div
              class="suggestion-item ${index === this.selectedIndex ? 'selected' : ''}"
              @mousedown="${(e: MouseEvent) => { e.preventDefault(); this.selectSuggestion(item); }}"
            >
              <div class="kind-icon ${this.getKindClass(item.kind)}">
                ${this.getKindChar(item.kind)}
              </div>
              <div class="suggestion-content" style="display: flex; flex-direction: column; flex-grow: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="suggestion-label">${item.label}</span>
                  ${item.detail ? html`<span class="suggestion-detail">${item.detail}</span>` : ''}
                </div>
                ${item.documentation ? html`<div class="suggestion-doc">${item.documentation}</div>` : ''}
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private getKindClass(kind?: CompletionKind): string {
    switch (kind) {
      case CompletionKind.Function: return 'kind-function';
      case CompletionKind.Keyword: return 'kind-keyword';
      case CompletionKind.Variable: return 'kind-variable';
      case CompletionKind.Value: return 'kind-value';
      case CompletionKind.Reference: return 'kind-reference';
      case CompletionKind.Struct: return 'kind-struct';
      case CompletionKind.Enum: return 'kind-enum';
      case CompletionKind.EnumMember: return 'kind-enum-member';
      default: return 'kind-variable';
    }
  }

  private getKindChar(kind?: CompletionKind): string {
    switch (kind) {
      case CompletionKind.Function: return 'ƒ';
      case CompletionKind.Keyword: return 'k';
      case CompletionKind.Variable: return 'v';
      case CompletionKind.Value: return 'val';
      case CompletionKind.Reference: return 'r';
      case CompletionKind.Struct: return 's';
      case CompletionKind.Enum: return 'e';
      case CompletionKind.EnumMember: return 'm';
      default: return 'v';
    }
  }

  private async handleInput(e?: InputEvent) {
    const value = this.inputElement?.value ?? this.value;
    this.value = value;
    
    const cursorPosition = this.inputElement?.selectionStart || 0;

    // Autocomplete
    if (this.provider && this.value.length > 0) {
      const context = {
        line: 0,
        character: cursorPosition,
        text: this.value,
        lineText: this.value,
        triggerCharacter: e?.data || undefined
      };

      try {
        this.suggestions = await this.provider.getCompletions(context);
        this.showSuggestions = this.suggestions.length > 0;
        this.selectedIndex = this.suggestions.length > 0 ? 0 : -1;
        
        // Update ghost text
        if (this.suggestions.length > 0 && this.suggestions[0]) {
            const first = this.suggestions[0];
            const label = typeof first.label === 'string' ? first.label : '';
            const currentWord = this.value.substring(this.value.lastIndexOf(' ') + 1);
            if (label.toLowerCase().startsWith(currentWord.toLowerCase())) {
                this.ghostText = this.value + label.substring(currentWord.length);
            } else {
                this.ghostText = '';
            }
        } else {
            this.ghostText = '';
        }
      } catch (error) {
        console.error('Failed to get completions:', error);
        this.suggestions = [];
        this.showSuggestions = false;
      }
    } else {
      this.suggestions = [];
      this.showSuggestions = false;
    }

    // Validation
    if (this.validator && this.value.length > 0) {
        try {
            this.diagnostics = await this.validator.validate({
                text: this.value,
                line: 0,
                character: cursorPosition
            });
        } catch (error) {
            console.error('Validation failed:', error);
            this.diagnostics = [];
        }
    } else {
        this.diagnostics = [];
    }

    this.dispatchEvent(new CustomEvent('change', {
        detail: { value: this.value, diagnostics: this.diagnostics },
        bubbles: true,
        composed: true
    }));

    this.dispatchEvent(new CustomEvent('diagnostics-changed', {
        detail: { 
            diagnostics: this.diagnostics,
            inputRect: this.inputElement?.getBoundingClientRect()
        },
        bubbles: true,
        composed: true
    }));
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.showSuggestions || this.suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
        this.scrollToSelected();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + this.suggestions.length) % this.suggestions.length;
        this.scrollToSelected();
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        const selectedItem = this.suggestions[this.selectedIndex];
        if (this.selectedIndex >= 0 && selectedItem) {
          this.selectSuggestion(selectedItem);
        }
        break;
      case 'Escape':
        this.showSuggestions = false;
        break;
    }
  }

  private handleBlur() {
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  private selectSuggestion(item: CompletionItem) {
    const cursorPosition = this.inputElement?.selectionStart || 0;
    const textBeforeCursor = this.value.substring(0, cursorPosition);
    const textAfterCursor = this.value.substring(cursorPosition);
    
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const startIndex = lastSpaceIndex === -1 ? 0 : lastSpaceIndex + 1;
    
    const textBeforeWord = this.value.substring(0, startIndex);
    const insertText = item.insertText || item.label;
    
    this.value = textBeforeWord + insertText + textAfterCursor;
    
    this.showSuggestions = false;
    this.selectedIndex = -1;
    
    if (this.inputElement) {
        this.inputElement.focus();
        const newCursorPos = startIndex + insertText.length;
        setTimeout(() => {
          this.inputElement!.setSelectionRange(newCursorPos, newCursorPos);
          // Trigger input handler to refresh suggestions and validation
          this.handleInput();
        }, 0);
    }

    this.dispatchEvent(new CustomEvent('suggestion-selected', {
      detail: { item, value: this.value },
      bubbles: true,
      composed: true
    }));
  }

  private scrollToSelected() {
    if (!this.suggestionsList) return;
    const selectedElement = this.suggestionsList.querySelector('.selected') as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'minecraft-autocomplete': MinecraftAutocomplete;
  }
}
