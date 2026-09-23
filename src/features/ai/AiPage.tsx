import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { Icon } from '../../components/ui/Icon';
import { AppText as Text } from '../../components/ui/AppText';
import { useAppData } from '../../providers/app-data';
import { analyzeImage, type AiAnalysis } from '../../services/ai';
import { distanceBetweenRouteIndices, distanceMeters, getManeuverInstruction, getRouteProgress } from '../../services/geo';
import { colors } from '../../theme';

export default function AiPage() {
  const { live } = useLocalSearchParams<{ live?: string }>();
  const liveRequested = live !== 'false';
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { location, navigationPlan } = useAppData();
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [liveMode, setLiveMode] = useState(() => live !== 'false');
  const liveBusy = useRef(false);
  const lastAnnouncement = useRef('');
  const lastRouteAnnouncement = useRef('');
  const navigationCueRef = useRef<NavigationCue | null>(null);

  const navigationCue = useMemo<NavigationCue | null>(() => {
    if (!liveMode || !navigationPlan || !location) return null;
    if (distanceMeters(location, navigationPlan.destination.coordinates) <= 25) {
      return { key: 'destination', instruction: 'ถึงจุดหมายแล้ว', distanceMeters: 0, maneuverIndex: -1 };
    }
    const progress = getRouteProgress(navigationPlan.route, location);
    if (progress.offRoute) {
      return { key: 'off-route', instruction: 'อยู่นอกเส้นทาง', distanceMeters: 0, maneuverIndex: -1 };
    }
    const maneuver = navigationPlan.route.maneuvers[progress.maneuverIndex];
    if (!maneuver) return null;
    return {
      key: `${progress.maneuverIndex}`,
      instruction: getManeuverInstruction(maneuver),
      distanceMeters: distanceBetweenRouteIndices(navigationPlan.route.coordinates, progress.nearestIndex, maneuver.end_shape_index),
      maneuverIndex: progress.maneuverIndex,
    };
  }, [liveMode, location, navigationPlan]);

  useEffect(() => {
    navigationCueRef.current = navigationCue;
  }, [navigationCue]);

  const runAnalysis = useCallback(async (uri: string) => {
    setAnalyzing(true);
    setAnalysisError('');
    try {
      setAnalysis(await analyzeImage(uri));
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(error instanceof Error ? error.message : 'เชื่อมต่อ AI server ไม่สำเร็จ');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (!liveMode || !permission?.granted || photoUri) return undefined;
    let active = true;
    const captureAndAnalyze = async () => {
      if (!cameraRef.current || liveBusy.current) return;
      liveBusy.current = true;
      try {
        const image = await cameraRef.current.takePictureAsync({ quality: 0.5 });
        if (!active || !image?.uri) return;
        const result = await analyzeImage(image.uri);
        if (!active) return;
        setAnalysis(result);
        setAnalysisError('');
        const announcement = liveAnnouncement(result);
        if (!navigationCueRef.current && announcement && announcement !== lastAnnouncement.current) {
          lastAnnouncement.current = announcement;
          Speech.stop();
          Speech.speak(announcement, { language: 'th-TH', rate: 0.95 });
        }
      } catch (error) {
        if (active) setAnalysisError(error instanceof Error ? error.message : 'วิเคราะห์ภาพสดไม่สำเร็จ');
      } finally {
        liveBusy.current = false;
      }
    };
    void captureAndAnalyze();
    const timer = setInterval(() => { void captureAndAnalyze(); }, 3500);
    return () => {
      active = false;
      clearInterval(timer);
      liveBusy.current = false;
      Speech.stop();
    };
  }, [liveMode, permission?.granted, photoUri]);

  useEffect(() => {
    if (!liveMode || !navigationCue) {
      lastRouteAnnouncement.current = '';
      return;
    }
    const bucket = routeAnnouncementBucket(navigationCue.distanceMeters);
    const key = `${navigationCue.key}:${bucket}`;
    if (key === lastRouteAnnouncement.current) return;
    lastRouteAnnouncement.current = key;
    const spoken = navigationCue.instruction === 'ถึงจุดหมายแล้ว'
      ? navigationCue.instruction
      : navigationCue.instruction === 'อยู่นอกเส้นทาง'
        ? 'สัญญาณ GPS อยู่นอกเส้นทาง กรุณาคำนวณเส้นทางใหม่'
        : `อีก ${formatGuidanceDistance(navigationCue.distanceMeters)} ${navigationCue.instruction}`;
    Speech.stop();
    Speech.speak(spoken, { language: 'th-TH', rate: 0.92 });
  }, [liveMode, navigationCue]);

  const toggleLiveMode = () => {
    if (!permission?.granted || photoUri) return;
    setLiveMode((value) => !value);
    lastAnnouncement.current = '';
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const image = await cameraRef.current.takePictureAsync({ quality: 0.82, shutterSound: true });
      if (image?.uri) {
        setPhotoUri(image.uri);
        void runAnalysis(image.uri);
      }
    } catch {
      setCameraError('ถ่ายภาพไม่สำเร็จ ตรวจสอบสิทธิ์กล้องและลองใหม่');
    } finally {
      setBusy(false);
    }
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      void runAnalysis(result.assets[0].uri);
    }
  };

  const reportPhoto = () => {
    router.push({ pathname: '/report-issue', params: { ...(location ? { lat: String(location.latitude), lon: String(location.longitude) } : {}), ...(photoUri ? { image: photoUri } : {}) } });
  };

  return (
    <View style={styles.screen}>
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.camera} resizeMode="cover" /> : permission?.granted ? (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          enableTorch={torch}
          onMountError={({ message }) => setCameraError(message)}
          onCameraReady={() => setCameraError('')}
        />
      ) : <View style={styles.permissionBackground} />}
      <View pointerEvents="none" style={styles.tint} />
      {!photoUri && permission?.granted ? <View pointerEvents="none" style={styles.viewfinder}><View style={styles.cornerTL} /><View style={styles.cornerTR} /><View style={styles.cornerBL} /><View style={styles.cornerBR} /></View> : null}

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe} pointerEvents="box-none">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="กลับ"><Icon name="back" size={23} color="#174589" /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>AI Camera</Text><Text style={styles.headerSub}>{photoUri ? 'ถ่ายภาพแล้ว' : liveMode ? 'AI สด · กำลังตรวจทางเดิน' : 'กล้องสด · แตะเพื่อเริ่มวิเคราะห์'}</Text></View>
          <Pressable onPress={toggleLiveMode} disabled={!permission?.granted || Boolean(photoUri)} style={[styles.statusPill, liveMode && styles.statusPillActive]} accessibilityRole="button" accessibilityLabel={liveMode ? 'หยุดวิเคราะห์แบบสด' : 'เริ่มวิเคราะห์แบบสด'}><View style={[styles.liveDot, permission?.granted && styles.liveDotOn]} /><Text style={styles.statusText}>{liveMode ? 'วิเคราะห์สด' : permission?.granted ? 'กล้องพร้อม' : 'ต้องอนุญาต'}</Text></Pressable>
        </View>

        {!permission?.granted ? <Pressable onPress={() => { void requestPermission(); }} style={styles.permissionCard} accessibilityRole="button">
          <Icon name="camera" size={24} color={colors.forest} /><Text style={styles.permissionTitle}>อนุญาตให้ใช้กล้อง</Text><Text style={styles.permissionSub}>กล้องใช้เฉพาะเมื่อเปิดหน้านี้ และถ่ายเมื่อคุณกดปุ่มเท่านั้น</Text><Text style={styles.permissionAction}>อนุญาตและเปิดกล้อง</Text>
        </Pressable> : null}

        {permission?.granted && !photoUri ? <View style={styles.sideControls}>
          <Pressable onPress={() => setTorch((value) => !value)} style={[styles.roundControl, torch && styles.controlActive]} accessibilityRole="button" accessibilityLabel={torch ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย'}><Icon name="flashlight" size={21} color={torch ? '#FFFFFF' : '#174589'} /></Pressable>
          <Pressable onPress={() => setFacing((value) => value === 'back' ? 'front' : 'back')} style={styles.roundControl} accessibilityRole="button" accessibilityLabel="สลับกล้องหน้า/หลัง"><Icon name="swap" size={21} color="#174589" /></Pressable>
        </View> : null}
      </SafeAreaView>

      {cameraError ? <View style={styles.cameraNotice}><Text style={styles.cameraNoticeText}>{cameraError}</Text></View> : null}

      <View style={styles.sheet}>
        <View style={styles.metrics}>
          <Metric icon="camera" label="กล้อง" value={liveMode ? 'AI สด' : permission?.granted ? 'พร้อม' : 'ปิด'} active={Boolean(permission?.granted)} />
          <Metric icon="flashlight" label="ไฟฉาย" value={torch ? 'เปิด' : 'ปิด'} active={torch} />
          <Metric icon="check" label={liveRequested ? 'เฟรม AI' : 'ภาพที่ถ่าย'} value={liveRequested ? (liveMode ? 'สด' : 'หยุด') : photoUri ? '1 ภาพ' : '0 ภาพ'} active={liveRequested ? liveMode : Boolean(photoUri)} />
        </View>
        {navigationCue ? <View style={styles.routeCue} accessibilityLiveRegion="polite">
          <View style={[styles.routeCueIcon, navigationCue.instruction === 'อยู่นอกเส้นทาง' && styles.routeCueIconWarning]}><Icon name={navigationCue.instruction === 'ถึงจุดหมายแล้ว' ? 'check' : navigationCue.instruction === 'อยู่นอกเส้นทาง' ? 'warning' : 'navigation'} size={18} color="#FFFFFF" /></View>
          <View style={styles.routeCueCopy}><Text style={styles.routeCueTitle}>{navigationCue.instruction}</Text><Text style={styles.routeCueSub}>{navigationCue.instruction === 'ถึงจุดหมายแล้ว' ? 'จบเส้นทางแล้ว' : navigationCue.instruction === 'อยู่นอกเส้นทาง' ? 'กรุณากลับหน้าเส้นทางเพื่อคำนวณใหม่' : `อีก ${formatGuidanceDistance(navigationCue.distanceMeters)} · จากเส้นทางจริง`}</Text></View>
        </View> : null}
        <Pressable onPress={() => { if (photoUri && !analyzing) void runAnalysis(photoUri); }} style={[styles.notice, analysis && styles.noticeSuccess, analysisError && styles.noticeError]} accessibilityRole="button" accessibilityLabel="วิเคราะห์ภาพด้วย AI">
          <View style={styles.noticeIcon}><Icon name={analysis ? 'check' : analysisError ? 'warning' : 'info'} size={17} color="#FFFFFF" /></View>
          <Text style={styles.noticeText}>{analysisError ? `${analysisError} · แตะเพื่อลองใหม่` : analyzing || liveMode ? (analysis ? formatAnalysis(analysis) : 'กำลังดูภาพจากกล้องและวิเคราะห์ทุก 3.5 วินาที…') : analysis ? formatAnalysis(analysis) : 'ถ่ายภาพแล้วแตะเพื่อวิเคราะห์สิ่งกีดขวางด้วย AI'}</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable onPress={() => { if (photoUri) { setPhotoUri(null); setAnalysis(null); setAnalysisError(''); } else router.back(); }} style={styles.primary} accessibilityRole="button"><Icon name="back" size={20} color="#FFFFFF" /><Text style={styles.primaryText}>{photoUri ? 'ถ่ายใหม่' : 'กลับ'}</Text></Pressable>
          <Pressable onPress={reportPhoto} style={styles.secondary} accessibilityRole="button"><Icon name="flag" size={20} color={colors.forest} /><Text style={styles.secondaryText}>{photoUri ? 'แนบรายงาน' : 'รายงานปัญหา'}</Text></Pressable>
        </View>
        <View style={styles.captureRow}>
          {liveRequested ? <View style={[styles.thumbnail, styles.liveBadge]}><Icon name="navigation" size={18} color={colors.forest} /></View> : <Pressable onPress={() => { void choosePhoto(); }} style={styles.thumbnail} accessibilityRole="button" accessibilityLabel="เลือกภาพจากคลัง">
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumbnailImage} /> : <Icon name="camera" size={18} color="#64748B" />}
          </Pressable>}
          <Pressable onPress={() => { if (liveRequested) { toggleLiveMode(); } else if (photoUri) { setPhotoUri(null); setAnalysis(null); setAnalysisError(''); } else void capturePhoto(); }} disabled={busy || !permission?.granted} style={[styles.capture, (!permission?.granted || busy) && styles.captureDisabled]} accessibilityRole="button" accessibilityLabel={liveRequested ? (liveMode ? 'หยุดวิเคราะห์สด' : 'เริ่มวิเคราะห์สด') : photoUri ? 'ล้างภาพที่ถ่าย' : 'ถ่ายภาพ'}>
            {busy ? <ActivityIndicator color={colors.forest} /> : liveRequested && liveMode ? <View style={styles.liveStopInner} /> : <View style={styles.captureInner} />}
          </Pressable>
          <View style={styles.captureSpacer} />
        </View>
      </View>
    </View>
  );
}

const aiClassLabels: Record<string, string> = {
  person: 'คน',
  vehicle: 'รถยนต์',
  two_wheeler: 'มอเตอร์ไซค์/จักรยาน',
  road_sidewalk: 'ถนน/ทางเท้า',
  building: 'อาคาร',
  vegetation: 'ต้นไม้/พืช',
  street_fixture: 'สิ่งกีดขวางริมทาง',
};

function formatAnalysis(result: AiAnalysis) {
  const labels = [...new Set(result.obstacles.map((item) => `${aiClassLabels[item.className] || item.className} · ${item.position || 'ตรงหน้า'}`))];
  const detected = labels.length ? ` (${labels.join(', ')})` : '';
  return `พบสิ่งกีดขวาง ${result.obstacles.length} จุด${detected} · พื้นที่ทางเดิน ${Math.round(result.sidewalkCoverage * 100)}%`;
}

function liveAnnouncement(result: AiAnalysis) {
  if (!result.obstacles.length) return 'ไม่พบสิ่งกีดขวางด้านหน้า';
  const items = [...new Set(result.obstacles.map((item) => `${aiClassLabels[item.className] || item.className} ${item.position === 'ตรงหน้า' ? 'ตรงหน้า' : `ด้าน${item.position || 'ตรงหน้า'}`}`))];
  return `ระวัง ${items.join(' และ ')}`;
}

type NavigationCue = {
  key: string;
  maneuverIndex: number;
  instruction: string;
  distanceMeters: number;
};

function routeAnnouncementBucket(distance: number) {
  if (distance <= 8) return 'now';
  if (distance <= 20) return '20';
  if (distance <= 50) return '50';
  if (distance <= 100) return '100';
  if (distance <= 200) return '200';
  return String(Math.ceil(distance / 100) * 100);
}

function formatGuidanceDistance(distance: number) {
  if (distance < 1_000) return `${Math.max(0, Math.round(distance / 5) * 5)} เมตร`;
  return `${(distance / 1_000).toFixed(1)} กิโลเมตร`;
}

function Metric({ icon, label, value, active }: { icon: 'camera' | 'flashlight' | 'check'; label: string; value: string; active: boolean }) {
  return <View style={styles.metric}><Icon name={icon} size={21} color={active ? '#16A166' : colors.forest} /><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, active && styles.green]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#D6E3EA' },
  camera: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  permissionBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#DFEAF0' },
  tint: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8,37,70,0.06)' },
  safe: { flex: 1, paddingHorizontal: 14, paddingTop: 8 },
  header: { minHeight: 72, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', padding: 10, gap: 9, shadowColor: '#0F172A', shadowOpacity: 0.14, shadowRadius: 14, elevation: 6 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 8 },
  headerCopy: { flex: 1, gap: 2 }, headerTitle: { color: '#102A72', fontSize: 17, fontWeight: '800' }, headerSub: { color: '#64748B', fontSize: 9 },
  statusPill: { minHeight: 34, borderRadius: 17, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }, statusPillActive: { backgroundColor: '#DDF7EA' },
  statusText: { color: colors.forest, fontSize: 9, fontWeight: '800' }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#94A3B8' }, liveDotOn: { backgroundColor: '#16A166' },
  viewfinder: { position: 'absolute', left: '17%', right: '17%', top: '25%', bottom: '32%' },
  cornerTL: { position: 'absolute', left: 0, top: 0, width: 30, height: 30, borderLeftWidth: 3, borderTopWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  cornerTR: { position: 'absolute', right: 0, top: 0, width: 30, height: 30, borderRightWidth: 3, borderTopWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  cornerBL: { position: 'absolute', left: 0, bottom: 0, width: 30, height: 30, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  cornerBR: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRightWidth: 3, borderBottomWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  permissionCard: { marginTop: 18, marginHorizontal: 8, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 18, alignItems: 'center', gap: 8 },
  permissionTitle: { color: '#102A72', fontSize: 17, fontWeight: '800' }, permissionSub: { color: '#64748B', fontSize: 11, lineHeight: 16, textAlign: 'center' }, permissionAction: { color: '#FFFFFF', backgroundColor: colors.forest, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, overflow: 'hidden', fontSize: 12, fontWeight: '800', marginTop: 3 },
  sideControls: { marginTop: 17, flexDirection: 'row', justifyContent: 'space-between' }, roundControl: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 }, controlActive: { backgroundColor: colors.forest },
  cameraNotice: { position: 'absolute', top: '45%', left: 16, right: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.94)' }, cameraNoticeText: { color: '#B91C1C', fontSize: 10, textAlign: 'center' },
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.97)', padding: 14, gap: 11, shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 18, elevation: 14 },
  metrics: { flexDirection: 'row' }, metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3, borderRightWidth: 1, borderRightColor: '#E2E8F0' }, metricLabel: { color: '#334E7D', fontSize: 9, textAlign: 'center' }, metricValue: { color: '#102A72', fontSize: 17, fontWeight: '800' }, green: { color: '#16A166' },
  routeCue: { minHeight: 48, borderRadius: 15, backgroundColor: '#E8F8F0', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }, routeCueIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, routeCueIconWarning: { backgroundColor: '#D97706' }, routeCueCopy: { flex: 1, gap: 2 }, routeCueTitle: { color: '#102A72', fontSize: 13, fontWeight: '800' }, routeCueSub: { color: '#16734C', fontSize: 10, fontWeight: '700' },
  notice: { minHeight: 46, borderRadius: 15, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }, noticeSuccess: { backgroundColor: '#E8F8F0' }, noticeError: { backgroundColor: '#FFF7E6' }, noticeIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, noticeText: { flex: 1, color: '#1E3A8A', fontSize: 10, lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 9 }, primary: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, primaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' }, secondary: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, secondaryText: { color: colors.forest, fontSize: 10, fontWeight: '800' },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, thumbnail: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, liveBadge: { backgroundColor: '#E8F8F0' }, thumbnailImage: { width: '100%', height: '100%' }, capture: { width: 58, height: 58, borderRadius: 29, borderWidth: 4, borderColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, captureDisabled: { borderColor: '#94A3B8' }, captureInner: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.forest }, liveStopInner: { width: 24, height: 24, borderRadius: 5, backgroundColor: '#DC2626' }, captureSpacer: { width: 42 },
});
