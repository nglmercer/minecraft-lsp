import { CompletionProvider, ValidationProvider } from '../src/index.ts';
import '../src/components/MinecraftAutocomplete.ts';
import { MinecraftAutocomplete } from '../src/components/MinecraftAutocomplete.ts';

const provider = new CompletionProvider();
const validator = new ValidationProvider();
const editor = document.getElementById('editor') as MinecraftAutocomplete;

if (editor){
    // Set the providers
    editor.provider = provider;
    editor.validator = validator;
    
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
