import { LocalizedError, message } from '../i18n/core';
import { analyzeImageLocally } from './local-ai';

export type AiDetection = {
  className: string;
  confidence: number;
  position: string;
  distanceBand: string;
  bbox: { x: number; y: number; width: number; height: number };
};

export type AiAnalysis = {
  model: string;
  image: { width: number; height: number };
  classes: string[];
  sidewalkCoverage: number;
  obstacles: AiDetection[];
};

// Kept for walking-route requests, which still use the configured backend.
export function getAiApiUrl() {
  const value = process.env.EXPO_PUBLIC_AI_API_URL?.trim().replace(/\/$/, '');
  if (!value) throw new LocalizedError(message('service.expoPublicAiApiUrlIsNot'));
  if (value.includes('YOUR_LAN_IP')) throw new LocalizedError(message('service.replaceYourLanIpWithTheIp'));
  return value;
}

export async function analyzeImage(uri: string): Promise<AiAnalysis> {
  try {
    return await analyzeImageLocally(uri);
  } catch (error) {
    if (error instanceof LocalizedError) throw error;
    throw new LocalizedError(message('ai.analysisFailed'));
  }
}
