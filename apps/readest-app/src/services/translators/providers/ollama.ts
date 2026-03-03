import { stubTranslation as _ } from '@/utils/misc';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { info, error as logError } from '@tauri-apps/plugin-log';
import { isTauriAppPlatform } from '@/services/environment';
import { useSettingsStore } from '@/store/settingsStore';
import { TranslationProvider, TranslatorConfigField } from '../types';

const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
const OLLAMA_DEFAULT_MODEL = 'translategemma';

const log = async (msg: string) => {
  if (isTauriAppPlatform()) {
    await info(`[Ollama] ${msg}`);
  } else {
    console.log(`[Ollama] ${msg}`);
  }
};

const logErr = async (msg: string) => {
  if (isTauriAppPlatform()) {
    await logError(`[Ollama] ${msg}`);
  } else {
    console.error(`[Ollama] ${msg}`);
  }
};

const CONFIG_FIELDS: TranslatorConfigField[] = [
  { key: 'ollamaBaseUrl', label: _('Ollama URL'), type: 'text', placeholder: OLLAMA_DEFAULT_URL },
  { key: 'ollamaModel', label: _('Model Name'), type: 'text', placeholder: OLLAMA_DEFAULT_MODEL },
];

const getConfig = () => {
  const { settings } = useSettingsStore.getState();
  const vs = settings.globalViewSettings;
  return {
    baseUrl: vs?.ollamaBaseUrl || OLLAMA_DEFAULT_URL,
    model: vs?.ollamaModel || OLLAMA_DEFAULT_MODEL,
  };
};

export const ollamaProvider: TranslationProvider = {
  name: 'ollama',
  label: _('Ollama'),
  configurable: true,
  configFields: CONFIG_FIELDS,
  translate: async (texts: string[], sourceLang: string, targetLang: string): Promise<string[]> => {
    if (!texts.length) return [];

    const { baseUrl, model } = getConfig();
    const isTauri = isTauriAppPlatform();
    const fetch = isTauri ? tauriFetch : window.fetch;
    await log(`config: baseUrl=${baseUrl} model=${model} isTauri=${isTauri}`);

    const results: string[] = [];
    const src = sourceLang === 'AUTO' ? '' : sourceLang;
    const langInstruction = src ? `from ${src} to ${targetLang}` : `to ${targetLang}`;

    await Promise.all(
      texts.map(async (text, index) => {
        if (!text?.trim()) {
          results[index] = text;
          return;
        }

        const url = `${baseUrl}/api/chat`;
        await log(`calling: ${url} model=${model}`);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the user text ${langInstruction}. Output only the translated text, no explanations.`,
              },
              { role: 'user', content: text },
            ],
          }),
        });

        await log(`response status=${response.status}`);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          await logErr(`error status=${response.status} body=${body}`);
          throw new Error(`Ollama ${response.status}: ${body}`);
        }

        const data = await response.json();
        const translated = data?.message?.content?.trim();
        await log(`translated=${!!translated}`);
        results[index] = translated || text;
      }),
    );

    return results;
  },
};
