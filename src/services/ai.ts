import { Platform } from 'react-native';

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
  const endpoint = getAiApiUrl();
  const body = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('อ่านภาพสำหรับ AI ไม่สำเร็จ');
    body.append('file', await response.blob(), 'stepable-camera.jpg');
  } else {
    body.append('file', { uri, name: 'stepable-camera.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  let response: Response;
  try {
    response = await fetch(`${endpoint}/v1/analyze`, { method: 'POST', body });
  } catch {
    if (/localhost|127\.0\.0\.1/.test(endpoint)) {
      throw new Error(`มือถือเชื่อมต่อ ${endpoint} ไม่ได้: ใช้ IP ของคอมพิวเตอร์ในวง LAN แทน localhost`);
    }
    throw new Error(`เชื่อมต่อ AI server ไม่ได้ที่ ${endpoint}: ตรวจว่า server เปิดอยู่และมือถืออยู่ Wi-Fi เดียวกัน`);
  }
  const payload = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new Error(payload?.detail || `AI server ตอบกลับ ${response.status}`);
  return payload as unknown as AiAnalysis;
}
