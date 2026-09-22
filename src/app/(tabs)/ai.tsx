import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { AppText as Text } from '../../components/AppText';
import { useAppData } from '../../components/AppDataContext';
import { analyzeImage, type AiAnalysis } from '../../services/ai';
import { colors } from '../../theme';

export default function AiCameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { location } = useAppData();
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const runAnalysis = async (uri: string) => {
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
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>AI Camera</Text><Text style={styles.headerSub}>{photoUri ? 'ถ่ายภาพแล้ว' : 'กล้องสด · แตะเพื่อถ่ายภาพทางเท้า'}</Text></View>
          <View style={styles.statusPill}><View style={[styles.liveDot, permission?.granted && styles.liveDotOn]} /><Text style={styles.statusText}>{permission?.granted ? 'กล้องพร้อม' : 'ต้องอนุญาต'}</Text></View>
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
          <Metric icon="camera" label="กล้อง" value={permission?.granted ? 'พร้อม' : 'ปิด'} active={Boolean(permission?.granted)} />
          <Metric icon="flashlight" label="ไฟฉาย" value={torch ? 'เปิด' : 'ปิด'} active={torch} />
          <Metric icon="check" label="ภาพที่ถ่าย" value={photoUri ? '1 ภาพ' : '0 ภาพ'} active={Boolean(photoUri)} />
        </View>
        <Pressable onPress={() => { if (photoUri && !analyzing) void runAnalysis(photoUri); }} style={[styles.notice, analysis && styles.noticeSuccess, analysisError && styles.noticeError]} accessibilityRole="button" accessibilityLabel="วิเคราะห์ภาพด้วย AI">
          <View style={styles.noticeIcon}><Icon name={analysis ? 'check' : analysisError ? 'warning' : 'info'} size={17} color="#FFFFFF" /></View>
          <Text style={styles.noticeText}>{analyzing ? 'กำลังวิเคราะห์ทางเท้าจาก AI…' : analysis ? `พบสิ่งกีดขวาง ${analysis.obstacles.length} จุด · พื้นที่ทางเดิน ${Math.round(analysis.sidewalkCoverage * 100)}%` : analysisError ? `${analysisError} · แตะเพื่อลองใหม่` : 'ถ่ายภาพแล้วแตะเพื่อวิเคราะห์สิ่งกีดขวางด้วย AI'}</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable onPress={() => { if (photoUri) { setPhotoUri(null); setAnalysis(null); setAnalysisError(''); } else router.back(); }} style={styles.primary} accessibilityRole="button"><Icon name="back" size={20} color="#FFFFFF" /><Text style={styles.primaryText}>{photoUri ? 'ถ่ายใหม่' : 'กลับ'}</Text></Pressable>
          <Pressable onPress={reportPhoto} style={styles.secondary} accessibilityRole="button"><Icon name="flag" size={20} color={colors.forest} /><Text style={styles.secondaryText}>{photoUri ? 'แนบรายงาน' : 'รายงานปัญหา'}</Text></Pressable>
        </View>
        <View style={styles.captureRow}>
          <Pressable onPress={() => { void choosePhoto(); }} style={styles.thumbnail} accessibilityRole="button" accessibilityLabel="เลือกภาพจากคลัง">
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumbnailImage} /> : <Icon name="camera" size={18} color="#64748B" />}
          </Pressable>
          <Pressable onPress={() => { if (photoUri) { setPhotoUri(null); setAnalysis(null); setAnalysisError(''); } else void capturePhoto(); }} disabled={busy || !permission?.granted} style={[styles.capture, (!permission?.granted || busy) && styles.captureDisabled]} accessibilityRole="button" accessibilityLabel={photoUri ? 'ล้างภาพที่ถ่าย' : 'ถ่ายภาพ'}>
            {busy ? <ActivityIndicator color={colors.forest} /> : <View style={styles.captureInner} />}
          </Pressable>
          <View style={styles.captureSpacer} />
        </View>
      </View>
    </View>
  );
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
  statusPill: { minHeight: 34, borderRadius: 17, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
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
  notice: { minHeight: 46, borderRadius: 15, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }, noticeSuccess: { backgroundColor: '#E8F8F0' }, noticeError: { backgroundColor: '#FFF7E6' }, noticeIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, noticeText: { flex: 1, color: '#1E3A8A', fontSize: 10, lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 9 }, primary: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, primaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' }, secondary: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: '#EAF2FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, secondaryText: { color: colors.forest, fontSize: 10, fontWeight: '800' },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, thumbnail: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, thumbnailImage: { width: '100%', height: '100%' }, capture: { width: 58, height: 58, borderRadius: 29, borderWidth: 4, borderColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, captureDisabled: { borderColor: '#94A3B8' }, captureInner: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.forest }, captureSpacer: { width: 42 },
});
