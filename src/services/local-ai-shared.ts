import type { AiAnalysis, AiDetection } from './ai';

export const IMAGE_WIDTH = 512;
export const IMAGE_HEIGHT = 288;
export const CLASSES = ['person', 'vehicle', 'two_wheeler', 'road_sidewalk', 'building', 'vegetation', 'street_fixture'];
const OBSTACLE_CLASS_NAMES = new Set(['person', 'vehicle', 'two_wheeler', 'street_fixture']);

export function decodeAnalysis(logits: Float32Array, original: { width: number; height: number }): AiAnalysis {
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
    model: 'stepable-unet3plus.int8.onnx',
    image: original,
    classes: CLASSES,
    sidewalkCoverage: pixelCounts[3] / pixels,
    obstacles: obstacles.sort((first, second) => second.confidence - first.confidence),
  };
}
