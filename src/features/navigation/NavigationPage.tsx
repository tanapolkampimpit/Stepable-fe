import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/ui/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Icon } from '../../components/ui/Icon';
import { MapPreview } from '../../components/maps/MapPreview';
import { useAppData } from '../../providers/app-data';
import { distanceBetweenRouteIndices, distanceMeters, getManeuverInstruction, getRouteProgress, getWalkingRoute, type Coordinates, type WalkingRoute } from '../../services/geo';
import { colors } from '../../theme';

export default function NavigationPage() {
  const { destination: destinationParam, lat, lon } = useLocalSearchParams<{ destination?: string; lat?: string; lon?: string }>();
  const {
    location, locationMessage, weather, timeNow,
    preferences, reports, navigationPlan, setNavigationPlan,
  } = useAppData();
  const destination = useMemo<Coordinates | null>(() => {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    return navigationPlan?.destination.coordinates ?? null;
  }, [lat, lon, navigationPlan]);
  const destinationName = typeof destinationParam === 'string' ? destinationParam : navigationPlan?.destination.label ?? 'ปลายทาง';
  const [fallbackResult, setFallbackResult] = useState<{ key: string; route: WalkingRoute | null; error: string } | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const announcedStep = useRef(-1);
  const announcedCue = useRef('');

  const hasMatchingPlan = Boolean(navigationPlan && destination && distanceMeters(navigationPlan.destination.coordinates, destination) < 5);
  const fallbackKey = destination && location
    ? `${destination.latitude},${destination.longitude}|${location.latitude},${location.longitude}|${preferences.avoidSteps}|${preferences.wheelchair}`
    : '';

  useEffect(() => {
    if (hasMatchingPlan || !destination || !location) return;
    let active = true;
    void getWalkingRoute(location, destination, {
      avoidSteps: preferences.avoidSteps,
      wheelchair: preferences.wheelchair,
    }).then((nextRoute) => {
      if (active) setFallbackResult({ key: fallbackKey, route: nextRoute, error: '' });
    }).catch((requestError) => {
      if (active) setFallbackResult({ key: fallbackKey, route: null, error: requestError instanceof Error ? requestError.message : 'คำนวณเส้นทางใหม่ไม่สำเร็จ' });
    });
    return () => { active = false; };
  }, [destination, fallbackKey, hasMatchingPlan, location, preferences.avoidSteps, preferences.wheelchair]);

  const route = hasMatchingPlan ? navigationPlan?.route ?? null : fallbackResult?.key === fallbackKey ? fallbackResult.route : null;
  const loading = rerouting || Boolean(!hasMatchingPlan && fallbackKey && fallbackResult?.key !== fallbackKey);
  const visibleError = error || (fallbackResult?.key === fallbackKey ? fallbackResult.error : '');

  const progress = useMemo(() => route && location ? getRouteProgress(route, location) : null, [route, location]);
  const step = progress && route ? route.maneuvers[progress.maneuverIndex] : undefined;
  const instruction = step ? getManeuverInstruction(step) : route ? 'ถึงจุดหมายแล้ว' : 'กำลังรอเส้นทาง';
  const stepDistance = step && progress && route ? distanceBetweenRouteIndices(route.coordinates, progress.nearestIndex, step.end_shape_index) : 0;
  const eta = route && progress ? new Date(timeNow + (route.durationSeconds * progress.remainingFraction * 1_000)) : null;
  const finished = Boolean(destination && location && distanceMeters(location, destination) <= 25);
  const nearbyReport = useMemo(() => {
    if (!preferences.avoidDark || !location) return null;
    return reports
      .map((report) => ({ report, distance: distanceMeters(location, report.coordinates) }))
      .filter((item) => item.distance <= 100)
      .sort((left, right) => left.distance - right.distance)[0] ?? null;
  }, [location, preferences.avoidDark, reports]);

  useEffect(() => {
    if (!step || progress?.maneuverIndex === undefined || announcedStep.current === progress.maneuverIndex) return;
    const isFirst = announcedStep.current < 0;
    announcedStep.current = progress.maneuverIndex;
    if (!isFirst && preferences.vibration) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [preferences.vibration, progress?.maneuverIndex, step]);

  useEffect(() => {
    if (!step || progress?.maneuverIndex === undefined || !preferences.voiceNavigation) return;
    const bucket = routeAnnouncementBucket(stepDistance);
    const cueKey = `${progress.maneuverIndex}:${bucket}`;
    if (announcedCue.current === cueKey) return;
    announcedCue.current = cueKey;
    const spoken = finished
      ? 'ถึงจุดหมายแล้ว'
      : `อีก ${formatDistance(stepDistance / 1_000)} ${instruction}`;
    Speech.stop();
    Speech.speak(spoken, { language: 'th-TH', rate: 0.92 });
  }, [finished, instruction, preferences.voiceNavigation, progress?.maneuverIndex, step, stepDistance]);

  useEffect(() => {
    if (!preferences.voiceNavigation) announcedCue.current = '';
  }, [preferences.voiceNavigation]);

  useEffect(() => () => { void Speech.stop(); }, []);

  const reroute = async () => {
    if (!destination || !location) {
      setError(locationMessage);
      return;
    }
    setRerouting(true);
    setError('');
    setNotice('กำลังคำนวณจากตำแหน่ง GPS ล่าสุด');
    try {
      const nextRoute = await getWalkingRoute(location, destination, { avoidSteps: preferences.avoidSteps, wheelchair: preferences.wheelchair });
      setNavigationPlan({
        destination: { id: `route-${destination.latitude}-${destination.longitude}`, label: destinationName, coordinates: destination },
        origin: location,
        route: nextRoute,
        routePreference: 'current-position',
      });
      announcedStep.current = -1;
      setNotice('อัปเดตเส้นทางจากตำแหน่งจริงแล้ว');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'คำนวณเส้นทางใหม่ไม่สำเร็จ');
    } finally {
      setRerouting(false);
    }
  };

  const endNavigation = () => {
    void Speech.stop();
    setNavigationPlan(null);
    router.back();
  };

  return (
    <View style={styles.screen}>
      <MapPreview
        navigation
        center={location ?? navigationPlan?.origin ?? destination}
        userLocation={location}
        destination={destination ? { id: 'destination', label: destinationName, coordinates: destination } : null}
        route={route?.coordinates}
        style={styles.map}
      />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.instruction}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="กลับไปตัวเลือกเส้นทาง"><Icon name="back" size={23} color={colors.forest} /></Pressable>
          <View style={styles.turnIcon}><Icon name={finished ? 'check' : 'navigation'} size={27} color={colors.forest} /></View>
          <View style={styles.instructionCopy}><Text numberOfLines={2} style={styles.instructionTitle}>{finished ? 'ถึงจุดหมายแล้ว' : instruction}</Text><Text numberOfLines={1} style={styles.instructionSub}>ไปยัง {destinationName}{step && !finished ? ` · อีก ${formatDistance(stepDistance)}` : ''}</Text></View>
        </View>
        <View style={styles.etaStack}>
          <View style={styles.eta}><Icon name="clock" size={17} color={colors.forest} /><Text style={styles.etaText}>{eta && !finished ? `ถึง ${formatTime(eta, weather?.timezone)}` : finished ? 'ถึงแล้ว' : 'กำลังคำนวณ'}</Text></View>
          <View style={styles.eta}><Icon name="pin" size={17} color={colors.forest} /><Text style={styles.etaText}>{progress ? `${formatDistance(progress.remainingKm)} เหลือ` : 'รอตำแหน่ง GPS'}</Text></View>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.progressRow}><Icon name="walk" size={25} color={colors.forest} /><View style={styles.track}><View style={[styles.fill, { width: `${Math.round((1 - (progress?.remainingFraction ?? 1)) * 100)}%` }]} /></View><Icon name="flag" size={22} color="#334E7D" /></View>
        <View style={styles.metrics}>
          <Metric label="เวลาที่เหลือ" value={route && progress ? formatDuration(route.durationSeconds * progress.remainingFraction) : '—'} />
          <Metric label="ระยะทางเหลือ" value={progress ? formatDistance(progress.remainingKm) : '—'} />
          <Metric label="ตำแหน่ง" value={location ? `${location.accuracy ? `±${Math.round(location.accuracy)} ม.` : 'GPS'}` : 'ไม่พร้อม'} green={Boolean(location)} />
        </View>
        {!location ? <Text style={styles.message}>{locationMessage}</Text> : null}
        {nearbyReport ? <View style={styles.riskNotice}><Icon name="warning" size={17} color="#B91C1C" /><Text style={styles.riskText}>รายงานในอุปกรณ์นี้: {nearbyReport.report.type} · ห่าง {Math.round(nearbyReport.distance)} ม. · โปรดตรวจสอบหน้างาน</Text></View> : null}
        {progress?.offRoute && !nearbyReport ? <Pressable onPress={() => { void reroute(); }} style={styles.offRoute}><Text style={styles.offRouteText}>ตำแหน่ง GPS อยู่นอกแนวเส้นทาง · แตะเพื่อคำนวณใหม่</Text></Pressable> : null}
        {notice ? <Text style={styles.message} accessibilityLiveRegion="polite">{notice}</Text> : null}
        {visibleError ? <Pressable onPress={() => { void reroute(); }} style={styles.error} accessibilityRole="button"><Text style={styles.errorText}>{visibleError} · แตะเพื่อลองอีกครั้ง</Text></Pressable> : null}
        <View style={styles.actions}>
          <Pressable onPress={() => { void Speech.stop(); router.push({ pathname: '/(tabs)/ai', params: { live: 'true' } }); }} style={styles.aiButton} accessibilityRole="button"><Icon name="camera" size={20} color="#FFFFFF" /><Text style={styles.aiText}>เปิด AI สด</Text></Pressable>
          <Pressable onPress={() => router.push({ pathname: '/report-issue', params: location ? { lat: String(location.latitude), lon: String(location.longitude) } : {} })} style={styles.report} accessibilityRole="button"><Icon name="warning" size={19} color="#334E7D" /><Text style={styles.reportText}>รายงานปัญหา</Text></Pressable>
        </View>
        <View style={styles.endRow}>
          {loading ? <ActivityIndicator color={colors.forest} /> : <Pressable onPress={() => { void reroute(); }} style={styles.smallAction} accessibilityRole="button"><Icon name="locate" size={16} color={colors.forest} /><Text style={styles.smallActionText}>อัปเดต/คำนวณเส้นทางใหม่</Text></Pressable>}
          <Pressable onPress={endNavigation} accessibilityRole="button"><Text style={styles.endText}>จบการนำทาง</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function formatDistance(km: number) { return km < 1 ? `${Math.max(0, Math.round(km * 1_000))} ม.` : `${km.toFixed(1)} กม.`; }
function routeAnnouncementBucket(distanceMeters: number) {
  if (distanceMeters <= 8) return 'now';
  if (distanceMeters <= 20) return '20';
  if (distanceMeters <= 50) return '50';
  if (distanceMeters <= 100) return '100';
  if (distanceMeters <= 200) return '200';
  return String(Math.ceil(distanceMeters / 100) * 100);
}
function formatDuration(seconds: number) { const minutes = Math.max(0, Math.ceil(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที` : `${minutes} นาที`; }
function formatTime(date: Date, timezone?: string) {
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, ...(timezone ? { timeZone: timezone } : {}) });
}

function Metric({ label, value, green = false }: { label: string; value: string; green?: boolean }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={[styles.metricValue, green && styles.green]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDF5FB' },
  map: { position: 'absolute', inset: 0, height: '100%', borderRadius: 0 },
  overlay: { flex: 1, paddingHorizontal: 14, paddingTop: 8 },
  instruction: { width: '75%', minHeight: 78, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  turnIcon: { width: 36, alignItems: 'center' },
  instructionCopy: { flex: 1, gap: 4 },
  instructionTitle: { color: '#102A72', fontSize: 17, fontWeight: '800' },
  instructionSub: { color: '#334E7D', fontSize: 10 },
  etaStack: { position: 'absolute', right: 14, top: 8, gap: 8 },
  eta: { minHeight: 36, borderRadius: 18, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  etaText: { color: '#102A72', fontSize: 10, fontWeight: '800' },
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 8, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(255,255,255,0.97)', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 11, shadowColor: '#0F172A', shadowOpacity: 0.14, shadowRadius: 18, elevation: 12 },
  handle: { width: 56, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1', alignSelf: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.forest, borderRadius: 4 },
  metrics: { flexDirection: 'row' },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#E2E8F0', paddingHorizontal: 2 },
  metricLabel: { color: '#334E7D', fontSize: 9, textAlign: 'center' },
  metricValue: { color: '#102A72', fontSize: 17, fontWeight: '800', marginTop: 4 },
  green: { color: '#16A166' },
  message: { color: '#475569', fontSize: 9, lineHeight: 13 },
  riskNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9, borderRadius: 11, backgroundColor: '#FEF2F2' }, riskText: { flex: 1, color: '#991B1B', fontSize: 9, lineHeight: 13, fontWeight: '700' },
  offRoute: { padding: 9, borderRadius: 11, backgroundColor: '#FFF7ED' }, offRouteText: { color: '#9A3412', fontSize: 9, fontWeight: '700' },
  error: { padding: 9, borderRadius: 11, backgroundColor: '#FEF2F2' },
  errorText: { color: '#B91C1C', fontSize: 10, lineHeight: 14 },
  actions: { flexDirection: 'row', gap: 9 },
  aiButton: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  aiText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  report: { flex: 1, minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: '#CBD5E1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  reportText: { color: '#334E7D', fontSize: 10, fontWeight: '800' },
  endRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallAction: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5 },
  smallActionText: { color: colors.forest, fontSize: 9, fontWeight: '700' },
  endText: { color: '#64748B', fontSize: 10, fontWeight: '700', padding: 6 },
});
