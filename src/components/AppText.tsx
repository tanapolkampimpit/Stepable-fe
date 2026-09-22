import { useMemo, type ComponentProps } from 'react';
import { StyleSheet, Text as NativeText, type TextStyle } from 'react-native';
import { useAppData } from './AppDataContext';

type AppTextProps = ComponentProps<typeof NativeText>;

export function AppText({ style, ...props }: AppTextProps) {
  const { preferences } = useAppData();
  const scaledStyle = useMemo(() => scaleStyle(style, preferences.fontScale), [preferences.fontScale, style]);
  return <NativeText {...props} maxFontSizeMultiplier={1.8} style={scaledStyle} />;
}

function scaleStyle(style: AppTextProps['style'], scale: number): TextStyle | TextStyle[] | undefined {
  const flattened = StyleSheet.flatten(style);
  const next: TextStyle = { ...flattened };
  if (typeof next.fontSize === 'number') next.fontSize *= scale;
  if (typeof next.lineHeight === 'number') next.lineHeight *= scale;
  next.fontFamily = notoSansThaiFamily(next.fontWeight);
  delete next.fontWeight;
  return next;
}

function notoSansThaiFamily(weight: TextStyle['fontWeight']) {
  const numericWeight = typeof weight === 'string' ? Number.parseInt(weight, 10) : weight;
  if (numericWeight && numericWeight >= 900) return 'NotoSansThai_900Black';
  if (numericWeight && numericWeight >= 800) return 'NotoSansThai_800ExtraBold';
  if (numericWeight && numericWeight >= 700) return 'NotoSansThai_700Bold';
  if (numericWeight && numericWeight >= 600) return 'NotoSansThai_600SemiBold';
  if (numericWeight && numericWeight >= 500) return 'NotoSansThai_500Medium';
  return 'NotoSansThai_400Regular';
}
