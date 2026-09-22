import { useEffect } from 'react';
import { SplashScreen, Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { NotoSansThai_400Regular } from '@expo-google-fonts/noto-sans-thai/400Regular';
import { NotoSansThai_500Medium } from '@expo-google-fonts/noto-sans-thai/500Medium';
import { NotoSansThai_600SemiBold } from '@expo-google-fonts/noto-sans-thai/600SemiBold';
import { NotoSansThai_700Bold } from '@expo-google-fonts/noto-sans-thai/700Bold';
import { NotoSansThai_800ExtraBold } from '@expo-google-fonts/noto-sans-thai/800ExtraBold';
import { NotoSansThai_900Black } from '@expo-google-fonts/noto-sans-thai/900Black';
import { BottomNavigationProvider } from '../components/bottom-navigation/BottomNavigationContext';
import { AppDataProvider } from '../components/AppDataContext';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansThai_400Regular,
    NotoSansThai_500Medium,
    NotoSansThai_600SemiBold,
    NotoSansThai_700Bold,
    NotoSansThai_800ExtraBold,
    NotoSansThai_900Black,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <BottomNavigationProvider>
      <AppDataProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="navigate" />
          <Stack.Screen name="report-issue" options={{ presentation: 'modal' }} />
        </Stack>
      </AppDataProvider>
    </BottomNavigationProvider>
  );
}
