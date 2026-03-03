import { stubTranslation as _ } from '@/utils/misc';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import { normalizeToShortLang } from '@/utils/lang';
import { useSettingsStore } from '@/store/settingsStore';
import { ErrorCodes, TranslationProvider, TranslatorConfigField } from '../types';
import { RateLimiter } from '../rateLimiter';

const rateLimiter = new RateLimiter();
const DEFAULT_RPM = 10;

const CONFIG_FIELDS: TranslatorConfigField[] = [
  {
    key: 'googleRpm',
    label: _('RPM (Requests/Min)'),
    type: 'text',
    placeholder: String(DEFAULT_RPM),
  },
];

const getConfig = () => {
  const { settings } = useSettingsStore.getState();
  const vs = settings.globalViewSettings;
  return {
    rpm: Number(vs?.googleRpm) || DEFAULT_RPM,
  };
};

export const googleProvider: TranslationProvider = {
  name: 'google',
  label: _('Google Translate'),
  configurable: true,
  configFields: CONFIG_FIELDS,
  translate: async (text: string[], sourceLang: string, targetLang: string): Promise<string[]> => {
    if (!text.length) return [];

    const { rpm } = getConfig();
    const wait = rateLimiter.getWaitSeconds(rpm, 0);
    if (wait > 0) {
      throw new Error(`${ErrorCodes.RATE_LIMIT_EXCEEDED} 超出频率限制，请在 ${wait} 秒后重试。`);
    }

    const results: string[] = [];
    const translationPromises = text.map(async (line, index) => {
      if (!line?.trim().length) {
        results[index] = line;
        return;
      }

      const url = new URL('https://translate.googleapis.com/translate_a/single');
      url.searchParams.append('client', 'gtx');
      url.searchParams.append('dt', 't');
      url.searchParams.append('sl', normalizeToShortLang(sourceLang).toLowerCase() || 'auto');
      url.searchParams.append('tl', normalizeToShortLang(targetLang).toLowerCase());
      url.searchParams.append('q', line);

      const fetch = isTauriAppPlatform() ? tauriFetch : window.fetch;
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0]
          .filter((s) => Array.isArray(s) && s[0])
          .map((s) => s[0])
          .join('');
        rateLimiter.record(0);
        results[index] = translated || line;
      } else {
        results[index] = line;
      }
    });

    await Promise.all(translationPromises);
    return results;
  },
};
