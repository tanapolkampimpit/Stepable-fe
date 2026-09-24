import { detectionDistance, detectionPosition } from '../../i18n/detections';
import { errorMessage, t, useLanguage, useMessageState } from '../../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
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
  const { locale } = useLanguage();
  const { live } = useLocalSearchParams<{ live?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { location, navigationPlan } = useAppData();
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraError, setCameraError] = useMessageState('');
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useMessageState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [liveMode, setLiveMode] = useState(() => live !== 'false');
  const liveBusy = useRef(false);
  const lastAnnouncement = useRef('');
  const lastRouteAnnouncement = useRef('');
  const navigationCueRef = useRef<NavigationCue | null>(null);

  const navigationCue = ((): NavigationCue | null => {
    if (!liveMode || !navigationPlan || !location) return null;
    if (distanceMeters(location, navigationPlan.destination.coordinates) <= 25) {
      return { key: 'destination', instruction: t('ai.youHaveArrived'), distanceMeters: 0, maneuverIndex: -1 };
    }
    const progress = getRouteProgress(navigationPlan.route, location);
    if (progress.offRoute) {
      return { key: 'off-route', instruction: t('ai.offRoute'), distanceMeters: 0, maneuverIndex: -1 };
    }
    const maneuver = navigationPlan.route.maneuvers[progress.maneuverIndex];
    if (!maneuver) return null;
    return {
      key: `${progress.maneuverIndex}`,
      instruction: getManeuverInstruction(maneuver),
      distanceMeters: distanceBetweenRouteIndices(navigationPlan.route.coordinates, progress.nearestIndex, maneuver.end_shape_index),
      maneuverIndex: progress.maneuverIndex,
    };
  })();

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
      setAnalysisError(errorMessage(error, 'ai.analysisFailed'));
    } finally {
      setAnalyzing(false);
    }
  }, [setAnalysisError]);

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
          Speech.speak(announcement, { language: locale, rate: 0.95 });
        }
      } catch (error) {
        if (active) setAnalysisError(errorMessage(error, 'ai.analysisFailed'));
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
  }, [liveMode, permission?.granted, photoUri, locale, setAnalysisError]);

  useEffect(() => {
    if (!liveMode || !navigationCue) {
      lastRouteAnnouncement.current = '';
      return;
    }
    const bucket = routeAnnouncementBucket(navigationCue.distanceMeters);
    const key = `${locale}:${navigationCue.key}:${bucket}`;
    if (key === lastRouteAnnouncement.current) return;
    lastRouteAnnouncement.current = key;
    const spoken = navigationCue.key === 'destination'
      ? navigationCue.instruction
      : navigationCue.key === 'off-route'
        ? t('ai.gpsIndicatesYouAreOffRoutePlease')
        : t('ai.in', { value0: formatGuidanceDistance(navigationCue.distanceMeters), value1: navigationCue.instruction });
    Speech.stop();
    Speech.speak(spoken, { language: locale, rate: 0.92 });
  }, [liveMode, navigationCue, locale]);

  const reportPhoto = () => {
    router.push({ pathname: '/report-issue', params: { ...(location ? { lat: String(location.latitude), lon: String(location.longitude) } : {}), ...(photoUri ? { image: photoUri } : {}) } });
  };

  const speakCurrent = () => {
    const message = navigationCue?.instruction
      ?? (analysis ? liveAnnouncement(analysis) : t('ai.analyzingTheImagePleaseWait'));
    Speech.stop();
    Speech.speak(message, { language: locale, rate: 0.92 });
  };

  const shareAiResult = async () => {
    const message = analysis
      ? `StepAble AI: ${formatAnalysis(analysis)}`
      : t('ai.stepableAiIsCheckingTheWalkway');
    await Share.share({ title: t('ai.stepableAiResults'), message });
  };

  const toggleLiveMode = () => {
    if (photoUri) return;
    setLiveMode((value) => !value);
    lastAnnouncement.current = '';
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
        {permission?.granted ? <View style={styles.aiTopControls}>
          <View style={styles.brandChip}>
            <View style={styles.brandMark}><Icon name="sparkles" size={15} color="#FFFFFF" /></View>
            <View><Text style={styles.brandTitle}>StepAble</Text><Text style={styles.brandSub}>AI Camera</Text></View>
          </View>
          <View style={styles.topPill}>
            <Pressable onPress={() => setTorch((value) => !value)} style={[styles.topPillButton, torch && styles.topPillButtonActive]} accessibilityRole="button" accessibilityLabel={torch ? t('ai.turnFlashlightOff') : t('ai.turnFlashlightOn')}><Icon name="flashlight" size={20} color={torch ? '#FFFFFF' : '#111827'} /></Pressable>
            <Pressable onPress={() => setFacing((value) => value === 'back' ? 'front' : 'back')} style={styles.topPillButton} accessibilityRole="button" accessibilityLabel={t('ai.switchFrontAndRearCameras')}><Icon name="swap" size={20} color="#111827" /></Pressable>
          </View>
        </View> : null}

        {!permission?.granted ? <Pressable onPress={() => { void requestPermission(); }} style={styles.permissionCard} accessibilityRole="button">
          <Icon name="camera" size={24} color={colors.forest} /><Text style={styles.permissionTitle}>{t('ai.allowCameraAccess')}</Text><Text style={styles.permissionSub}>{t('ai.theCameraIsUsedWhileThisPage')}</Text><Text style={styles.permissionAction}>{t('ai.allowAndOpenCamera')}</Text>
        </Pressable> : null}
      </SafeAreaView>

      {cameraError ? <View style={styles.cameraNotice}><Text style={styles.cameraNoticeText}>{cameraError}</Text></View> : null}

      {permission?.granted ? <View style={styles.voiceDock}>
        {navigationCue ? <View style={styles.voiceStatus} accessibilityLiveRegion="polite">
          <View style={[styles.voiceStatusDot, navigationCue.instruction === t('ai.offRoute') && styles.voiceStatusDotWarning]} />
          <Text numberOfLines={1} style={styles.voiceStatusText}>{navigationCue.instruction} · {formatGuidanceDistance(navigationCue.distanceMeters)}</Text>
        </View> : analysis || analysisError ? <Pressable onPress={() => { if (photoUri && !analyzing) void runAnalysis(photoUri); }} style={styles.voiceStatus} accessibilityRole="button" accessibilityLabel={t('ai.analyzeImageWithAi')}>
          <View style={[styles.voiceStatusDot, analysisError && styles.voiceStatusDotWarning]} />
          <Text numberOfLines={1} style={styles.voiceStatusText}>{analysisError || (analyzing ? t('ai.analyzingImage') : formatAnalysis(analysis as AiAnalysis))}</Text>
        </Pressable> : <View style={styles.voiceStatus} accessibilityLiveRegion="polite">
          <View style={[styles.voiceStatusDot, styles.voiceStatusDotReady]} />
          <Text numberOfLines={1} style={styles.voiceStatusText}>{t('ai.waitingForAiAnalysis')}</Text>
        </View>}
        <View style={styles.voiceControls}>
          <Pressable onPress={reportPhoto} style={styles.voiceCircle} accessibilityRole="button" accessibilityLabel={t('ai.reportAnIssue')}><Icon name="flag" size={21} color="#2563EB" /></Pressable>
          <Pressable onPress={() => { void shareAiResult(); }} style={styles.voiceCircle} accessibilityRole="button" accessibilityLabel={t('ai.shareAiResults')}><Icon name="upload" size={21} color="#111827" /></Pressable>
          <Pressable onPress={toggleLiveMode} style={[styles.voiceStartButton, liveMode && styles.voiceStartButtonActive]} accessibilityRole="button" accessibilityLabel={liveMode ? t('ai.stopAiDetection') : t('ai.startAiDetection')}>{liveMode ? <Icon name="pause" size={22} color="#FFFFFF" /> : <Text style={[styles.voiceStartText, styles.voiceStartTextIdle]}>AI</Text>}</Pressable>
          <Pressable onPress={speakCurrent} style={styles.voiceCircle} accessibilityRole="button" accessibilityLabel={t('ai.readAnalysisAloud')}><Icon name="microphone" size={21} color="#111827" /></Pressable>
          <Pressable onPress={() => { if (photoUri) { setPhotoUri(null); setAnalysis(null); setAnalysisError(''); } else router.back(); }} style={[styles.voiceCircle, styles.voiceClose]} accessibilityRole="button" accessibilityLabel={photoUri ? t('ai.retakePhoto') : t('ai.closeAiCamera')}><Icon name="close" size={22} color="#FFFFFF" /></Pressable>
        </View>
      </View> : null}
    </View>
  );
}

function getAiClassLabels(): Record<string, string> { return {
  person: t('ai.person'),
  vehicle: t('ai.car'),
  two_wheeler: t('ai.motorcycleBicycle'),
  road_sidewalk: t('ai.roadSidewalk'),
  building: t('ai.building'),
  vegetation: t('ai.vegetation'),
  street_fixture: t('ai.streetObstacle'),
}; }

function formatAnalysis(result: AiAnalysis) {
  const labels = [...new Set(result.obstacles.map((item) => `${getAiClassLabels()[item.className] || t('ai.unknownObstacle')} · ${detectionPosition(item.position)} · ${detectionDistance(item.distanceBand)}`))];
  const detected = labels.length ? ` (${labels.join(', ')})` : '';
  return t('ai.obstaclesDetectedWalkwayCoverage', { value0: result.obstacles.length, value1: detected, value2: Math.round(result.sidewalkCoverage * 100) });
}

function liveAnnouncement(result: AiAnalysis) {
  if (!result.obstacles.length) return t('ai.noObstaclesDetectedAhead');
  const items = [...new Set(result.obstacles.map((item) => `${getAiClassLabels()[item.className] || t('ai.unknownObstacle')} ${detectionPosition(item.position)} ${detectionDistance(item.distanceBand)}`))];
  return t('ai.watchOut', { value0: items.join(t('ai.and')) });
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
  if (distance < 1_000) return t('ai.meters', { value0: Math.max(0, Math.round(distance / 5) * 5) });
  return t('ai.kilometers', { value0: (distance / 1_000).toFixed(1) });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101722' },
  camera: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  permissionBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#DFEAF0' },
  tint: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8,20,38,0.12)' },
  safe: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  aiTopControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandChip: { minHeight: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, paddingVertical: 5, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 10, elevation: 7 },
  brandMark: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  brandTitle: { color: '#173B8F', fontSize: 11, lineHeight: 13, fontWeight: '900' },
  brandSub: { color: '#7B8CA2', fontSize: 8, lineHeight: 10, fontWeight: '700' },
  topCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 7 },
  topPill: { width: 104, height: 52, borderRadius: 26, paddingHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 7 },
  topPillButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  topPillButtonActive: { backgroundColor: colors.forest },
  moreButton: { width: 45, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
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
  voiceDock: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 12 },
  voiceStatus: { minHeight: 38, borderRadius: 19, paddingHorizontal: 13, backgroundColor: 'rgba(255,255,255,0.9)', flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000000', shadowOpacity: 0.13, shadowRadius: 10, elevation: 6 },
  voiceStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB' },
  voiceStatusDotReady: { backgroundColor: '#16A166' },
  voiceStatusDotWarning: { backgroundColor: '#D97706' },
  voiceStatusText: { flex: 1, color: '#1E293B', fontSize: 10, fontWeight: '800' },
  voiceControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  voiceCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.97)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 10, elevation: 7 },
  voiceCircleActive: { backgroundColor: '#91D5FF' },
  voiceClose: { backgroundColor: '#DC2626' },
  voiceStartButton: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#2563EB', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 11, elevation: 8 },
  voiceStartButtonActive: { backgroundColor: '#16A166' },
  voiceStartText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  voiceStartTextIdle: { color: '#FFFFFF', fontSize: 16 },
  voiceWave: { flex: 1, minWidth: 90, maxWidth: 142, height: 58, borderRadius: 29, backgroundColor: '#E7EEF6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 9, shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 5 },
  waveBars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voiceWaveText: { maxWidth: 58, color: '#2563EB', fontSize: 9, fontWeight: '900' },
  waveBar: { width: 4, borderRadius: 3, backgroundColor: '#4D95F5' },
  waveBarShort: { height: 12 },
  waveBarMedium: { height: 25 },
  waveBarTall: { height: 37 },
  metrics: { flexDirection: 'row' }, metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3, borderRightWidth: 1, borderRightColor: '#E2E8F0' }, metricLabel: { color: '#334E7D', fontSize: 9, textAlign: 'center' }, metricValue: { color: '#102A72', fontSize: 17, fontWeight: '800' }, green: { color: '#16A166' },
  routeCue: { minHeight: 48, borderRadius: 15, backgroundColor: '#E8F8F0', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }, routeCueIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, routeCueIconWarning: { backgroundColor: '#D97706' }, routeCueCopy: { flex: 1, gap: 2 }, routeCueTitle: { color: '#102A72', fontSize: 13, fontWeight: '800' }, routeCueSub: { color: '#16734C', fontSize: 10, fontWeight: '700' },
  notice: { minHeight: 46, borderRadius: 15, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }, noticeSuccess: { backgroundColor: '#E8F8F0' }, noticeError: { backgroundColor: '#FFF7E6' }, noticeIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, noticeText: { flex: 1, color: '#1E3A8A', fontSize: 10, lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 9 }, primary: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, primaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' }, secondary: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, secondaryText: { color: colors.forest, fontSize: 10, fontWeight: '800' },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, thumbnail: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, liveBadge: { backgroundColor: '#E8F8F0' }, thumbnailImage: { width: '100%', height: '100%' }, capture: { width: 58, height: 58, borderRadius: 29, borderWidth: 4, borderColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, captureDisabled: { borderColor: '#94A3B8' }, captureInner: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.forest }, liveStopInner: { width: 24, height: 24, borderRadius: 5, backgroundColor: '#DC2626' }, captureSpacer: { width: 42 },
});
