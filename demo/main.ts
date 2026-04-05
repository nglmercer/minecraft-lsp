import { CompletionProvider } from '../src/index.ts';
import '../src/components/MinecraftAutocomplete.ts';
import { MinecraftAutocomplete } from '../src/components/MinecraftAutocomplete.ts';

const provider = new CompletionProvider();
const editor = document.getElementById('editor') as MinecraftAutocomplete;
if (editor){

    // Set the provider (LSP agnostic, only needs getCompletions method)
    editor.provider = provider;
    
    editor.addEventListener('suggestion-selected', (e: CustomEvent) => {
        console.log('Selected:', e.detail.item);
    });
    
    editor.addEventListener('change', (e) => {
        console.log('Value changed:', e.detail.value);
    });
}
