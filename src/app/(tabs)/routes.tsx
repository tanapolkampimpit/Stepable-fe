import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../../components/Icon';
import { MapPreview } from '../../components/MapPreview';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../components/AppDataContext';
import { getWalkingRoute, type WalkingRoute } from '../../services/geo';
import { colors } from '../../theme';

type RouteMode = 'recommended' | 'shortest' | 'accessible';
const routeModes: { id: RouteMode; title: string; detail: string }[] = [
  { id: 'recommended', title: 'แนะนำ', detail: 'ทางเดินเท้าทั่วไป' },
  { id: 'shortest', title: 'ระยะสั้น', detail: 'เน้นระยะทางสั้น' },
  { id: 'accessible', title: 'เลี่ยงบันได', detail: 'เพิ่มค่าปรับบันได/เนิน' },
];

export default function RoutesScreen() {
  const { destination, lat, lon } = useLocalSearchParams<{ destination?: string; lat?: string; lon?: string }>();
  const { location, locationStatus, locationMessage, timeNow, preferences, savedPlaces, savePlace, removeSavedPlace, setNavigationPlan } = useAppData();
  const placeName = typeof destination === 'string' ? destination : '';
  const destinationPoint = useMemo(() => {
    const latitude = Number(lat);
    const longitude = Number(lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [lat, lon]);
  const [mode, setMode] = useState<RouteMode>(preferences.wheelchair ? 'accessible' : 'recommended');
  const [calculation, setCalculation] = useState<{ key: string; route: WalkingRoute | null; error: string }>({ key: '', route: null, error: '' });
  const [retryKey, setRetryKey] = useState(0);
  const saved = savedPlaces.some((item) => item.id === `search-${lat}-${lon}`);

  const calculationKey = destinationPoint && location
    ? `${destinationPoint.latitude},${destinationPoint.longitude}|${location.latitude},${location.longitude}|${mode}|${preferences.safeFirst}|${preferences.avoidSteps}|${preferences.wheelchair}|${retryKey}`
    : '';

  useEffect(() => {
    if (!destinationPoint || !location) return;
    let active = true;
    const request = getWalkingRoute(location, destinationPoint, {
      shortest: mode === 'shortest' || (mode === 'recommended' && !preferences.safeFirst),
      avoidSteps: preferences.avoidSteps || mode === 'accessible',
      wheelchair: preferences.wheelchair || mode === 'accessible',
    });
    void request.then((result) => { if (active) setCalculation({ key: calculationKey, route: result, error: '' }); }).catch((reason) => {
      if (active) setCalculation({ key: calculationKey, route: null, error: reason instanceof Error ? reason.message : 'คำนวณเส้นทางไม่สำเร็จ' });
    });
    return () => { active = false; };
  }, [calculationKey, destinationPoint, location, mode, preferences.safeFirst, preferences.avoidSteps, preferences.wheelchair, retryKey]);

  const route = calculation.key === calculationKey ? calculation.route : null;
  const error = calculation.key === calculationKey ? calculation.error : '';
  const loading = Boolean(calculationKey && calculation.key !== calculationKey);

  const toggleSaved = () => {
    if (!destinationPoint) return;
    const id = `search-${lat}-${lon}`;
    if (saved) void removeSavedPlace(id);
    else void savePlace({ id, label: placeName || 'สถานที่', coordinates: destinationPoint });
  };

  const beginNavigation = () => {
    if (!route || !destinationPoint || !placeName) return;
    setNavigationPlan({
      destination: { id: `route-${lat}-${lon}`, label: placeName, coordinates: destinationPoint },
      origin: location!,
      route,
      routePreference: mode,
    });
    router.push({ pathname: '/navigate', params: { destination: placeName, lat, lon } });
  };

  const arrival = route ? new Date(timeNow + route.durationSeconds * 1_000) : null;
  const routeMode = routeModes.find((item) => item.id === mode);

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.circleButton} accessibilityRole="button" accessibilityLabel="กลับ"><Icon name="back" size={21} color="#174589" /></Pressable>
        <Text style={styles.title}>ตัวเลือกเส้นทาง</Text>
        <Pressable onPress={toggleSaved} style={styles.circleButton} accessibilityRole="button" accessibilityLabel={saved ? 'นำออกจากสถานที่โปรด' : 'บันทึกสถานที่โปรด'}><Icon name="star" size={20} color={saved ? '#F59E0B' : '#174589'} /></Pressable>
      </View>

      <View style={styles.trip}>
        <View style={styles.currentDot} />
        <View style={styles.tripCopy}><Text style={styles.tripLabel}>ต้นทาง · GPS</Text><Text numberOfLines={1} style={styles.tripText}>{location ? 'ตำแหน่งปัจจุบัน' : 'กำลังรอตำแหน่ง'}</Text></View>
        <Icon name="arrow-right" size={18} color="#102A72" />
        <Icon name="pin" size={20} color="#EF4444" />
        <Text numberOfLines={1} style={styles.tripDestination}>{placeName || 'ยังไม่ได้เลือกปลายทาง'}</Text>
      </View>

      <View style={styles.modes}>
        {routeModes.map((item) => <Pressable key={item.id} onPress={() => setMode(item.id)} style={[styles.mode, mode === item.id && styles.modeSelected]} accessibilityRole="button" accessibilityState={{ selected: mode === item.id }}>
          <Text style={[styles.modeTitle, mode === item.id && styles.modeTitleSelected]}>{item.title}</Text>
          <Text numberOfLines={1} style={[styles.modeSub, mode === item.id && styles.modeSubSelected]}>{item.detail}</Text>
        </Pressable>)}
      </View>

      <MapPreview
        compact
        center={location}
        userLocation={location}
        destination={destinationPoint ? { id: `destination-${lat}-${lon}`, label: placeName, coordinates: destinationPoint } : null}
        route={route?.coordinates}
      />

      {loading ? <View style={styles.status}><ActivityIndicator color={colors.forest} /><Text style={styles.statusText}>กำลังคำนวณเส้นทางเดินจาก OpenStreetMap…</Text></View> : null}
      {error ? <Pressable onPress={() => setRetryKey((value) => value + 1)} style={styles.error} accessibilityRole="button"><Text style={styles.errorText}>{error} · แตะเพื่อลองอีกครั้ง</Text></Pressable> : null}
      {!location ? <Text style={styles.hint}>{locationStatus === 'denied' ? locationMessage : 'ต้องใช้ตำแหน่ง GPS จริงเป็นจุดเริ่มต้น'}</Text> : null}
      {!destinationPoint ? <Text style={styles.errorText}>ปลายทางนี้ไม่มีพิกัดจาก OpenStreetMap กรุณากลับไปเลือกผลค้นหาใหม่</Text> : null}

      {route ? <View style={styles.routeCard}>
        <View style={styles.routeTitleRow}><View style={styles.routeIcon}><Icon name="walk" size={23} color={colors.forest} /></View><View style={styles.routeTitleCopy}><Text style={styles.routeName}>เส้นทางเดิน · {routeMode?.title}</Text><Text style={styles.routeSub}>คำนวณจริงจากถนน/ทางเดินใน OpenStreetMap</Text></View></View>
        <View style={styles.metrics}>
          <Metric label="ระยะทาง" value={formatDistance(route.distanceKm)} />
          <Metric label="เวลาเดินโดยประมาณ" value={formatDuration(route.durationSeconds)} />
          <Metric label="ถึงประมาณ" value={arrival ? formatTime(arrival) : '—'} />
        </View>
        <Text style={styles.disclaimer}>ข้อมูลบันได ทางลาด และความเสี่ยงอาจไม่ครบใน OSM · โหมดเลี่ยงบันไดเป็นการปรับ route preference ไม่ใช่การรับรองเส้นทางปลอดภัย</Text>
      </View> : null}

      <Pressable onPress={beginNavigation} disabled={!route || loading} style={[styles.start, (!route || loading) && styles.startDisabled]} accessibilityRole="button" accessibilityState={{ disabled: !route || loading }}>
        <Text style={styles.startText}>{loading ? 'กำลังคำนวณเส้นทาง' : route ? 'เริ่มนำทาง' : 'เลือกปลายทางและรอเส้นทาง'}</Text><Icon name="arrow-right" size={22} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function formatDistance(km: number) { return km < 1 ? `${Math.round(km * 1_000)} ม.` : `${km.toFixed(2)} กม.`; }
function formatDuration(seconds: number) { const minutes = Math.max(1, Math.ceil(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที` : `${minutes} นาที`; }
function formatTime(date: Date) { return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }); }

const styles = StyleSheet.create({
  content: { backgroundColor: '#F6FAFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#102A72', fontSize: 21, fontWeight: '800' },
  circleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 9, elevation: 3 },
  trip: { minHeight: 66, borderRadius: 18, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  currentDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.forest, borderWidth: 3, borderColor: '#BFDBFE' },
  tripCopy: { flex: 1, minWidth: 0 },
  tripLabel: { color: '#64748B', fontSize: 9 },
  tripText: { color: '#102A72', fontSize: 11, fontWeight: '700' },
  tripDestination: { color: '#102A72', fontSize: 11, fontWeight: '800', flex: 1, minWidth: 30 },
  modes: { flexDirection: 'row', gap: 7 },
  mode: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 5, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0' },
  modeSelected: { borderColor: colors.forest, backgroundColor: '#EAF2FF' },
  modeTitle: { color: '#334E7D', fontSize: 10, fontWeight: '800' },
  modeTitleSelected: { color: colors.forest },
  modeSub: { color: '#64748B', fontSize: 7, marginTop: 3 },
  modeSubSelected: { color: '#1D4ED8' },
  status: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusText: { color: '#475569', fontSize: 10 },
  hint: { color: '#475569', fontSize: 10, lineHeight: 15 },
  error: { padding: 10, borderRadius: 12, backgroundColor: '#FEF2F2' },
  errorText: { color: '#B91C1C', fontSize: 11, lineHeight: 16 },
  routeCard: { padding: 14, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEAFE', gap: 12 },
  routeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF2FF' },
  routeTitleCopy: { flex: 1, gap: 3 },
  routeName: { color: '#102A72', fontSize: 14, fontWeight: '800' },
  routeSub: { color: '#64748B', fontSize: 9 },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 },
  metric: { flex: 1, alignItems: 'center', gap: 4 },
  metricLabel: { color: '#64748B', fontSize: 9, textAlign: 'center' },
  metricValue: { color: '#2563EB', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  disclaimer: { color: '#64748B', fontSize: 8, lineHeight: 13 },
  start: { minHeight: 54, borderRadius: 19, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: colors.forest, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  startDisabled: { backgroundColor: '#93A8C6', shadowOpacity: 0 },
  startText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
