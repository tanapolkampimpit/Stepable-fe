import { t, useLanguage } from '../../i18n';
import { Tabs } from 'expo-router';
import { BottomNavigation } from '../../components/navigation/BottomNavigation';

export default function TabLayout() {
  useLanguage();
  return (
    <Tabs tabBar={(props) => <BottomNavigation {...props} />} screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, freezeOnBlur: true }}>
      <Tabs.Screen name="index" options={{ title: t('common.map'), tabBarAccessibilityLabel: t('common.map') }} />
      <Tabs.Screen name="search" options={{ title: t('common.search'), tabBarAccessibilityLabel: t('common.search') }} />
      <Tabs.Screen name="ai" options={{ title: 'AI', tabBarAccessibilityLabel: t('common.aiAssistant') }} />
      <Tabs.Screen name="alerts" options={{ title: t('common.alerts'), tabBarAccessibilityLabel: t('common.safetyAlerts') }} />
      <Tabs.Screen name="profile" options={{ title: t('common.profile'), tabBarAccessibilityLabel: t('common.profile') }} />
      <Tabs.Screen name="routes" options={{ href: null }} />
    </Tabs>
  );
}
