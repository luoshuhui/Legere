import { stubTranslation as _ } from '@/utils/misc';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { info, error as logError } from '@tauri-apps/plugin-log';
import { isTauriAppPlatform } from '@/services/environment';
import { useSettingsStore } from '@/store/settingsStore';
import { ErrorCodes, TranslationProvider, TranslatorConfigField } from '../types';

const GEMINI_DEFAULT_MODEL = 'gemini-3-flash-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_RPM = 5;
const DEFAULT_TPM = 250000;

// 日志辅助（仅用于内部错误，超限通过 UI 提示）
const log = async (msg: string) => {
  if (isTauriAppPlatform()) await info(`[Gemini] ${msg}`);
  else console.log(`[Gemini] ${msg}`);
};
const logErr = async (msg: string) => {
  if (isTauriAppPlatform()) await logError(`[Gemini] ${msg}`);
  else console.error(`[Gemini] ${msg}`);
};

import { RateLimiter } from '../rateLimiter';

const rateLimiter = new RateLimiter();

const CONFIG_FIELDS: TranslatorConfigField[] = [
  {
    key: 'geminiApiKey',
    label: _('Gemini API Key'),
    type: 'password',
    placeholder: _('Enter API Key'),
  },
  { key: 'geminiModel', label: _('Model Name'), type: 'text', placeholder: GEMINI_DEFAULT_MODEL },
  {
    key: 'geminiRpm',
    label: _('RPM (Requests/Min)'),
    type: 'text',
    placeholder: String(DEFAULT_RPM),
  },
  {
    key: 'geminiTpm',
    label: _('TPM (Tokens/Min)'),
    type: 'text',
    placeholder: String(DEFAULT_TPM),
  },
];

const getConfig = () => {
  const { settings } = useSettingsStore.getState();
  const vs = settings.globalViewSettings;
  return {
    apiKey: vs?.geminiApiKey || '',
    model: vs?.geminiModel || GEMINI_DEFAULT_MODEL,
    rpm: Number(vs?.geminiRpm) || DEFAULT_RPM,
    tpm: Number(vs?.geminiTpm) || DEFAULT_TPM,
  };
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const extractRetrySeconds = (body: string): number | null => {
  const match = body.match(/retry in ([\d.]+)s/i);
  return match?.[1] ? Math.ceil(parseFloat(match[1])) : null;
};

const doRequest = async (
  fetch: typeof window.fetch | typeof tauriFetch,
  url: string,
  body: string,
): Promise<Response> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return response as Response;
};

export const geminiProvider: TranslationProvider = {
  name: 'gemini',
  label: _('Gemini'),
  configurable: true,
  configFields: CONFIG_FIELDS,
  translate: async (texts: string[], sourceLang: string, targetLang: string): Promise<string[]> => {
    if (!texts.length) return [];

    const { apiKey, model, rpm, tpm } = getConfig();
    await log(`config: hasApiKey=${!!apiKey} model=${model} rpm=${rpm} tpm=${tpm}`);

    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    // 本地限流检查（UI 提示，不写日志）
    const wait = rateLimiter.getWaitSeconds(rpm, tpm);
    if (wait > 0) {
      throw new Error(`${ErrorCodes.RATE_LIMIT_EXCEEDED} 超出频率限制，请在 ${wait} 秒后重试。`);
    }

    const isTauri = isTauriAppPlatform();
    const fetchFn = isTauri ? tauriFetch : window.fetch;
    await log(`isTauri=${isTauri} texts=${texts.length}`);

    const results: string[] = [];
    const src = sourceLang === 'AUTO' ? '' : sourceLang;
    const langInstruction = src ? `from ${src} to ${targetLang}` : `to ${targetLang}`;

    await Promise.all(
      texts.map(async (text, index) => {
        if (!text?.trim()) {
          results[index] = text;
          return;
        }

        const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
        const requestBody = JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Translate the following text ${langInstruction}. Output only the translated text, no explanations.\n\n${text}`,
                },
              ],
            },
          ],
        });

        // 指数退避重试（最多 4 次）
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) {
            const waitSec = 2 ** (attempt - 1);
            await log(`retry attempt=${attempt} waiting=${waitSec}s`);
            await sleep(waitSec * 1000);
          }

          const response = await doRequest(fetchFn, url, requestBody);
          await log(`response status=${response.status} attempt=${attempt}`);

          if (response.ok) {
            const data = await response.json();
            const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            const tokenCount = data?.usageMetadata?.totalTokenCount as number | undefined;
            rateLimiter.record(tokenCount ?? Math.ceil(text.length / 4));
            await log(`translated=${!!translated} tokens=${tokenCount}`);
            results[index] = translated || text;
            lastError = null;
            break;
          }

          const body = await response.text().catch(() => '');
          await logErr(`error status=${response.status} body=${body}`);

          if (response.status === 429) {
            const retrySeconds = extractRetrySeconds(body);
            lastError = new Error(
              `${ErrorCodes.RATE_LIMIT_EXCEEDED} 超出频率限制，请在 ${retrySeconds ?? 2 ** attempt} 秒后重试。`,
            );
            if (attempt < 3) continue;
          } else {
            throw new Error(`Gemini ${response.status}: ${body}`);
          }
        }

        if (lastError) throw lastError;
      }),
    );

    return results;
  },
};
