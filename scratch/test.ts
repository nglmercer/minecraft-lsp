import { DataFetcher } from '../src/core/Fetcher';

async function main() {
  const fetcher = new DataFetcher();
  
  console.log('Fetching blocks/data.json from misode/mcmeta...');
  try {
    // mcmeta summary branch usually has blocks/data.json
    const data = await fetcher.fetch('blocks/data.json');
    console.log('Successfully fetched blocks data!');
    
    // Log array length or objects keys to show it works
    if (Array.isArray(data)) {
        console.log(`Number of blocks: ${data.length}`);
    } else {
        console.log(`Number of blocks: ${Object.keys(data as object).length}`);
    }
  } catch(e) {
    console.error('Failed:', e);
  }
}

main();
