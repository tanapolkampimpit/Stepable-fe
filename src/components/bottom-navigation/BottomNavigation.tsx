import { type ComponentProps, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Tabs } from 'expo-router';
import { Icon, type IconName } from '../Icon';
import { AppText as Text } from '../AppText';
import { useBottomNavigation } from './BottomNavigationContext';

const PRIMARY = '#2563EB';
const INACTIVE = '#64748B';
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabMeta: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'แผนที่', icon: 'map' },
  search: { label: 'ค้นหา', icon: 'search' },
  ai: { label: 'AI', icon: 'sparkles' },
  alerts: { label: 'แจ้งเตือน', icon: 'bell' },
  profile: { label: 'โปรไฟล์', icon: 'user' },
};

export function BottomNavigation({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { compact } = useBottomNavigation();
  const [progress] = useState(() => new Animated.Value(compact ? 1 : 0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const visibleRoutes = state.routes.filter((route) => tabMeta[route.name]);
  const activeRoute = state.routes[state.index]?.name;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: compact ? 1 : 0,
      duration: reduceMotion ? 0 : 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [compact, progress, reduceMotion]);

  if (activeRoute === 'ai' || activeRoute === 'routes') return null;

  return (
    <View style={[styles.bar, { height: 72 + insets.bottom, paddingBottom: insets.bottom }]}>
      <View style={styles.items}>
        {visibleRoutes.map((route) => {
          const routeIndex = state.routes.findIndex((candidate) => candidate.key === route.key);
          const focused = state.index === routeIndex;
          const meta = tabMeta[route.name];
          const options = descriptors[route.key].options;
          const isAi = route.name === 'ai';

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? meta.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onLongPress={onLongPress}
              onPress={onPress}
              style={styles.item}
              testID={options.tabBarButtonTestID}
            >
              {isAi ? (
                <AiIcon progress={progress} />
              ) : (
                <View style={styles.iconStage}>
                  <Icon name={meta.icon} size={25} color={focused ? PRIMARY : INACTIVE} strokeWidth={focused ? 2.2 : 1.9} />
                </View>
              )}
              <Text numberOfLines={1} style={[styles.label, { color: focused || isAi ? PRIMARY : INACTIVE }]}>
                {meta.label}
              </Text>
              {focused && !isAi ? <View style={styles.activeMark} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AiIcon({ progress }: { progress: Animated.Value }) {
  const expandedOpacity = progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 0, 0] });
  const compactOpacity = progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.52] });

  return (
    <View style={styles.iconStage}>
      <Animated.View style={[styles.aiCircle, { opacity: expandedOpacity, transform: [{ translateY }, { scale }] }]}>
        <Icon name="sparkles" size={31} color="#FFFFFF" strokeWidth={1.8} />
      </Animated.View>
      <Animated.View style={[styles.compactAi, { opacity: compactOpacity }]}>
        <Icon name="sparkles" size={25} color={PRIMARY} strokeWidth={2} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 16,
    overflow: 'visible',
  },
  items: { flex: 1, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 6, paddingTop: 7 },
  item: { flex: 1, minWidth: 44, minHeight: 56, alignItems: 'center', justifyContent: 'flex-start', position: 'relative' },
  iconStage: { width: 66, height: 35, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center', marginTop: 1 },
  activeMark: { position: 'absolute', bottom: 1, width: 24, height: 3, borderRadius: 2, backgroundColor: PRIMARY },
  aiCircle: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PRIMARY,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.28,
    shadowRadius: 10,
    elevation: 10,
  },
  compactAi: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
