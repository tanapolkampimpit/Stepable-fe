import type { IssueType } from '../../i18n/reports';
import type { IconName } from '../ui/Icon';

export const issueAppearance = {
  damaged_sidewalk: { icon: 'sidewalk-damage', color: '#1959C6', background: '#F5F8FF', border: '#81ADFF' },
  obstacle: { icon: 'traffic-cone', color: '#C6531D', background: '#FFF9F5', border: '#FFBD98' },
  poor_lighting: { icon: 'streetlight', color: '#986409', background: '#FFFCF5', border: '#F5D193' },
  missing_ramp: { icon: 'wheelchair', color: '#087785', background: '#F3FCFE', border: '#A9DEE7' },
  damaged_drain: { icon: 'drain', color: '#6735AE', background: '#FBF8FF', border: '#D8BEFF' },
  unsafe_crossing: { icon: 'crosswalk', color: '#C83235', background: '#FFF8F8', border: '#FFBEC2' },
} as const satisfies Record<IssueType, { icon: IconName; color: string; background: string; border: string }>;
