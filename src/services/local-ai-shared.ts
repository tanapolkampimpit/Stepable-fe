import type { AiAnalysis, AiDetection } from './ai';
import { aiResultLabels } from '../i18n/detections';

export const IMAGE_WIDTH = 512;
export const IMAGE_HEIGHT = 288;
export const CLASSES = ['person', 'vehicle', 'two_wheeler', 'road_sidewalk', 'building', 'vegetation', 'street_fixture'];
const OBSTACLE_CLASSES = new Set([0, 1, 2, 6]);

export function decodeAnalysis(logits: Float32Array, original: { width: number; height: number }): AiAnalysis {
  const pixels = IMAGE_WIDTH * IMAGE_HEIGHT;
  const classMap = new Uint8Array(pixels);
  const confidenceMap = new Float32Array(pixels);
  let roadSidewalkPixels = 0;
  const sideSurfacePixels = [0, 0];

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    let bestClass = 0;
    let bestLogit = logits[pixel];
    for (let classIndex = 1; classIndex < CLASSES.length; classIndex += 1) {
      const value = logits[classIndex * pixels + pixel];
      if (value > bestLogit) {
        bestLogit = value;
        bestClass = classIndex;
      }
    }
    classMap[pixel] = bestClass;
    if (bestClass === 3) {
      roadSidewalkPixels += 1;
      const x = pixel % IMAGE_WIDTH;
      const y = Math.floor(pixel / IMAGE_WIDTH);
      if (y >= IMAGE_HEIGHT / 2) {
        if (x >= IMAGE_WIDTH * 0.05 && x < IMAGE_WIDTH * 0.35) sideSurfacePixels[0] += 1;
        if (x >= IMAGE_WIDTH * 0.65 && x < IMAGE_WIDTH * 0.95) sideSurfacePixels[1] += 1;
      }
    }
    if (!OBSTACLE_CLASSES.has(bestClass)) continue;
    let normalizer = 0;
    for (let classIndex = 0; classIndex < CLASSES.length; classIndex += 1) {
      normalizer += Math.exp(logits[classIndex * pixels + pixel] - bestLogit);
    }
    confidenceMap[pixel] = 1 / normalizer;
  }

  // Segmentation labels pixels, not instances. Keep separate connected objects separate.
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const obstacles: AiDetection[] = [];
  for (let start = 0; start < pixels; start += 1) {
    const classIndex = classMap[start];
    if (!OBSTACLE_CLASSES.has(classIndex) || visited[start]) continue;
    visited[start] = 1;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    let minX = IMAGE_WIDTH;
    let minY = IMAGE_HEIGHT;
    let maxX = -1;
    let maxY = -1;
    let confidenceSum = 0;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % IMAGE_WIDTH;
      const y = Math.floor(pixel / IMAGE_WIDTH);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      confidenceSum += confidenceMap[pixel];
      if (x > 0 && !visited[pixel - 1] && classMap[pixel - 1] === classIndex) {
        visited[pixel - 1] = 1;
        queue[tail++] = pixel - 1;
      }
      if (x < IMAGE_WIDTH - 1 && !visited[pixel + 1] && classMap[pixel + 1] === classIndex) {
        visited[pixel + 1] = 1;
        queue[tail++] = pixel + 1;
      }
      if (y > 0 && !visited[pixel - IMAGE_WIDTH] && classMap[pixel - IMAGE_WIDTH] === classIndex) {
        visited[pixel - IMAGE_WIDTH] = 1;
        queue[tail++] = pixel - IMAGE_WIDTH;
      }
      if (y < IMAGE_HEIGHT - 1 && !visited[pixel + IMAGE_WIDTH] && classMap[pixel + IMAGE_WIDTH] === classIndex) {
        visited[pixel + IMAGE_WIDTH] = 1;
        queue[tail++] = pixel + IMAGE_WIDTH;
      }
    }
    if (tail < 24 || confidenceSum / tail < 0.42) continue;
    const x = Math.floor((minX / IMAGE_WIDTH) * original.width);
    const y = Math.floor((minY / IMAGE_HEIGHT) * original.height);
    const right = Math.ceil(((maxX + 1) / IMAGE_WIDTH) * original.width);
    const bottom = Math.ceil(((maxY + 1) / IMAGE_HEIGHT) * original.height);
    const centerX = ((x + right) / 2) / Math.max(1, original.width);
    const bottomRatio = bottom / Math.max(1, original.height);
    const areaRatio = ((right - x) * (bottom - y)) / Math.max(1, original.width * original.height);
    obstacles.push({
      className: CLASSES[classIndex],
      confidence: Number((confidenceSum / tail).toFixed(3)),
      position: centerX < 0.35 ? aiResultLabels.position.left : centerX > 0.65 ? aiResultLabels.position.right : aiResultLabels.position.ahead,
      // Bottom of image and pixel size indicate only rough visual proximity.
      distanceBand: bottomRatio > 0.82 || areaRatio > 0.18 ? aiResultLabels.distance.near : aiResultLabels.distance.fartherAhead,
      bbox: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) },
    });
  }

  const sideArea = IMAGE_WIDTH * 0.3 * IMAGE_HEIGHT * 0.5;
  const leftCoverage = sideSurfacePixels[0] / sideArea;
  const rightCoverage = sideSurfacePixels[1] / sideArea;
  const visualSide = Math.max(leftCoverage, rightCoverage) >= 0.25 && Math.abs(leftCoverage - rightCoverage) >= 0.15
    ? leftCoverage > rightCoverage ? 'left' : 'right'
    : null;
  return {
    model: 'stepable-unet3plus.int8.onnx',
    image: original,
    classes: CLASSES,
    sidewalkCoverage: roadSidewalkPixels / pixels,
    obstacles: obstacles.sort((first, second) => second.bbox.y + second.bbox.height - first.bbox.y - first.bbox.height),
    visualSide,
  };
}
