import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '../ui/AppText';
import { colors } from '../../theme';

type PageHeaderProps = { eyebrow?: string; title: string; subtitle?: string };

export function PageHeader({ eyebrow, title, subtitle }: PageHeaderProps) {
  return (
    <View style={styles.wrap}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  eyebrow: { color: colors.forest, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  title: { color: '#102A72', fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
