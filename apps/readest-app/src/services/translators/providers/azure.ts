import { stubTranslation as _ } from '@/utils/misc';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import { useSettingsStore } from '@/store/settingsStore';
import { ErrorCodes, TranslationProvider, TranslatorConfigField } from '../types';
import { normalizeToFullLang } from '@/utils/lang';
import { RateLimiter } from '../rateLimiter';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
const rateLimiter = new RateLimiter();

const DEFAULT_CPM = 30000;

const CONFIG_FIELDS: TranslatorConfigField[] = [
  { key: 'azureCpm', label: _('CPM (Chars/Min)'), type: 'text', placeholder: String(DEFAULT_CPM) },
];

const getConfig = () => {
  const { settings } = useSettingsStore.getState();
  const vs = settings.globalViewSettings;
  return {
    cpm: Number(vs?.azureCpm) || DEFAULT_CPM,
  };
};

const getAuthToken = async (): Promise<string> => {
  /* ... 原有 getAuthToken 代码逻辑 ... */
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;
  try {
    const fetch = isTauriAppPlatform() ? tauriFetch : window.fetch;
    const tokenResponse = await fetch('https://edge.microsoft.com/translate/auth', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!tokenResponse.ok) throw new Error(`Token failed: ${tokenResponse.status}`);
    const token = await tokenResponse.text();
    tokenCache = { token, expiresAt: now + 8 * 60 * 1000 };
    return token;
  } catch (e) {
    console.error('Error getting Microsoft auth token:', e);
    throw e;
  }
};

export const azureProvider: TranslationProvider = {
  name: 'azure',
  label: _('Azure Translator'),
  configurable: true,
  configFields: CONFIG_FIELDS,
  translate: async (text: string[], sourceLang: string, targetLang: string): Promise<string[]> => {
    if (!text.length) return [];

    const { cpm } = getConfig();
    const wait = rateLimiter.getWaitSeconds(0, cpm);
    if (wait > 0) {
      throw new Error(`${ErrorCodes.RATE_LIMIT_EXCEEDED} 超出频率限制，请在 ${wait} 秒后重试。`);
    }

    const results: string[] = [];
    const msSourceLang = sourceLang ? normalizeToFullLang(sourceLang) : '';
    const msTargetLang = normalizeToFullLang(targetLang);

    const translationPromises = text.map(async (line, index) => {
      if (!line?.trim().length) {
        results[index] = line;
        return;
      }

      const url = 'https://api-edge.cognitive.microsofttranslator.com/translate';
      const params = new URLSearchParams({ to: msTargetLang, 'api-version': '3.0' });
      if (msSourceLang && msSourceLang.toLowerCase() !== 'auto')
        params.append('from', msSourceLang);

      const token = await getAuthToken();
      const fetch = isTauriAppPlatform() ? tauriFetch : window.fetch;
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify([{ Text: line }]),
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0].translations) {
        const translated = data[0].translations[0].text || line;
        rateLimiter.record(line.length);
        results[index] = translated;
      } else {
        results[index] = line;
      }
    });

    await Promise.all(translationPromises);
    return results;
  },
};
