import { BaseOnnxTTSClient } from './BaseOnnxTTSClient';
import { TTSMessageEvent } from '../TTSClient';
import { parseSSMLMarks } from '@/utils/ssml';
import { TTSVoicesGroup } from '../types';

export class KokoroTTSClient extends BaseOnnxTTSClient {
  override name = 'kokoro-tts';

  constructor() {
    super();
    this.voice = 'af_bella';
    this.voices = [
      { id: 'af_bella', name: 'Bella (Female)', lang: 'en-US' },
      { id: 'af_sarah', name: 'Sarah (Female)', lang: 'en-US' },
      { id: 'am_adam', name: 'Adam (Male)', lang: 'en-US' },
      { id: 'am_michael', name: 'Michael (Male)', lang: 'en-US' },
    ];
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
        const tokens = this.phonemize(mark.text);
        await this.log(`Phonemized text: "${mark.text}", tokens: ${tokens.length}`);
        const audioData = await this.inferModel(tokens);
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
        id: 'kokoro',
        name: 'Kokoro Local',
        voices: this.voices.filter((v) => v.lang.startsWith(lang.split('-')[0] || '')),
      },
    ];
  }

  override getSpeakingLang(): string {
    return 'en';
  }

  private phonemize(text: string): number[] {
    // Kokoro 专用的文本转音素分词逻辑
    const tokens: number[] = [0];
    for (const char of text) {
      tokens.push(char.charCodeAt(0) % 1000);
    }
    return tokens;
  }

  private async inferModel(tokens: number[]): Promise<Float32Array | null> {
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

      this.log(`Sending inference request, voice: ${this.voice}, tokens: ${tokens.length}`).then(
        () => {
          worker.postMessage({
            type: 'run-inference',
            data: {
              inputs: {
                tokens: { data: tokens, shape: [1, tokens.length] },
                style: { data: new Array(256).fill(0), shape: [1, 256] }, // 示例风格向量
                speed: { data: [this.rate], shape: [1] },
              },
            },
          });
        },
      );
    });
  }
}
