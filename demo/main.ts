import { CompletionProvider, ValidationProvider } from '../src/index.ts';
import '../src/components/MinecraftAutocomplete.ts';
import '../src/components/MinecraftDiagnostics.ts';
import { MinecraftAutocomplete } from '../src/components/MinecraftAutocomplete.ts';
import { MinecraftDiagnostics } from '../src/components/MinecraftDiagnostics.ts';

const provider = new CompletionProvider();
const validator = new ValidationProvider();
const editor = document.getElementById('editor') as MinecraftAutocomplete;
const diagHost = document.getElementById('diagnostics') as MinecraftDiagnostics;

if (editor){
    // Set the providers
    editor.provider = provider;
    editor.validator = validator;
    
    // Sync the diagnostics to the separate component with positioning
    if (diagHost) {
        editor.addEventListener('diagnostics-changed', (e: Event) => {
            const detail = (e as CustomEvent).detail;
            diagHost.updateDiagnostics(detail.diagnostics, detail.inputRect);
        });
    }
    
    editor.addEventListener('suggestion-selected', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        console.log('Selected:', detail.item.label);
    });
    
    editor.addEventListener('change', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.diagnostics && detail.diagnostics.length > 0) {
            console.warn('Diagnostics:', detail.diagnostics);
        }
    });
}
