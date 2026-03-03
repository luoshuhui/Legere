import { TranslatorName } from './providers';

export interface TranslatorConfigField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
}

export interface TranslationProvider {
  name: string;
  label: string;
  authRequired?: boolean;
  quotaExceeded?: boolean;
  configurable?: boolean;
  configFields?: TranslatorConfigField[];
  translate: (
    texts: string[],
    sourceLang: string,
    targetLang: string,
    token?: string | null,
    useCache?: boolean,
  ) => Promise<string[]>;
}

export interface TranslationCache {
  [key: string]: string;
}

export interface UseTranslatorOptions {
  provider?: TranslatorName;
  sourceLang?: string;
  targetLang?: string;
  enablePolishing?: boolean;
  enablePreprocessing?: boolean;
}

export const ErrorCodes = {
  UNAUTHORIZED: 'Unauthorized',
  DEEPL_API_ERROR: 'DeepL API Error',
  DAILY_QUOTA_EXCEEDED: 'Daily Quota Exceeded',
  RATE_LIMIT_EXCEEDED: '速率超限',
  INTERNAL_SERVER_ERROR: 'Internal Server Error',
};
