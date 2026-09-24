import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';
import { Image, Platform } from 'react-native';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { AiAnalysis } from './ai';
import { throwLocalAiError } from './local-ai-errors';
import { decodeAnalysis, IMAGE_HEIGHT, IMAGE_WIDTH } from './local-ai-shared';

import modelAsset from '../../assets/models/stepable-unet3plus.int8.onnx';
import depthModelAsset from '../../assets/models/depth-anything-v2-metric-outdoor-small.int8.onnx';

const MODEL_NAME = 'stepable-unet3plus.int8.onnx';
const DEPTH_MODEL_NAME = 'depth-anything-v2-metric-outdoor-small.int8.onnx';
const DEPTH_SIZE = 280;
const DEPTH_MEAN = [0.485, 0.456, 0.406];
const DEPTH_STD = [0.229, 0.224, 0.225];

type ModelSession = Awaited<ReturnType<typeof InferenceSession.create>>;
let sessionPromise: Promise<ModelSession> | null = null;
let depthSessionPromise: Promise<ModelSession> | null = null;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function getSession(): Promise<ModelSession> {
  if (Platform.OS === 'web') throwLocalAiError('mobile_build_required');
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const asset = Asset.fromModule(modelAsset);
      await asset.downloadAsync();
      const sourceUri = asset.localUri ?? asset.uri;
      if (!sourceUri) throwLocalAiError('model_unavailable');

      // Copy out of the read-only app bundle. This is required by some iOS
      // standalone builds before ONNX Runtime can open a bundled asset.
      const source = new File(sourceUri);
      const destination = new File(Paths.document, MODEL_NAME);
      if (!destination.exists) await source.copy(destination);
      return InferenceSession.create(destination.uri, { executionProviders: ['cpu'] });
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function getDepthSession(): Promise<ModelSession> {
  if (!depthSessionPromise) {
    depthSessionPromise = (async () => {
      const asset = Asset.fromModule(depthModelAsset);
      await asset.downloadAsync();
      const sourceUri = asset.localUri ?? asset.uri;
      if (!sourceUri) throwLocalAiError('model_unavailable');
      const source = new File(sourceUri);
      const destination = new File(Paths.document, DEPTH_MODEL_NAME);
      if (!destination.exists) await source.copy(destination);
      return InferenceSession.create(destination.uri, { executionProviders: ['cpu'] });
    })().catch((error) => {
      depthSessionPromise = null;
      throw error;
    });
  }
  return depthSessionPromise;
}

async function imageToDepthTensor(uri: string, original: { width: number; height: number }) {
  const scale = DEPTH_SIZE / Math.max(original.width, original.height);
  const width = Math.max(1, Math.round(original.width * scale));
  const height = Math.max(1, Math.round(original.height * scale));
  const resized = await manipulateAsync(uri, [{ resize: { width, height } }], { compress: 1, format: SaveFormat.JPEG, base64: true });
  if (!resized.base64) throwLocalAiError('image_preparation_failed');
  const decoded = jpeg.decode(toByteArray(resized.base64), { useTArray: true });
  if (decoded.width > DEPTH_SIZE || decoded.height > DEPTH_SIZE) throwLocalAiError('image_dimensions_invalid');
  const offsetX = Math.floor((DEPTH_SIZE - decoded.width) / 2);
  const offsetY = Math.floor((DEPTH_SIZE - decoded.height) / 2);
  const pixels = DEPTH_SIZE * DEPTH_SIZE;
  const values = new Float32Array(3 * pixels);
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const source = (y * decoded.width + x) * 4;
      const pixel = (y + offsetY) * DEPTH_SIZE + x + offsetX;
      for (let channel = 0; channel < 3; channel += 1) {
        values[channel * pixels + pixel] = (decoded.data[source + channel] / 255 - DEPTH_MEAN[channel]) / DEPTH_STD[channel];
      }
    }
  }
  return { tensor: new Tensor('float32', values, [1, 3, DEPTH_SIZE, DEPTH_SIZE]), width: decoded.width, height: decoded.height, offsetX, offsetY };
}

function estimateObstacleMeters(depth: Float32Array, obstacle: AiAnalysis['obstacles'][number], image: AiAnalysis['image'], frame: { width: number; height: number; offsetX: number; offsetY: number }): number | undefined {
  const values: number[] = [];
  for (const yFraction of [0.3, 0.5, 0.7]) {
    for (const xFraction of [0.3, 0.5, 0.7]) {
      const imageX = obstacle.bbox.x + obstacle.bbox.width * xFraction;
      const imageY = obstacle.bbox.y + obstacle.bbox.height * yFraction;
      const x = Math.min(DEPTH_SIZE - 1, Math.max(0, Math.floor(frame.offsetX + imageX / image.width * frame.width)));
      const y = Math.min(DEPTH_SIZE - 1, Math.max(0, Math.floor(frame.offsetY + imageY / image.height * frame.height)));
      const meters = depth[y * DEPTH_SIZE + x];
      if (Number.isFinite(meters) && meters >= 0.5 && meters <= 30) values.push(meters);
    }
  }
  if (values.length < 5) return undefined;
  values.sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  return Number((Math.round(median * 2) / 2).toFixed(1));
}

async function imageToTensor(uri: string): Promise<{ tensor: Tensor; original: { width: number; height: number } }> {
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
  return { tensor: new Tensor('float32', values, [1, 3, IMAGE_HEIGHT, IMAGE_WIDTH]), original };
}

export async function analyzeImageLocally(uri: string): Promise<AiAnalysis> {
  const session = await getSession();
  const { tensor, original } = await imageToTensor(uri);
  const output = await session.run({ image: tensor });
  const logits = output.logits?.data;
  if (!(logits instanceof Float32Array)) throwLocalAiError('invalid_model_output');
  const analysis = decodeAnalysis(logits, original);
  if (!analysis.obstacles.length) return analysis;
  try {
    const [depthSession, frame] = await Promise.all([getDepthSession(), imageToDepthTensor(uri, original)]);
    const depth = (await depthSession.run({ image: frame.tensor })).depth?.data;
    if (!(depth instanceof Float32Array) || depth.length !== DEPTH_SIZE * DEPTH_SIZE) return analysis;
    for (const obstacle of analysis.obstacles) {
      obstacle.distanceMeters = estimateObstacleMeters(depth, obstacle, original, frame);
    }
  } catch {
    // Keep object warnings available if the optional depth model cannot run.
  }
  return analysis;
}
