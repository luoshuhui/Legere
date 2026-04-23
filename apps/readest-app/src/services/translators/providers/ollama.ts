import { stubTranslation as _ } from '@/utils/misc';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { info, error as logError } from '@tauri-apps/plugin-log';
import { isTauriAppPlatform } from '@/services/environment';
import { useSettingsStore } from '@/store/settingsStore';
import { TranslationProvider, TranslatorConfigField } from '../types';

const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
const OLLAMA_DEFAULT_MODEL = 'translategemma';

const log = (msg: string) => {
  if (isTauriAppPlatform()) {
    info(`[Ollama] ${msg}`);
  } else {
    console.log(`[Ollama] ${msg}`);
  }
};

const logErr = (msg: string) => {
  if (isTauriAppPlatform()) {
    logError(`[Ollama] ${msg}`);
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
    log(`config: baseUrl=${baseUrl} model=${model} isTauri=${isTauri}`);

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
        log(`calling: ${url} model=${model}`);

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

        log(`response status=${response.status}`);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logErr(`error status=${response.status} body=${body}`);
          throw new Error(`Ollama ${response.status}: ${body}`);
        }

        const data = await response.json();
        const translated = data?.message?.content?.trim();
        log(`translated=${!!translated}`);
        results[index] = translated || text;
      }),
    );

    return results;
  },
};
