import { message, LocalizedError, getLanguage } from '../i18n/core';
import { Platform } from 'react-native';

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

export function getAiApiUrl() {
  const value = process.env.EXPO_PUBLIC_AI_API_URL?.trim().replace(/\/$/, '');
  if (!value) throw new LocalizedError(message('service.expoPublicAiApiUrlIsNot'));
  if (value.includes('YOUR_LAN_IP')) throw new LocalizedError(message('service.replaceYourLanIpWithTheIp'));
  return value;
}

export async function analyzeImage(uri: string): Promise<AiAnalysis> {
  const endpoint = getAiApiUrl();
  const body = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new LocalizedError(message('service.couldNotReadTheImageForAi'));
    body.append('file', await response.blob(), 'stepable-camera.jpg');
  } else {
    body.append('file', { uri, name: 'stepable-camera.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  let response: Response;
  try {
    response = await fetch(`${endpoint}/v1/analyze`, { method: 'POST', headers: { 'Accept-Language': getLanguage() }, body });
  } catch {
    if (/localhost|127\.0\.0\.1/.test(endpoint)) {
      throw new LocalizedError(message('service.cannotConnectToUseYourComputerS', { value0: endpoint }));
    }
    throw new LocalizedError(message('service.cannotConnectToTheAiServerAt', { value0: endpoint }));
  }
  const payload = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new LocalizedError(message('service.aiServerReturnedStatus', { value0: response.status }));
  return payload as unknown as AiAnalysis;
}
