import { info, error as logError } from '@tauri-apps/plugin-log';
import { readFile } from '@tauri-apps/plugin-fs';
import { isTauriAppPlatform } from '@/services/environment';
import { TTSClient, TTSMessageEvent } from '../TTSClient';
import { TTSGranularity, TTSVoice, TTSVoicesGroup } from '../types';

export abstract class BaseOnnxTTSClient implements TTSClient {
  abstract name: string;
  initialized = false;
  protected worker: Worker | null = null;
  protected audioContext: AudioContext | null = null;
  protected rate = 1.0;
  protected pitch = 1.0;
  protected voice = '';
  protected voices: TTSVoice[] = [];

  protected async log(msg: string) {
    if (isTauriAppPlatform()) await info(`[TTS][${this.name}] ${msg}`);
    else console.log(`[TTS][${this.name}] ${msg}`);
  }

  protected async logErr(msg: string) {
    if (isTauriAppPlatform()) await logError(`[TTS][${this.name}] ${msg}`);
    else console.error(`[TTS][${this.name}] ${msg}`);
  }

  constructor() {
    if (typeof window !== 'undefined') {
      const g = window as unknown as { AudioContext: typeof AudioContext };
      const AudioContextClass = g.AudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
  }

  private async loadModelResource(path: string): Promise<ArrayBuffer> {
    await this.log(`Loading resource: ${path}`);
    if (path.startsWith('http') || path.startsWith('blob') || path.startsWith('data')) {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.statusText}`);
      return await resp.arrayBuffer();
    }

    if (isTauriAppPlatform()) {
      await this.log('Using Tauri FS to read local file');
      const data = await readFile(path);
      return data.buffer as ArrayBuffer;
    }

    throw new Error('Local file access is only supported in Tauri platform');
  }

  async init(modelPath?: string): Promise<boolean> {
    if (this.initialized) return true;
    await this.log(`Initializing client with modelPath: ${modelPath || 'default'}`);

    if (!modelPath) {
      await this.logErr('Model path is required for local TTS');
      return false;
    }

    try {
      // 在主线程读取模型数据
      const modelBuffer = await this.loadModelResource(modelPath);
      await this.log(`Model data loaded, size: ${modelBuffer.byteLength} bytes`);

      this.worker = new Worker(new URL('./onnxWorker.ts', import.meta.url), { type: 'module' });

      // 发送消息给 Worker，主线程负责读取，Worker 负责推理
      this.worker.postMessage(
        {
          type: 'load-model',
          data: { modelBuffer },
        },
        [modelBuffer],
      ); // 转移所有权以提高性能

      return new Promise((resolve) => {
        this.worker!.onmessage = async (event) => {
          if (event.data.type === 'model-loaded') {
            await this.log('Model loaded successfully in worker');
            this.initialized = true;
            resolve(true);
          } else if (event.data.type === 'error') {
            await this.logErr(`Worker Error: ${event.data.message}`);
            resolve(false);
          }
        };
      });
    } catch (error) {
      await this.logErr(`Init Error: ${(error as Error).message}`);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    await this.log('Shutting down client');
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  abstract speak(
    ssml: string,
    signal: AbortSignal,
    preload?: boolean,
  ): AsyncIterable<TTSMessageEvent>;

  async pause(): Promise<boolean> {
    if (this.audioContext?.state === 'running') {
      await this.log('Pausing audio context');
      await this.audioContext.suspend();
      return true;
    }
    return false;
  }

  async resume(): Promise<boolean> {
    if (this.audioContext?.state === 'suspended') {
      await this.log('Resuming audio context');
      await this.audioContext.resume();
      return true;
    }
    return false;
  }

  async stop(): Promise<void> {
    await this.log('Stop requested');
  }

  setPrimaryLang(_lang: string): void {
    // 设置主语言
  }

  async setRate(rate: number): Promise<void> {
    this.rate = rate;
  }

  async setPitch(pitch: number): Promise<void> {
    this.pitch = pitch;
  }

  async setVoice(voice: string): Promise<void> {
    this.voice = voice;
  }

  async getAllVoices(): Promise<TTSVoice[]> {
    return this.voices;
  }

  abstract getVoices(_lang: string): Promise<TTSVoicesGroup[]>;

  getGranularities(): TTSGranularity[] {
    return ['sentence', 'word'];
  }

  getVoiceId(): string {
    return this.voice;
  }

  abstract getSpeakingLang(): string;

  protected async playAudioData(audioData: Float32Array) {
    if (!this.audioContext) {
      await this.logErr('No AudioContext available for playback');
      return;
    }

    await this.log(`Playing audio data, size: ${audioData.length}`);
    if (this.audioContext.state === 'suspended') {
      await this.log('Resuming suspended AudioContext before playback');
      await this.audioContext.resume();
    }

    const buffer = this.audioContext.createBuffer(1, audioData.length, 24000); // 假设采样率为 24k
    buffer.getChannelData(0).set(audioData);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();

    return new Promise((resolve) => {
      source.onended = () => {
        resolve(true);
      };
    });
  }
}
