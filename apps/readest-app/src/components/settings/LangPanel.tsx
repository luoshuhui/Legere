import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { saveViewSettings } from '@/helpers/settings';
import { getTranslators } from '@/services/translators';
import { useResetViewSettings } from '@/hooks/useResetSettings';
import { TRANSLATED_LANGS, TRANSLATOR_LANGS } from '@/services/constants';
import { ConvertChineseVariant } from '@/types/book';
import { SettingsPanelPanelProp } from './SettingsDialog';
import { getDirFromLanguage } from '@/utils/rtl';
import { isCJKEnv } from '@/utils/misc';
import Select from '@/components/Select';

const LangPanel: React.FC<SettingsPanelPanelProp> = ({ bookKey, onRegisterReset }) => {
  const _ = useTranslation();
  const { token } = useAuth();
  const { envConfig } = useEnv();
  const { settings, applyUILanguage, setSettings } = useSettingsStore();
  const { getView, getViewSettings, setViewSettings, recreateViewer } = useReaderStore();
  const view = getView(bookKey);
  const viewSettings = getViewSettings(bookKey) || settings.globalViewSettings;

  const [uiLanguage, setUILanguage] = useState(viewSettings.uiLanguage);
  const [translationEnabled, setTranslationEnabled] = useState(viewSettings.translationEnabled);
  const [translationProvider, setTranslationProvider] = useState(viewSettings.translationProvider);
  const [translateTargetLang, setTranslateTargetLang] = useState(viewSettings.translateTargetLang);
  const [showTranslateSource, setShowTranslateSource] = useState(viewSettings.showTranslateSource);
  const [ttsReadAloudText, setTtsReadAloudText] = useState(viewSettings.ttsReadAloudText);
  const [replaceQuotationMarks, setReplaceQuotationMarks] = useState(
    viewSettings.replaceQuotationMarks,
  );
  const [convertChineseVariant, setConvertChineseVariant] = useState(
    viewSettings.convertChineseVariant,
  );
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(
    viewSettings.ollamaBaseUrl || 'http://127.0.0.1:11434',
  );
  const [ollamaModel, setOllamaModel] = useState(viewSettings.ollamaModel || 'translategemma');
  const [geminiApiKey, setGeminiApiKey] = useState(viewSettings.geminiApiKey || '');
  const [geminiModel, setGeminiModel] = useState(
    viewSettings.geminiModel || 'gemini-3-flash-preview',
  );
  const [geminiRpm, setGeminiRpm] = useState(viewSettings.geminiRpm?.toString() || '5');
  const [geminiTpm, setGeminiTpm] = useState(viewSettings.geminiTpm?.toString() || '250000');
  const [azureCpm, setAzureCpm] = useState(viewSettings.azureCpm?.toString() || '30000');
  const [googleRpm, setGoogleRpm] = useState(viewSettings.googleRpm?.toString() || '10');
  const [ttsEngine, setTtsEngine] = useState(viewSettings.ttsEngine || 'edge');
  const [meloModelPath, setMeloModelPath] = useState(viewSettings.meloModelPath || '');
  const [kokoroModelPath, setKokoroModelPath] = useState(viewSettings.kokoroModelPath || '');

  const resetToDefaults = useResetViewSettings();

  const handleReset = () => {
    resetToDefaults({
      uiLanguage: setUILanguage,
      translationEnabled: setTranslationEnabled,
      translationProvider: setTranslationProvider,
      translateTargetLang: setTranslateTargetLang,
      showTranslateSource: setShowTranslateSource,
      ttsReadAloudText: setTtsReadAloudText,
      replaceQuotationMarks: setReplaceQuotationMarks,
      ttsEngine: setTtsEngine,
      meloModelPath: setMeloModelPath,
      kokoroModelPath: setKokoroModelPath,
    });
  };

  useEffect(() => {
    onRegisterReset(handleReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCurrentUILangOption = () => {
    const uiLanguage = viewSettings.uiLanguage;
    return {
      value: uiLanguage,
      label:
        uiLanguage === ''
          ? _('Auto')
          : TRANSLATED_LANGS[uiLanguage as keyof typeof TRANSLATED_LANGS],
    };
  };

  const getLangOptions = (langs: Record<string, string>) => {
    const options = Object.entries(langs).map(([value, label]) => ({ value, label }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    options.unshift({ value: '', label: _('System Language') });
    return options;
  };

  const handleSelectUILang = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = event.target.value;
    setUILanguage(option);
  };

  const getTranslationProviderOptions = () => {
    const translators = getTranslators();
    const availableProviders = translators.map((t) => {
      let label = t.label;
      if (t.authRequired && !token) {
        label = `${label} (${_('Login Required')})`;
      } else if (t.quotaExceeded) {
        label = `${label} (${_('Quota Exceeded')})`;
      }
      return { value: t.name, label };
    });
    return availableProviders;
  };

  const getCurrentTranslationProviderOption = () => {
    const value = translationProvider;
    const allProviders = getTranslationProviderOptions();
    const availableTranslators = getTranslators().filter(
      (t) => (t.authRequired ? !!token : true) && !t.quotaExceeded,
    );
    const currentProvider = availableTranslators.find((t) => t.name === value)
      ? value
      : availableTranslators[0]?.name;
    return allProviders.find((p) => p.value === currentProvider) || allProviders[0]!;
  };

  const handleSelectTranslationProvider = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = event.target.value;
    setTranslationProvider(option);
    saveViewSettings(envConfig, bookKey, 'translationProvider', option, false, false);
    viewSettings.translationProvider = option;
    setViewSettings(bookKey, { ...viewSettings });
  };

  const handleProviderConfigChange = async (
    key: string,
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    setter(value);
    const val =
      key === 'geminiRpm' || key === 'geminiTpm' || key === 'azureCpm' || key === 'googleRpm'
        ? parseInt(value, 10) || 0
        : value;
    saveViewSettings(
      envConfig,
      bookKey,
      key as keyof typeof viewSettings,
      val as never,
      false,
      false,
    );
    (viewSettings as unknown as Record<string, unknown>)[key] = val;
    setViewSettings(bookKey, { ...viewSettings });

    // 同步到 globalViewSettings 并持久化到磁盘
    (settings.globalViewSettings as unknown as Record<string, unknown>)[key] = val;
    const newSettings = { ...settings };
    setSettings(newSettings);
    const { saveSettings } = useSettingsStore.getState();
    await saveSettings(envConfig, newSettings);
  };

  const getCurrentTargetLangOption = () => {
    const value = translateTargetLang;
    const availableOptions = getLangOptions(TRANSLATOR_LANGS);
    return availableOptions.find((o) => o.value === value) || availableOptions[0]!;
  };

  const handleSelectTargetLang = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = event.target.value;
    setTranslateTargetLang(option);
    saveViewSettings(envConfig, bookKey, 'translateTargetLang', option, false, false);
    viewSettings.translateTargetLang = option;
    setViewSettings(bookKey, { ...viewSettings });
  };

  const handleSelectTTSText = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = event.target.value;
    setTtsReadAloudText(option);
    saveViewSettings(envConfig, bookKey, 'ttsReadAloudText', option, false, false);
  };

  const getTTSTextOptions = () => {
    return [
      { value: 'both', label: _('Source and Translated') },
      { value: 'translated', label: _('Translated Only') },
      { value: 'source', label: _('Source Only') },
    ];
  };

  const getTTSEngineOptions = () => {
    return [
      { value: 'edge', label: _('Edge TTS (Online)') },
      { value: 'melo', label: _('Melo TTS (Local)') },
      { value: 'kokoro', label: _('Kokoro TTS (Local)') },
      { value: 'web', label: _('Web Speech API') },
    ];
  };

  const handleSelectTTSEngine = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = event.target.value;
    setTtsEngine(option);
    saveViewSettings(envConfig, bookKey, 'ttsEngine', option, false, false);
    viewSettings.ttsEngine = option;
    setViewSettings(bookKey, { ...viewSettings });
  };

  useEffect(() => {
    if (uiLanguage === viewSettings.uiLanguage) return;
    const sameDir = getDirFromLanguage(uiLanguage) === getDirFromLanguage(viewSettings.uiLanguage);
    applyUILanguage(uiLanguage);
    saveViewSettings(envConfig, bookKey, 'uiLanguage', uiLanguage, false, false).then(() => {
      if (!sameDir) window.location.reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiLanguage]);

  useEffect(() => {
    if (translationEnabled === viewSettings.translationEnabled) return;
    saveViewSettings(
      envConfig,
      bookKey,
      'translationEnabled',
      translationEnabled,
      true,
      false,
    ).then(() => {
      if (!showTranslateSource && translationEnabled) {
        recreateViewer(envConfig, bookKey);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled]);

  useEffect(() => {
    if (showTranslateSource === viewSettings.showTranslateSource) return;
    saveViewSettings(
      envConfig,
      bookKey,
      'showTranslateSource',
      showTranslateSource,
      false,
      false,
    ).then(() => {
      recreateViewer(envConfig, bookKey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTranslateSource]);

  useEffect(() => {
    if (ttsReadAloudText === viewSettings.ttsReadAloudText) return;
    saveViewSettings(envConfig, bookKey, 'ttsReadAloudText', ttsReadAloudText, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsReadAloudText]);

  useEffect(() => {
    if (replaceQuotationMarks === viewSettings.replaceQuotationMarks) return;
    saveViewSettings(
      envConfig,
      bookKey,
      'replaceQuotationMarks',
      replaceQuotationMarks,
      false,
      false,
    ).then(() => {
      recreateViewer(envConfig, bookKey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceQuotationMarks]);

  const getConvertModeOptions: () => { value: ConvertChineseVariant; label: string }[] = () => {
    return [
      { value: 'none', label: _('No Conversion') },
      { value: 's2t', label: _('Simplified to Traditional') },
      { value: 't2s', label: _('Traditional to Simplified') },
      { value: 's2tw', label: _('Simplified to Traditional (Taiwan)') },
      { value: 's2hk', label: _('Simplified to Traditional (Hong Kong)') },
      { value: 's2twp', label: _('Simplified to Traditional (Taiwan), with phrases') },
      { value: 'tw2s', label: _('Traditional (Taiwan) to Simplified') },
      { value: 'hk2s', label: _('Traditional (Hong Kong) to Simplified') },
      { value: 'tw2sp', label: _('Traditional (Taiwan) to Simplified, with phrases') },
    ];
  };

  const getConvertModeOption = () => {
    const value = convertChineseVariant;
    const availableOptions = getConvertModeOptions();
    return availableOptions.find((o) => o.value === value) || availableOptions[0]!;
  };

  const handleSelectConvertMode = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = event.target.value as ConvertChineseVariant;
    setConvertChineseVariant(option);
  };

  useEffect(() => {
    if (convertChineseVariant === viewSettings.convertChineseVariant) return;
    saveViewSettings(
      envConfig,
      bookKey,
      'convertChineseVariant',
      convertChineseVariant,
      false,
      false,
    ).then(() => {
      recreateViewer(envConfig, bookKey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convertChineseVariant]);

  return (
    <div className={clsx('my-4 w-full space-y-6')}>
      <div className='w-full' data-setting-id='settings.language.interfaceLanguage'>
        <h2 className='mb-2 font-medium'>{_('Language')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item'>
              <span className=''>{_('Interface Language')}</span>
              <Select
                value={getCurrentUILangOption().value}
                onChange={handleSelectUILang}
                options={getLangOptions(TRANSLATED_LANGS)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className='w-full' data-setting-id='settings.language.translationEnabled'>
        <h2 className='mb-2 font-medium'>{_('Translation')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200'>
            <div className='config-item'>
              <span className=''>{_('Enable Translation')}</span>
              <input
                type='checkbox'
                className='toggle'
                checked={translationEnabled}
                onChange={() => setTranslationEnabled(!translationEnabled)}
                disabled={!bookKey}
              />
            </div>

            <div className='config-item'>
              <span className=''>{_('Show Source Text')}</span>
              <input
                type='checkbox'
                className='toggle'
                checked={showTranslateSource}
                onChange={() => setShowTranslateSource(!showTranslateSource)}
              />
            </div>

            <div className='config-item' data-setting-id='settings.language.ttsTextTranslation'>
              <span className=''>{_('TTS Text')}</span>
              <Select
                value={ttsReadAloudText}
                onChange={handleSelectTTSText}
                options={getTTSTextOptions()}
              />
            </div>

            <div className='config-item' data-setting-id='settings.language.translationProvider'>
              <span className=''>{_('Translation Service')}</span>
              <Select
                value={getCurrentTranslationProviderOption().value}
                onChange={handleSelectTranslationProvider}
                options={getTranslationProviderOptions()}
              />
            </div>

            {translationProvider === 'ollama' && (
              <>
                <div className='config-item'>
                  <span>{_('Ollama URL')}</span>
                  <input
                    type='text'
                    className='input input-bordered input-sm w-48'
                    value={ollamaBaseUrl}
                    placeholder='http://127.0.0.1:11434'
                    onChange={(e) =>
                      handleProviderConfigChange('ollamaBaseUrl', e.target.value, setOllamaBaseUrl)
                    }
                  />
                </div>
                <div className='config-item'>
                  <span>{_('Model Name')}</span>
                  <input
                    type='text'
                    className='input input-bordered input-sm w-48'
                    value={ollamaModel}
                    placeholder='llama3.2'
                    onChange={(e) =>
                      handleProviderConfigChange('ollamaModel', e.target.value, setOllamaModel)
                    }
                  />
                </div>
              </>
            )}

            {translationProvider === 'gemini' && (
              <>
                <div className='config-item'>
                  <span>{_('Gemini API Key')}</span>
                  <input
                    type='password'
                    className='input input-bordered input-sm w-48'
                    value={geminiApiKey}
                    placeholder={_('Enter API Key')}
                    onChange={(e) =>
                      handleProviderConfigChange('geminiApiKey', e.target.value, setGeminiApiKey)
                    }
                  />
                </div>
                <div className='config-item'>
                  <span>{_('Model Name')}</span>
                  <input
                    type='text'
                    className='input input-bordered input-sm w-48'
                    value={geminiModel}
                    placeholder='gemini-3-flash-preview'
                    onChange={(e) =>
                      handleProviderConfigChange('geminiModel', e.target.value, setGeminiModel)
                    }
                  />
                </div>
                <div className='config-item'>
                  <span>{_('RPM (Requests/Min)')}</span>
                  <input
                    type='text'
                    className='input input-bordered input-sm w-48'
                    value={geminiRpm}
                    placeholder='5'
                    onChange={(e) =>
                      handleProviderConfigChange('geminiRpm', e.target.value, setGeminiRpm)
                    }
                  />
                </div>
                <div className='config-item'>
                  <span>{_('TPM (Tokens/Min)')}</span>
                  <input
                    type='text'
                    className='input input-bordered input-sm w-48'
                    value={geminiTpm}
                    placeholder='250000'
                    onChange={(e) =>
                      handleProviderConfigChange('geminiTpm', e.target.value, setGeminiTpm)
                    }
                  />
                </div>
              </>
            )}

            {translationProvider === 'azure' && (
              <>
                <div className='config-item'>
                  <span>{_('CPM (Chars/Min)')}</span>
                  <input
                    type='text'
                    className='input input-bordered input-sm w-48'
                    value={azureCpm}
                    placeholder='30000'
                    onChange={(e) =>
                      handleProviderConfigChange('azureCpm', e.target.value, setAzureCpm)
                    }
                  />
                </div>
              </>
            )}

            {translationProvider === 'google' && (
              <>
                <div className='config-item'>
                  <span>{_('RPM (Requests/Min)')}</span>
                  <input
                    type='text'
                    className='input input-bordered input-sm w-48'
                    value={googleRpm}
                    placeholder='10'
                    onChange={(e) =>
                      handleProviderConfigChange('googleRpm', e.target.value, setGoogleRpm)
                    }
                  />
                </div>
              </>
            )}

            <div className='config-item' data-setting-id='settings.language.targetLanguage'>
              <span className=''>{_('Translate To')}</span>
              <Select
                value={getCurrentTargetLangOption().value}
                onChange={handleSelectTargetLang}
                options={getLangOptions(TRANSLATOR_LANGS)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className='w-full'>
        <h2 className='mb-2 font-medium'>{_('TTS (Text to Speech)')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200'>
            <div className='config-item'>
              <span className=''>{_('Audio Engine')}</span>
              <Select
                value={ttsEngine}
                onChange={handleSelectTTSEngine}
                options={getTTSEngineOptions()}
              />
            </div>

            {ttsEngine === 'melo' && (
              <div className='config-item !h-auto flex-col items-start gap-2 py-3'>
                <span className='text-sm'>{_('Melo Model Path')}</span>
                <input
                  type='text'
                  className='input input-bordered input-sm w-full'
                  value={meloModelPath}
                  placeholder={_('Enter model path (.onnx)')}
                  onChange={(e) =>
                    handleProviderConfigChange('meloModelPath', e.target.value, setMeloModelPath)
                  }
                />
              </div>
            )}

            {ttsEngine === 'kokoro' && (
              <div className='config-item !h-auto flex-col items-start gap-2 py-3'>
                <span className='text-sm'>{_('Kokoro Model Path')}</span>
                <input
                  type='text'
                  className='input input-bordered input-sm w-full'
                  value={kokoroModelPath}
                  placeholder={_('Enter model path (.onnx)')}
                  onChange={(e) =>
                    handleProviderConfigChange(
                      'kokoroModelPath',
                      e.target.value,
                      setKokoroModelPath,
                    )
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {(isCJKEnv() || view?.language.isCJK) && (
        <div className='w-full' data-setting-id='settings.language.quotationMarks'>
          <h2 className='mb-2 font-medium'>{_('Punctuation')}</h2>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200'>
              <div className='config-item !h-16'>
                <div className='flex flex-col gap-1'>
                  <span className=''>{_('Replace Quotation Marks')}</span>
                  <span className='text-xs'>{_('Enabled only in vertical layout.')}</span>
                </div>
                <input
                  type='checkbox'
                  className='toggle'
                  checked={replaceQuotationMarks}
                  onChange={() => setReplaceQuotationMarks(!replaceQuotationMarks)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {(isCJKEnv() || view?.language.isCJK) && (
        <div className='w-full' data-setting-id='settings.language.chineseConversion'>
          <h2 className='mb-2 font-medium'>{_('Convert Simplified and Traditional Chinese')}</h2>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200'>
              <div className='config-item'>
                <span className=''>{_('Convert Mode')}</span>
                <Select
                  value={getConvertModeOption().value}
                  onChange={handleSelectConvertMode}
                  options={getConvertModeOptions()}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LangPanel;
