import { Platform } from 'react-native';

export type AiDetection = {
  className: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};

export type AiAnalysis = {
  model: string;
  image: { width: number; height: number };
  classes: string[];
  sidewalkCoverage: number;
  obstacles: AiDetection[];
};

function apiUrl() {
  const value = process.env.EXPO_PUBLIC_AI_API_URL?.trim().replace(/\/$/, '');
  if (!value) throw new Error('ยังไม่ได้ตั้งค่า EXPO_PUBLIC_AI_API_URL สำหรับ AI server');
  return value;
}

export async function analyzeImage(uri: string): Promise<AiAnalysis> {
  const body = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('อ่านภาพสำหรับ AI ไม่สำเร็จ');
    body.append('file', await response.blob(), 'stepable-camera.jpg');
  } else {
    body.append('file', { uri, name: 'stepable-camera.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  const response = await fetch(`${apiUrl()}/v1/analyze`, { method: 'POST', body });
  const payload = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new Error(payload?.detail || `AI server ตอบกลับ ${response.status}`);
  return payload as unknown as AiAnalysis;
}
