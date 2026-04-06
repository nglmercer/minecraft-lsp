import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { type Diagnostic, DiagnosticSeverity } from '../core/Types';

@customElement('minecraft-diagnostics')
export class MinecraftDiagnostics extends LitElement {
  @property({ type: Array })
  diagnostics: Diagnostic[] = [];

  @state()
  private x = 0;

  @state()
  private y = 0;

  @state()
  private visible = false;

  static override styles = css`
    :host {
      display: block;
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    .tooltip {
      background: rgba(30, 30, 30, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid #444;
      border-radius: 8px;
      padding: 10px 14px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6);
      max-width: 320px;
      transform: translateY(-10px);
      opacity: 0;
      transition: all 0.2s cubic-bezier(0, 0, 0.2, 1);
    }

    .tooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .diagnostic-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
    }

    .diagnostic-item:last-child {
      margin-bottom: 0;
    }

    .diag-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .diag-message {
      font-size: 13px;
      color: #eeeeee;
      line-height: 1.5;
    }

    .type-error .diag-icon { color: #f44336; }
    .type-error { border-left: 4px solid #f44336; padding-left: 10px; }
    
    .type-warning .diag-icon { color: #ff9800; }
    .type-warning { border-left: 4px solid #ff9800; padding-left: 10px; }
    
    .type-info .diag-icon { color: #2196f3; }
    .type-info { border-left: 4px solid #2196f3; padding-left: 10px; }
  `;

  /**
   * Update the position and show the diagnostics
   */
  public updateDiagnostics(diagnostics: Diagnostic[], anchorRect?: DOMRect) {
    this.diagnostics = diagnostics;
    this.visible = diagnostics.length > 0;

    if (anchorRect) {
      // Position above the input
      this.x = anchorRect.left;
      this.y = anchorRect.top - 10;
    }
  }

  override render() {
    return html`
      <div 
        class="tooltip ${this.visible ? 'visible' : ''}"
        style="position: fixed; left: ${this.x}px; top: ${this.y}px; transform: translateY(-100%);"
      >
        ${this.diagnostics.map(d => html`
          <div class="diagnostic-item ${this.getTypeClass(d.severity)}">
            <span class="diag-icon">${this.getIcon(d.severity)}</span>
            <span class="diag-message">${d.message}</span>
          </div>
        `)}
      </div>
    `;
  }

  private getTypeClass(severity: DiagnosticSeverity): string {
    switch (severity) {
      case DiagnosticSeverity.Error: return 'type-error';
      case DiagnosticSeverity.Warning: return 'type-warning';
      default: return 'type-info';
    }
  }

  private getIcon(severity: DiagnosticSeverity): string {
    switch (severity) {
      case DiagnosticSeverity.Error: return '✕';
      case DiagnosticSeverity.Warning: return '⚠';
      default: return 'ℹ';
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'minecraft-diagnostics': MinecraftDiagnostics;
  }
}
