import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';
import { Image, Platform } from 'react-native';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { AiAnalysis, AiDetection } from './ai';

import modelAsset from '../../assets/models/stepable-unet3plus.int8.onnx';

const MODEL_NAME = 'stepable-unet3plus.int8.onnx';
const IMAGE_WIDTH = 512;
const IMAGE_HEIGHT = 288;
const CLASSES = ['person', 'vehicle', 'two_wheeler', 'road_sidewalk', 'building', 'vegetation', 'street_fixture'];
const OBSTACLE_CLASS_NAMES = new Set(['person', 'vehicle', 'two_wheeler', 'street_fixture']);

type ModelSession = Awaited<ReturnType<typeof InferenceSession.create>>;
let sessionPromise: Promise<ModelSession> | null = null;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function getSession(): Promise<ModelSession> {
  if (Platform.OS === 'web') throw new Error('On-device AI ต้องใช้ Development Build บน Android หรือ iOS');
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const asset = Asset.fromModule(modelAsset);
      await asset.downloadAsync();
      const sourceUri = asset.localUri ?? asset.uri;
      if (!sourceUri) throw new Error('ไม่พบไฟล์โมเดล ONNX ในแอป');

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

async function imageToTensor(uri: string): Promise<{ tensor: Tensor; original: { width: number; height: number } }> {
  const original = await getImageSize(uri);
  const resized = await manipulateAsync(
    uri,
    [{ resize: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT } }],
    { compress: 1, format: SaveFormat.JPEG, base64: true },
  );
  if (!resized.base64) throw new Error('แปลงภาพสำหรับ AI ไม่สำเร็จ');
  const decoded = jpeg.decode(toByteArray(resized.base64), { useTArray: true });
  if (decoded.width !== IMAGE_WIDTH || decoded.height !== IMAGE_HEIGHT) throw new Error('ขนาดภาพสำหรับ AI ไม่ถูกต้อง');

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

function decodeAnalysis(logits: Float32Array, original: { width: number; height: number }): AiAnalysis {
  const pixels = IMAGE_WIDTH * IMAGE_HEIGHT;
  const pixelCounts = new Int32Array(CLASSES.length);
  const confidenceSums = new Float64Array(CLASSES.length);
  const minX = new Int32Array(CLASSES.length).fill(IMAGE_WIDTH);
  const minY = new Int32Array(CLASSES.length).fill(IMAGE_HEIGHT);
  const maxX = new Int32Array(CLASSES.length).fill(-1);
  const maxY = new Int32Array(CLASSES.length).fill(-1);

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    let bestClass = 0;
    let bestLogit = logits[pixel];
    let maxLogit = bestLogit;
    for (let classIndex = 1; classIndex < CLASSES.length; classIndex += 1) {
      const value = logits[classIndex * pixels + pixel];
      if (value > bestLogit) {
        bestLogit = value;
        bestClass = classIndex;
      }
      if (value > maxLogit) maxLogit = value;
    }

    let normalizer = 0;
    for (let classIndex = 0; classIndex < CLASSES.length; classIndex += 1) {
      normalizer += Math.exp(logits[classIndex * pixels + pixel] - maxLogit);
    }
    const confidence = Math.exp(bestLogit - maxLogit) / normalizer;
    const x = pixel % IMAGE_WIDTH;
    const y = Math.floor(pixel / IMAGE_WIDTH);
    pixelCounts[bestClass] += 1;
    confidenceSums[bestClass] += confidence;
    minX[bestClass] = Math.min(minX[bestClass], x);
    minY[bestClass] = Math.min(minY[bestClass], y);
    maxX[bestClass] = Math.max(maxX[bestClass], x);
    maxY[bestClass] = Math.max(maxY[bestClass], y);
  }

  const obstacles: AiDetection[] = [];
  for (let classIndex = 0; classIndex < CLASSES.length; classIndex += 1) {
    const className = CLASSES[classIndex];
    const count = pixelCounts[classIndex];
    if (!OBSTACLE_CLASS_NAMES.has(className) || count < 24) continue;
    const confidence = confidenceSums[classIndex] / count;
    if (confidence < 0.42 || maxX[classIndex] < 0) continue;
    const x = Math.floor((minX[classIndex] / IMAGE_WIDTH) * original.width);
    const y = Math.floor((minY[classIndex] / IMAGE_HEIGHT) * original.height);
    const right = Math.ceil(((maxX[classIndex] + 1) / IMAGE_WIDTH) * original.width);
    const bottom = Math.ceil(((maxY[classIndex] + 1) / IMAGE_HEIGHT) * original.height);
    const centerX = ((x + right) / 2) / Math.max(1, original.width);
    const bottomRatio = bottom / Math.max(1, original.height);
    const areaRatio = ((right - x) * (bottom - y)) / Math.max(1, original.width * original.height);
    obstacles.push({
      className,
      confidence: Number(confidence.toFixed(3)),
      position: centerX < 0.35 ? 'ซ้าย' : centerX > 0.65 ? 'ขวา' : 'ตรงหน้า',
      distanceBand: bottomRatio > 0.82 || areaRatio > 0.18 ? 'ใกล้' : 'ข้างหน้า',
      bbox: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) },
    });
  }

  return {
    model: MODEL_NAME,
    image: original,
    classes: CLASSES,
    sidewalkCoverage: pixelCounts[3] / pixels,
    obstacles: obstacles.sort((first, second) => second.confidence - first.confidence),
  };
}

export async function analyzeImageLocally(uri: string): Promise<AiAnalysis> {
  const session = await getSession();
  const { tensor, original } = await imageToTensor(uri);
  const output = await session.run({ image: tensor });
  const logits = output.logits?.data;
  if (!(logits instanceof Float32Array)) throw new Error('โมเดล AI ส่งผลลัพธ์ไม่ถูกต้อง');
  return decodeAnalysis(logits, original);
}
