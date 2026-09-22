import { Tabs } from 'expo-router';
import { BottomNavigation } from '../../components/bottom-navigation/BottomNavigation';

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <BottomNavigation {...props} />} screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
      <Tabs.Screen name="index" options={{ title: 'แผนที่', tabBarAccessibilityLabel: 'แผนที่' }} />
      <Tabs.Screen name="search" options={{ title: 'ค้นหา', tabBarAccessibilityLabel: 'ค้นหา' }} />
      <Tabs.Screen name="ai" options={{ title: 'AI', tabBarAccessibilityLabel: 'ผู้ช่วย AI' }} />
      <Tabs.Screen name="alerts" options={{ title: 'แจ้งเตือน', tabBarAccessibilityLabel: 'แจ้งเตือนความปลอดภัย' }} />
      <Tabs.Screen name="profile" options={{ title: 'โปรไฟล์', tabBarAccessibilityLabel: 'โปรไฟล์' }} />
      <Tabs.Screen name="routes" options={{ href: null }} />
    </Tabs>
  );
}
