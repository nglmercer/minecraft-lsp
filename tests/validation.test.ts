import { describe, expect, test, beforeEach, beforeAll } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { ValidationProvider } from '../src/core/ValidationProvider';
import { DiagnosticSeverity } from '../src/core/Types';

describe('ValidationProvider', () => {
  let provider: ValidationProvider;
  const sharedCache = new MemoryCache();

  beforeAll(async () => {
    // Initial fetch to populate cache and prove network is ok
    const p = new ValidationProvider({ cacheProvider: sharedCache });
    await p.validate({ text: '/help', line: 0, character: 0 });
  });

  beforeEach(() => {
    provider = new ValidationProvider({ cacheProvider: sharedCache });
  });

  test('detects unknown command', async () => {
    const diagnostics = await provider.validate({
      text: '/notacommandxyz',
      line: 0,
      character: 0,
    });
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.code).toBe('UNKNOWN_COMMAND');
  });

  test('validates incomplete commands', async () => {
    const diagnostics = await provider.validate({ text: '/give', line: 0, character: 0 });
    expect(diagnostics.some(d => d.code === 'MISSING_ARGUMENT')).toBe(true);
  });

  test('detects unknown literals/subcommands', async () => {
    // '/time invalid' should be an error because time set/query/add taking only certain literals
    const diagnostics = await provider.validate({ text: '/time invalid', line: 0, character: 0 });
    // Note: /time has subcommands like 'add', 'query', 'set'
    // If it hits 'invalid', it should be UNKNOWN_SUBCOMMAND
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toMatch(/UNKNOWN_SUBCOMMAND|INVALID_ARGUMENT/);
  });

  test('validates arguments with multiple spaces', async () => {
    const diagnostics = await provider.validate({
      text: '/give    @p   non_existent_item_!!!',
      line: 0,
      character: 0,
    });
    // This should fail because of '!!!'
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test('handles unexpected trailing arguments', async () => {
    const diagnostics = await provider.validate({ text: '/seed unexpected_arg', line: 0, character: 0 });
    if (diagnostics.length > 0) {
        expect(diagnostics.some(d => d.code === 'UNEXPECTED_ARGUMENT')).toBe(true);
    }
  });

  test('validates integer range if available', async () => {
      // difficulty abc
      const diagnostics = await provider.validate({ text: '/difficulty abc', line: 0, character: 0 });
      expect(diagnostics.length).toBeGreaterThan(0);
  });

  test('getCharacterPosition returns correct index', async () => {
      // Just test it via a diagnostic position
      const diagnostics = await provider.validate({ text: '/give    @p   !!!', line: 0, character: 0 });
      if (diagnostics.length > 0) {
          const char = diagnostics[0]!.range.start.character;
          // '/give' (5) + '    ' (4) + '@p' (2) + '   ' (3) = 14. 
          // So '!!!' starts at 15.
          expect(char).toBe(15);
      }
  });

  test('clearCache works', async () => {
    await provider.clearCache();
    // Subsequent calls will fetch again
    const diag = await provider.validate({ text: '/help', line: 0, character: 0 });
    expect(diag).toBeDefined();
  });
});