import { LocalizedError, message } from '../i18n/core';

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

export function getAiApiUrl(): string {
  const value = process.env.EXPO_PUBLIC_AI_API_URL?.trim().replace(/\/$/, '');
  return value || 'client-side';
}

/**
 * On-device client-side vision analyzer.
 * Processes camera frames directly on the client for instant, zero-latency feedback
 * without requiring high bandwidth or continuous streaming to a server.
 */
export async function analyzeImage(uri: string): Promise<AiAnalysis> {
  try {
    const { analyzeImageLocally } = await import('./local-ai');
    return await analyzeImageLocally(uri);
  } catch (error) {
    if (error instanceof LocalizedError) throw error;
    throw new LocalizedError(message('ai.analysisFailed'));
  }
}
