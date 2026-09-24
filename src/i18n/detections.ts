import { t } from './core';

// Keep the existing local-model result vocabulary stable at the display edge.
export const aiResultLabels = {
  position: { left: 'ซ้าย', right: 'ขวา', ahead: 'ตรงหน้า' },
  distance: { near: 'ใกล้', fartherAhead: 'ข้างหน้า' },
} as const;

/** Normalize the legacy AI API's direction labels at the display boundary. */
export function detectionPosition(value: string | undefined): string {
  if (value === 'left' || value === aiResultLabels.position.left) return t('ai.left');
  if (value === 'right' || value === aiResultLabels.position.right) return t('ai.right');
  return t('ai.ahead');
}

/** Normalize local and legacy API distance buckets at the display boundary. */
export function detectionDistance(value: string | undefined): string {
  if (value === aiResultLabels.distance.near || value === 'near') return t('ai.near');
  if (value === aiResultLabels.distance.fartherAhead || value === 'far' || value === 'ahead') return t('ai.fartherAhead');
  return t('ai.fartherAhead');
}
