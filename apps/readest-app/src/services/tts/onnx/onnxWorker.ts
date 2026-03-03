import * as ort from 'onnxruntime-web';

// 配置 WASM 路径（需要在主线程中设置，或者这里假设已经由主线程通过环境变量或消息传递）
// ort.env.wasm.wasmPaths = '...';

let session: ort.InferenceSession | null = null;

async function loadModel(modelBuffer: ArrayBuffer) {
  console.log('[TTS Worker] Loading model, buffer size:', modelBuffer.byteLength);
  try {
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all',
    });
    console.log('[TTS Worker] Model loaded successfully');
    self.postMessage({ type: 'model-loaded' });
  } catch (error) {
    console.error('[TTS Worker] LoadModel Error:', error);
    self.postMessage({ type: 'error', message: (error as Error).message });
  }
}

async function runInference(inputs: Record<string, { data: number[]; shape: number[] }>) {
  if (!session) {
    self.postMessage({ type: 'error', message: 'Model not loaded' });
    return;
  }

  try {
    const feeds: Record<string, ort.Tensor> = {};
    for (const [key, value] of Object.entries(inputs)) {
      feeds[key] = new ort.Tensor(
        'int64',
        BigInt64Array.from(value.data.map((v: number) => BigInt(v))),
        value.shape,
      );
    }

    console.log('[TTS Worker] Running inference, input keys:', Object.keys(inputs));
    const start = performance.now();
    const results = await session.run(feeds);
    const end = performance.now();
    console.log(`[TTS Worker] Inference complete, duration: ${(end - start).toFixed(2)}ms`);

    // 假设输出是 'audio' 字段
    const outputKey = Object.keys(results)[0];
    const output = outputKey ? results[outputKey] : null;
    if (output) {
      console.log('[TTS Worker] Posting inference result, audio length:', output.data.length);
      self.postMessage({
        type: 'inference-result',
        audio: output.data,
        duration: end - start,
      });
    } else {
      console.warn('[TTS Worker] No output found in inference results');
    }
  } catch (error) {
    console.error('[TTS Worker] RunInference Error:', error);
    self.postMessage({ type: 'error', message: (error as Error).message });
  }
}

self.onmessage = async (event) => {
  const { type, data } = event.data;
  switch (type) {
    case 'load-model':
      await loadModel(data.modelBuffer);
      break;
    case 'run-inference':
      await runInference(data.inputs);
      break;
  }
};
