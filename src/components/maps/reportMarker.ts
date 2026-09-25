import type { IssueType } from '../../i18n/reports';
import { getIconPaths } from '../ui/Icon';
import { issueAppearance } from '../reports/reportAppearance';

export type ReportMarkerIcon = (typeof issueAppearance)[IssueType]['icon'];
export const reportMarkerIcons: ReportMarkerIcon[] = Object.values(issueAppearance).map((appearance) => appearance.icon);

export function reportMarkerIconFor(type: IssueType): ReportMarkerIcon {
  return issueAppearance[type].icon;
}

export const reportMarkerIconPathsJson = JSON.stringify(
  Object.fromEntries(reportMarkerIcons.map((icon) => [icon, getIconPaths(icon)])),
);
