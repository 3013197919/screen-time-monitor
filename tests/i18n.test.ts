import { describe, it, expect } from 'vitest';
import zhCN from '../src/i18n/locales/zh-CN.json';
import en from '../src/i18n/locales/en.json';

describe('i18n translation key alignment', () => {
  it('zh-CN and en have the same top-level key set', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('zh-CN top-level sections match expected sections', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const expected = [
      'about', 'app', 'chart', 'common', 'custom',
      'error', 'language', 'monthly', 'nav', 'settings',
      'statusBar', 'today', 'tray', 'weekly',
    ];
    expect(zhKeys).toEqual(expected);
  });

  it('each top-level section has same nested keys in both locales', () => {
    const topKeys = Object.keys(zhCN);

    for (const key of topKeys) {
      const zhNested = Object.keys((zhCN as Record<string, unknown>)[key] as Record<string, unknown>).sort();
      const enNested = Object.keys((en as Record<string, unknown>)[key] as Record<string, unknown>).sort();
      expect(zhNested, `Nested key mismatch in section "${key}"`).toEqual(enNested);
    }
  });
});
