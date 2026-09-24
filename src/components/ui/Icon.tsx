import Svg, { Path } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'map'
  | 'search'
  | 'route'
  | 'sparkles'
  | 'user'
  | 'pin'
  | 'locate'
  | 'plus'
  | 'minus'
  | 'wheelchair'
  | 'arrow-right'
  | 'chevron-right'
  | 'chevron-down'
  | 'bell'
  | 'back'
  | 'camera'
  | 'message'
  | 'send'
  | 'check'
  | 'warning'
  | 'clock'
  | 'star'
  | 'sun'
  | 'sliders'
  | 'microphone'
  | 'restaurant'
  | 'bed'
  | 'fuel'
  | 'edit'
  | 'shield'
  | 'volume'
  | 'vibration'
  | 'globe'
  | 'briefcase'
  | 'graduation'
  | 'swap'
  | 'navigation'
  | 'flag'
  | 'info'
  | 'walk'
  | 'crosswalk'
  | 'park'
  | 'flashlight'
  | 'refresh'
  | 'upload'
  | 'more'
  | 'play'
  | 'pause'
  | 'close';

const paths: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9v12h14V9', 'M9 21v-7h6v7'],
  map: ['m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z', 'M8 3v15', 'M16 6v15'],
  search: ['M20 20l-4.5-4.5', 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z'],
  route: ['M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z', 'M18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z', 'M6 8v5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2'],
  sparkles: ['m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z', 'm19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z', 'M5 3v3', 'M3.5 4.5h3'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  pin: ['M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z', 'M12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  locate: ['M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'M12 12h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  wheelchair: ['M12 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M11 7l-1 5h5l3 4', 'M9 12a6 6 0 1 0 5.7 7.9', 'M12 8l3 2'],
  'arrow-right': ['M5 12h14', 'm13 6 6 6-6 6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  back: ['M19 12H5', 'm12 19-7-7 7-7'],
  camera: ['M4 7h3l2-3h6l2 3h3v13H4Z', 'M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  message: ['M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z'],
  send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
  check: ['m5 12 4 4L19 6'],
  warning: ['M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z', 'M12 9v4', 'M12 17h.01'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 6v6l4 2'],
  star: ['m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z'],
  sun: ['M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'M12 2v2', 'M12 20v2', 'm4.9 4.9 1.4 1.4', 'm17.7 17.7 1.4 1.4', 'M2 12h2', 'M20 12h2', 'm4.9 19.1 1.4-1.4', 'm17.7 6.3 1.4-1.4'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M2 14h4', 'M10 8h4', 'M18 16h4'],
  microphone: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3', 'M8 22h8'],
  restaurant: ['M3 2v8a3 3 0 0 0 6 0V2', 'M6 2v20', 'M15 2v20', 'M15 2c4 2 5 6 5 9h-5'],
  bed: ['M3 19v-8h18v8', 'M3 15h18', 'M6 11V7h5a4 4 0 0 1 4 4'],
  fuel: ['M4 22V3h11v19', 'M3 22h13', 'M7 7h5', 'm15 7-3-3v13a2 2 0 0 0 4 0V9l-2-2'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z', 'm9 12 2 2 4-4'],
  volume: ['M11 5 6 9H2v6h4l5 4Z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18 6a8 8 0 0 1 0 12'],
  vibration: ['M8 5h8v14H8Z', 'M4 8v8', 'M20 8v8', 'M1 10v4', 'M23 10v4'],
  globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M2 12h20', 'M12 2c3 3 4 6 4 10s-1 7-4 10c-3-3-4-6-4-10s1-7 4-10Z'],
  briefcase: ['M4 7h16v13H4Z', 'M9 7V4h6v3', 'M4 12h16', 'M10 12v2h4v-2'],
  graduation: ['m2 10 10-5 10 5-10 5Z', 'M6 12v5c3 2 9 2 12 0v-5', 'M22 10v6'],
  swap: ['M7 7h12l-3-3', 'm19 7-3 3', 'M17 17H5l3 3', 'm5 17 3-3'],
  navigation: ['m3 11 18-8-8 18-2-8Z'],
  flag: ['M5 22V4', 'M5 4h12l-2 4 2 4H5'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 10v7', 'M12 7h.01'],
  walk: ['M13 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'm10 22 2-7 3 3v4', 'm7 22 2-8-3-3', 'm9 8 4 3 4-1'],
  crosswalk: ['M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'm9 22 2-7 3 3v4', 'm6 22 3-8-3-3', 'm9 8 4 3 4-1', 'M2 4h4', 'M18 4h4', 'M2 20h3', 'M19 20h3'],
  park: ['M12 2 7 9h3l-5 7h6v6h2v-6h6l-5-7h3l-5-7Z'],
  flashlight: ['m9 2 6 0 1 5-8 0Z', 'M8 7h8l-1 15H9Z', 'M12 11v6'],
  refresh: ['M20 11a8 8 0 0 0-14.7-4L3 10', 'M3 4v6h6', 'M4 13a8 8 0 0 0 14.7 4L21 14', 'M21 20v-6h-6'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 20h16'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  play: ['m8 5 11 7-11 7Z'],
  pause: ['M8 5v14', 'M16 5v14'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
};

type IconProps = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 20, color = '#18362F', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityRole="image">
      {paths[name].map((d, index) => <Path key={`${name}-${index}`} d={d} />)}
    </Svg>
  );
}
