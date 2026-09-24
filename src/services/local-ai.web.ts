import { Asset } from 'expo-asset';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';
import { Image } from 'react-native';
import type { AiAnalysis } from './ai';
import { decodeAnalysis, IMAGE_HEIGHT, IMAGE_WIDTH } from './local-ai-shared';
import { localAiError, throwLocalAiError } from './local-ai-errors';

import modelAsset from '../../assets/models/stepable-unet3plus.int8.onnx';
import wasmAsset from '../../assets/models/ort-wasm-simd-threaded.wasm';

type OrtTensor = { data: unknown };
type OrtSession = { run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> };
type OrtModule = {
  env: { wasm: { numThreads: number; wasmBinary?: ArrayBuffer } };
  InferenceSession: { create(model: ArrayBuffer, options: { executionProviders: string[]; graphOptimizationLevel: 'all' }): Promise<OrtSession> };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
};
type ModelSession = OrtSession;

declare global {
  interface Window {
    ort?: OrtModule;
  }
}

let sessionPromise: Promise<ModelSession> | null = null;
let ortPromise: Promise<OrtModule> | null = null;

function getOrt(): Promise<OrtModule> {
  if (typeof window === 'undefined') return Promise.reject(localAiError('runtime_unavailable'));
  if (window.ort) return Promise.resolve(window.ort);
  if (!ortPromise) {
    ortPromise = new Promise<OrtModule>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('ort.wasm.min.js', document.baseURI).toString();
      script.async = true;
      script.onload = () => window.ort ? resolve(window.ort) : reject(localAiError('runtime_unavailable'));
      script.onerror = () => reject(localAiError('runtime_unavailable'));
      document.head.appendChild(script);
    }).catch((error) => {
      ortPromise = null;
      throw error;
    });
  }
  return ortPromise;
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function assetUri(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throwLocalAiError('model_unavailable');
  return uri;
}

async function getSession(): Promise<ModelSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await getOrt();
      const modelUri = await assetUri(modelAsset);
      const wasmUri = await assetUri(wasmAsset);
      const [modelResponse, wasmResponse] = await Promise.all([fetch(modelUri), fetch(wasmUri)]);
      if (!modelResponse.ok || !wasmResponse.ok) throwLocalAiError('model_unavailable');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmBinary = await wasmResponse.arrayBuffer();
      return ort.InferenceSession.create(await modelResponse.arrayBuffer(), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function imageToTensor(uri: string, ort: OrtModule): Promise<{ tensor: OrtTensor; original: { width: number; height: number } }> {
  const original = await getImageSize(uri);
  const resized = await manipulateAsync(
    uri,
    [{ resize: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT } }],
    { compress: 1, format: SaveFormat.JPEG, base64: true },
  );
  if (!resized.base64) throwLocalAiError('image_preparation_failed');
  const decoded = jpeg.decode(toByteArray(resized.base64), { useTArray: true });
  if (decoded.width !== IMAGE_WIDTH || decoded.height !== IMAGE_HEIGHT) throwLocalAiError('image_dimensions_invalid');

  const pixels = IMAGE_WIDTH * IMAGE_HEIGHT;
  const values = new Float32Array(3 * pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const source = pixel * 4;
    values[pixel] = decoded.data[source] / 255;
    values[pixels + pixel] = decoded.data[source + 1] / 255;
    values[(pixels * 2) + pixel] = decoded.data[source + 2] / 255;
  }
  return { tensor: new ort.Tensor('float32', values, [1, 3, IMAGE_HEIGHT, IMAGE_WIDTH]), original };
}

export async function analyzeImageLocally(uri: string): Promise<AiAnalysis> {
  const ort = await getOrt();
  const session = await getSession();
  const { tensor, original } = await imageToTensor(uri, ort);
  const output = await session.run({ image: tensor });
  const logits = output.logits?.data;
  if (!(logits instanceof Float32Array)) throwLocalAiError('invalid_model_output');
  return decodeAnalysis(logits, original);
}
