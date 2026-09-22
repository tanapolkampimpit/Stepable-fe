import { useCallback, useRef, type ReactNode } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useBottomNavigation } from './bottom-navigation/BottomNavigationContext';

type ScreenProps = { children: ReactNode; contentStyle?: ViewStyle };

export function Screen({ children, contentStyle }: ScreenProps) {
  const { setCompact } = useBottomNavigation();
  const referenceY = useRef(0);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);

  useFocusEffect(useCallback(() => {
    referenceY.current = 0;
    setCompact(false);
  }, [setCompact]));

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollable = contentSize.height > layoutMeasurement.height + 4;
    const y = Math.max(0, contentOffset.y);

    if (!scrollable || y <= 4) {
      referenceY.current = y;
      setCompact(false);
      return;
    }

    const movement = y - referenceY.current;
    if (Math.abs(movement) < 12) return;

    if (y > 40 && movement > 0) setCompact(true);
    if (movement < 0) setCompact(false);
    referenceY.current = y;
  }, [setCompact]);

  const checkScrollable = useCallback(() => {
    if (contentHeight.current <= viewportHeight.current + 4) {
      referenceY.current = 0;
      setCompact(false);
    }
  }, [setCompact]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    checkScrollable();
  }, [checkScrollable]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={(_, height) => { contentHeight.current = height; checkScrollable(); }}
        onLayout={handleLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28, gap: 16 },
});
