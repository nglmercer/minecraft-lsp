import { CompletionProvider } from '../src/index.ts';
import '../src/components/MinecraftAutocomplete.ts';
import { MinecraftAutocomplete } from '../src/components/MinecraftAutocomplete.ts';

const provider = new CompletionProvider();
const editor = document.getElementById('editor') as MinecraftAutocomplete;
if (editor){

    // Set the provider (LSP agnostic)
    editor.provider = provider;

    // Demonstrate getting entities from cache
    provider.getEntities().then(entities => {
      console.log('Available entities:', entities.length);
    });
    
    editor.addEventListener('suggestion-selected', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        console.log('Selected:', detail.item);
    });
    
    editor.addEventListener('change', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        console.log('Value changed:', detail.value);
    });
}
