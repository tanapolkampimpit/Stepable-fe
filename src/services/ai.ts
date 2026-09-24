import { analyzeImageLocally } from './local-ai';

export type AiDetection = {
  className: string;
  confidence: number;
  position: 'ซ้าย' | 'ตรงหน้า' | 'ขวา' | string;
  distanceBand: 'ใกล้' | 'ข้างหน้า' | string;
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
  if (!value) throw new Error('ยังไม่ได้ตั้งค่า EXPO_PUBLIC_AI_API_URL สำหรับ AI server');
  if (value.includes('YOUR_LAN_IP')) throw new Error('กรุณาแทน YOUR_LAN_IP ด้วย IP ของคอมพิวเตอร์ที่รัน AI server');
  return value;
}

export async function analyzeImage(uri: string): Promise<AiAnalysis> {
  return analyzeImageLocally(uri);
}
