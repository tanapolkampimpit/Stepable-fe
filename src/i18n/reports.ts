import { t, type TranslationKey } from './core';
import type { LocalReport } from '../providers/app-data/types';

export const issueTypes = ['damaged_sidewalk', 'obstacle', 'poor_lighting', 'missing_ramp', 'damaged_drain', 'unsafe_crossing'] as const;
export type IssueType = (typeof issueTypes)[number];
export const severities = ['low', 'medium', 'high'] as const;
export type Severity = (typeof severities)[number];
const issueKeys: Record<IssueType, TranslationKey> = {
  damaged_sidewalk: 'reportissue.damagedSidewalk', obstacle: 'reportissue.obstacle',
  poor_lighting: 'reportissue.poorLighting', missing_ramp: 'reportissue.missingRamp',
  damaged_drain: 'reportissue.damagedDrainCover', unsafe_crossing: 'reportissue.unsafeCrossing',
};
const severityKeys: Record<Severity, TranslationKey> = {
  low: 'reportissue.low', medium: 'alerts.medium', high: 'alerts.high',
};
// Compatibility with reports saved before language-independent IDs existed.
const legacyIssues: Record<string, IssueType> = {
  'ทางเท้าชำรุด': 'damaged_sidewalk', 'สิ่งกีดขวาง': 'obstacle', 'ทางมืด': 'poor_lighting',
  'ไม่มีทางลาด': 'missing_ramp', 'ฝาท่อชำรุด': 'damaged_drain', 'ทางม้าลายอันตราย': 'unsafe_crossing',
};
const legacySeverities: Record<string, Severity> = { 'ต่ำ': 'low', 'ปานกลาง': 'medium', 'สูง': 'high' };
export function issueLabel(value: string) {
  const key = issueKeys[(legacyIssues[value] ?? value) as IssueType];
  return key ? t(key) : value;
}
export function severityLabel(value: string) {
  const key = severityKeys[(legacySeverities[value] ?? value) as Severity];
  return key ? t(key) : value;
}
export function migrateReports(reports: LocalReport[]): LocalReport[] {
  return reports.map((report) => ({ ...report,
    type: legacyIssues[report.type] ?? report.type,
    severity: legacySeverities[report.severity] ?? report.severity,
  }));
}
