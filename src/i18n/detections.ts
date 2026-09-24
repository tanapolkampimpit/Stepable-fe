import { t } from './core';

/** Normalize the legacy AI API's direction labels at the display boundary. */
export function detectionPosition(value: string | undefined): string {
  if (value === 'left' || value === 'ซ้าย') return t('ai.left');
  if (value === 'right' || value === 'ขวา') return t('ai.right');
  return t('ai.ahead');
}
