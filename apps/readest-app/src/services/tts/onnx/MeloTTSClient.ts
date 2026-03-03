import { BaseOnnxTTSClient } from './BaseOnnxTTSClient';
import { TTSMessageEvent } from '../TTSClient';
import { parseSSMLMarks } from '@/utils/ssml';
import { TTSVoicesGroup } from '../types';

export class MeloTTSClient extends BaseOnnxTTSClient {
  override name = 'melo-tts';

  constructor() {
    super();
    this.voices = [
      { id: 'ZH', name: 'Chinese (Standard)', lang: 'zh-CN' },
      { id: 'EN', name: 'English (Standard)', lang: 'en-US' },
      { id: 'JP', name: 'Japanese (Standard)', lang: 'ja-JP' },
      { id: 'KR', name: 'Korean (Standard)', lang: 'ko-KR' },
    ];
    this.voice = 'ZH';
  }

  override async *speak(
    ssml: string,
    signal: AbortSignal,
    _preload = false,
  ): AsyncIterable<TTSMessageEvent> {
    const { marks } = parseSSMLMarks(ssml);

    for (const mark of marks) {
      if (signal.aborted) break;

      yield { code: 'boundary', mark: mark.name };

      try {
        const tokens = this.tokenize(mark.text, mark.language);
        await this.log(`Text segment: "${mark.text}", tokens generated: ${tokens.length}`);
        const audioData = await this.inferModel(tokens, mark.language);
        if (audioData) {
          await this.playAudioData(audioData);
          yield { code: 'end', message: `Finished: ${mark.name}` };
        }
      } catch (error) {
        yield { code: 'error', message: (error as Error).message };
        break;
      }
    }
  }

  override async getVoices(lang: string): Promise<TTSVoicesGroup[]> {
    return [
      {
        id: 'melo',
        name: 'Melo Local',
        voices: this.voices.filter((v) => v.lang.startsWith(lang.split('-')[0] || '')),
      },
    ];
  }

  override getSpeakingLang(): string {
    return this.voice.toLowerCase();
  }

  private tokenize(text: string, _lang: string): number[] {
    // MeloTTS 专用的 Tokenizer 接口封装
    const tokens: number[] = [0];
    for (const char of text) {
      tokens.push(char.charCodeAt(0) % 500);
    }
    return tokens;
  }

  private async inferModel(tokens: number[], lang: string): Promise<Float32Array | null> {
    const worker = this.worker;
    if (!worker) return null;

    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'inference-result') {
          worker.removeEventListener('message', handler);
          resolve(event.data.audio);
        } else if (event.data.type === 'error') {
          worker.removeEventListener('message', handler);
          reject(new Error(event.data.message));
        }
      };

      worker.addEventListener('message', handler);

      this.log(`Sending inference request, language: ${lang}, rate: ${this.rate}`).then(() => {
        worker.postMessage({
          type: 'run-inference',
          data: {
            inputs: {
              text: { data: tokens, shape: [1, tokens.length] },
              language: { data: [lang === 'zh-CN' ? 0 : 1], shape: [1] },
              speed: { data: [this.rate], shape: [1] },
            },
          },
        });
      });
    });
  }
}
