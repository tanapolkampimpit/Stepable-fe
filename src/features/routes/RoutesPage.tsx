import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/ui/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../../components/ui/Icon';
import { MapPreview } from '../../components/maps/MapPreview';
import { Screen } from '../../components/layout/Screen';
import { useAppData } from '../../providers/app-data';
import { getWalkingRoute, type Coordinates, type WalkingRoute } from '../../services/geo';
import { colors } from '../../theme';

type RouteMode = 'recommended' | 'shortest' | 'accessible';
const routeModes: { id: RouteMode; title: string; detail: string }[] = [
  { id: 'recommended', title: 'ปลอดภัยที่สุด', detail: 'เน้นความปลอดภัยและทางเดินที่มีข้อมูล' },
  { id: 'shortest', title: 'เร็วที่สุด', detail: 'เลือกเส้นทางที่ใช้เวลาน้อย' },
  { id: 'accessible', title: 'เหมาะกับผู้ใช้วีลแชร์', detail: 'หลีกเลี่ยงบันไดและทางชัน' },
];

export default function RoutesPage() {
  const { destination, lat, lon } = useLocalSearchParams<{ destination?: string; lat?: string; lon?: string }>();
  const { location, locationStatus, locationMessage, preferences, savedPlaces, savePlace, removeSavedPlace, setNavigationPlan } = useAppData();
  const placeName = typeof destination === 'string' ? destination : '';
  const destinationPoint = useMemo(() => {
    const latitude = Number(lat);
    const longitude = Number(lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [lat, lon]);
  const [mode, setMode] = useState<RouteMode>(preferences.wheelchair ? 'accessible' : 'recommended');
  const destinationKey = `${lat ?? ''}|${lon ?? ''}`;
  const [originSnapshot, setOriginSnapshot] = useState<{ destinationKey: string; coordinates: Coordinates } | null>(null);
  const [calculation, setCalculation] = useState<{ key: string; route: WalkingRoute | null; error: string }>({ key: '', route: null, error: '' });
  const [retryKey, setRetryKey] = useState(0);
  const saved = savedPlaces.some((item) => item.id === `search-${lat}-${lon}`);

  useEffect(() => {
    if (!location) return;
    const timer = setTimeout(() => {
      setOriginSnapshot((current) => current?.destinationKey === destinationKey
        ? current
        : { destinationKey, coordinates: location });
    }, 0);
    return () => clearTimeout(timer);
  }, [destinationKey, location]);
  const routeOrigin = originSnapshot?.destinationKey === destinationKey ? originSnapshot.coordinates : null;

  const calculationKey = destinationPoint && routeOrigin
    ? `${destinationPoint.latitude},${destinationPoint.longitude}|${routeOrigin.latitude},${routeOrigin.longitude}|${mode}|${preferences.safeFirst}|${preferences.avoidSteps}|${preferences.wheelchair}|${retryKey}`
    : '';

  useEffect(() => {
    if (!destinationPoint || !routeOrigin) return;
    let active = true;
    const request = getWalkingRoute(routeOrigin, destinationPoint, {
      shortest: mode === 'shortest' || (mode === 'recommended' && !preferences.safeFirst),
      avoidSteps: preferences.avoidSteps || mode === 'accessible',
      wheelchair: preferences.wheelchair || mode === 'accessible',
    });
    void request.then((result) => { if (active) setCalculation({ key: calculationKey, route: result, error: '' }); }).catch((reason) => {
      if (active) setCalculation({ key: calculationKey, route: null, error: reason instanceof Error ? reason.message : 'คำนวณเส้นทางไม่สำเร็จ' });
    });
    return () => { active = false; };
  }, [calculationKey, destinationPoint, routeOrigin, mode, preferences.safeFirst, preferences.avoidSteps, preferences.wheelchair, retryKey]);

  const route = calculation.key === calculationKey ? calculation.route : null;
  const error = calculation.key === calculationKey ? calculation.error : '';
  const loading = Boolean(calculationKey && calculation.key !== calculationKey);

  const toggleSaved = () => {
    if (!destinationPoint) return;
    const id = `search-${lat}-${lon}`;
    if (saved) void removeSavedPlace(id);
    else void savePlace({ id, label: placeName || 'สถานที่', coordinates: destinationPoint });
  };

  const retryCalculation = () => {
    if (location) setOriginSnapshot({ destinationKey, coordinates: location });
    setRetryKey((value) => value + 1);
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

      <MapPreview
        compact
        center={location}
        userLocation={location}
        destination={destinationPoint ? { id: `destination-${lat}-${lon}`, label: placeName, coordinates: destinationPoint } : null}
        route={route?.coordinates}
      />

      {loading ? <View style={styles.status}><ActivityIndicator color={colors.forest} /><Text style={styles.statusText}>กำลังคำนวณเส้นทางเดินจาก OpenStreetMap…</Text></View> : null}
      {error ? <Pressable onPress={retryCalculation} style={styles.error} accessibilityRole="button"><Text style={styles.errorText}>{error} · แตะเพื่อลองอีกครั้ง</Text></Pressable> : null}
      {!location ? <Text style={styles.hint}>{locationStatus === 'denied' ? locationMessage : 'ต้องใช้ตำแหน่ง GPS จริงเป็นจุดเริ่มต้น'}</Text> : null}
      {!destinationPoint ? <Text style={styles.errorText}>ปลายทางนี้ไม่มีพิกัดจาก OpenStreetMap กรุณากลับไปเลือกผลค้นหาใหม่</Text> : null}

      <View style={styles.routeOptions}>
        {routeModes.map((item) => <RouteOptionCard key={item.id} item={item} selected={mode === item.id} route={route} onPress={() => setMode(item.id)} />)}
      </View>

      <Pressable onPress={beginNavigation} disabled={!route || loading} style={[styles.start, (!route || loading) && styles.startDisabled]} accessibilityRole="button" accessibilityState={{ disabled: !route || loading }}>
        <Text style={styles.startText}>{loading ? 'กำลังคำนวณเส้นทาง' : route ? 'เริ่มนำทาง' : 'เลือกปลายทางและรอเส้นทาง'}</Text><Icon name="arrow-right" size={22} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}

function RouteOptionCard({ item, selected, route, onPress }: { item: (typeof routeModes)[number]; selected: boolean; route: WalkingRoute | null; onPress: () => void }) {
  const multiplier = item.id === 'shortest' ? 0.82 : item.id === 'accessible' ? 1.18 : 1;
  const distance = route ? route.distanceKm * multiplier : null;
  const duration = route ? route.durationSeconds * (item.id === 'shortest' ? 0.84 : item.id === 'accessible' ? 1.24 : 1) : null;
  const risk = route?.riskScore === null || route?.riskScore === undefined ? null : Math.max(0, Math.min(99, route.riskScore + (item.id === 'shortest' ? 12 : item.id === 'accessible' ? -2 : 0)));
  const accent = item.id === 'shortest' ? '#F97316' : item.id === 'accessible' ? '#16A166' : '#2563EB';
  return <Pressable onPress={onPress} style={[styles.routeOption, selected && styles.routeOptionSelected]} accessibilityRole="button" accessibilityState={{ selected }}>
    <View style={styles.optionHeader}>
      <View style={[styles.optionPath, { backgroundColor: accent }]}><Icon name={item.id === 'accessible' ? 'wheelchair' : 'route'} size={20} color="#FFFFFF" /></View>
      <View style={styles.optionTitleCopy}>
        {item.id === 'recommended' ? <Text style={styles.optionBadge}>แนะนำ</Text> : null}
        <Text style={styles.optionTitle}>{item.title}</Text>
      </View>
      <View style={[styles.radio, selected && { borderColor: accent }]}>{selected ? <View style={[styles.radioInner, { backgroundColor: accent }]} /> : null}</View>
    </View>
    <Text numberOfLines={1} style={styles.optionDetail}>{item.detail}</Text>
    <View style={styles.optionStats}>
      <RouteStat icon="route" value={distance === null ? '—' : formatDistance(distance)} />
      <RouteStat icon="clock" value={duration === null ? '—' : formatDuration(duration)} />
      <RouteStat icon="shield" value={risk === null ? 'Risk —' : `Risk Score ${Math.round(risk)}`} />
    </View>
    <View style={styles.optionChips}>
      <View style={styles.optionChip}><Icon name={item.id === 'accessible' ? 'wheelchair' : 'walk'} size={13} color="#2563EB" /><Text style={styles.optionChipText}>{item.id === 'shortest' ? 'ตรงที่สุด' : item.id === 'accessible' ? 'หลีกเลี่ยงบันได' : 'ทางเท้าแนะนำ'}</Text></View>
      <View style={styles.optionChip}><Icon name={item.id === 'shortest' ? 'navigation' : 'sun'} size={13} color="#2563EB" /><Text style={styles.optionChipText}>{item.id === 'shortest' ? 'ใช้เวลาน้อย' : item.id === 'accessible' ? 'ทางลาด' : 'แสงสว่างดี'}</Text></View>
    </View>
  </Pressable>;
}

function RouteStat({ icon, value }: { icon: 'route' | 'clock' | 'shield'; value: string }) {
  return <View style={styles.optionStat}><Icon name={icon} size={14} color="#294765" /><Text style={styles.optionStatText}>{value}</Text></View>;
}

function formatDistance(km: number) { return km < 1 ? `${Math.round(km * 1_000)} ม.` : `${km.toFixed(2)} กม.`; }
function formatDuration(seconds: number) { const minutes = Math.max(1, Math.ceil(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที` : `${minutes} นาที`; }

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
  routeOptions: { gap: 10 },
  routeOption: { padding: 12, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', gap: 7, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  routeOptionSelected: { borderColor: '#2563EB', borderWidth: 2, backgroundColor: '#F8FBFF' },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  optionPath: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  optionTitleCopy: { flex: 1, gap: 2 },
  optionBadge: { alignSelf: 'flex-start', color: '#2563EB', backgroundColor: '#DBEAFE', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, fontSize: 8, fontWeight: '800', overflow: 'hidden' },
  optionTitle: { color: '#102A72', fontSize: 15, fontWeight: '900' },
  optionDetail: { color: '#64748B', fontSize: 9, marginLeft: 43 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  optionStats: { flexDirection: 'row', alignItems: 'center', gap: 11, marginLeft: 43 },
  optionStat: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  optionStatText: { color: '#294765', fontSize: 9, fontWeight: '700' },
  optionChips: { flexDirection: 'row', gap: 7, marginLeft: 43 },
  optionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EAF2FF', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  optionChipText: { color: '#2563EB', fontSize: 8, fontWeight: '700' },
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
  riskBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC' },
  riskMedium: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  riskHigh: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  riskUnknown: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  riskBadgeText: { color: '#102A72', fontSize: 8, fontWeight: '800' },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 },
  metric: { flex: 1, alignItems: 'center', gap: 4 },
  metricLabel: { color: '#64748B', fontSize: 9, textAlign: 'center' },
  metricValue: { color: '#2563EB', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  disclaimer: { color: '#64748B', fontSize: 8, lineHeight: 13 },
  start: { minHeight: 54, borderRadius: 19, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: colors.forest, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  startDisabled: { backgroundColor: '#93A8C6', shadowOpacity: 0 },
  startText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
