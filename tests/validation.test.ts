import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCache } from '../src/core/Cache';
import { ValidationProvider, DiagnosticSeverity } from '../src/core/ValidationProvider';

describe('ValidationProvider', () => {
  let provider: ValidationProvider;

  beforeEach(() => {
    provider = new ValidationProvider({ cacheProvider: new MemoryCache() });
  });

  test('validates known command', async () => {
    const diagnostics = await provider.validate({
      text: '/give',
      line: 0,
      character: 0,
    });
    expect(diagnostics.length).toBe(0);
  });

  test('detects unknown command', async () => {
    const diagnostics = await provider.validate({
      text: '/unknowncmd',
      line: 0,
      character: 0,
    });
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostics[0]!.code).toBe('UNKNOWN_COMMAND');
  });

  test('validates subcommand', async () => {
    const diagnostics = await provider.validate({
      text: '/give @p diamond_sword',
      line: 0,
      character: 0,
    });
    expect(diagnostics.length).toBe(0);
  });

  test('detects unknown subcommand', async () => {
    const diagnostics = await provider.validate({
      text: '/give invalid',
      line: 0,
      character: 0,
    });
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test('clearCache clears cache', async () => {
    await provider.validate({ text: '/give', line: 0, character: 0 });
    await provider.clearCache();
    const diagnostics = await provider.validate({ text: '/give', line: 0, character: 0 });
    expect(diagnostics.length).toBe(0);
  });
});