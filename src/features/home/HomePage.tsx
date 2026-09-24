import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/ui/AppText';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { Icon, type IconName } from '../../components/ui/Icon';
import { OpenStreetMap, type OpenStreetMapHandle, type OSMMapMarker } from '../../components/maps/OpenStreetMap';
import { useAppData } from '../../providers/app-data';
import { useBottomNavigation } from '../../components/navigation/BottomNavigationContext';
import { searchOsmPlaces } from '../../services/geo';
import { colors } from '../../theme';

const categories: { query: string; label: string; icon: IconName }[] = [
  { query: 'ทางลาดสำหรับรถเข็น', label: 'ทางลาด', icon: 'wheelchair' },
  { query: 'ทางข้ามคนเดินเท้า', label: 'ทางข้าม', icon: 'crosswalk' },
  { query: 'สวนสาธารณะ', label: 'สวนสาธารณะ', icon: 'park' },
];

export default function HomePage() {
  const { setCompact } = useBottomNavigation();
  const { location, placeLabel, locationStatus, locationMessage, isLocating, refreshLocation, weather, weatherMessage, refreshWeather, reports } = useAppData();
  const mapRef = useRef<OpenStreetMapHandle>(null);
  const [places, setPlaces] = useState<OSMMapMarker[]>([]);
  const [showReports, setShowReports] = useState(false);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [mapNotice, setMapNotice] = useState('');

  useFocusEffect(useCallback(() => setCompact(false), [setCompact]));

  const reportMarkers = useMemo(() => reports.map((report) => ({
    id: report.id,
    label: `${report.type} · ${report.severity}`,
    coordinates: report.coordinates,
    color: report.severity === 'สูง' ? '#dc2626' : report.severity === 'ปานกลาง' ? '#f97316' : '#eab308',
  })), [reports]);
  const visibleMarkers = showReports ? [...places, ...reportMarkers] : places;

  const showCategory = async (query: string, label: string) => {
    setLoadingCategory(true);
    setMapNotice(`กำลังค้นหา ${label} ใน OpenStreetMap`);
    try {
      const near = location ?? await refreshLocation();
      if (!near) {
        setMapNotice('ต้องอนุญาต GPS เพื่อค้นหาใกล้ตำแหน่งปัจจุบัน');
        return;
      }
      const found = await searchOsmPlaces(query, near);
      const mapped = found.map((place) => ({ id: place.id, label: place.name, coordinates: place.coordinates, color: '#2563eb' }));
      setPlaces(mapped);
      setMapNotice(mapped.length ? `พบ ${mapped.length} แห่ง · แตะหมุดเพื่อดูชื่อ` : `ไม่พบ ${label} ใกล้ตำแหน่งนี้`);
      if (mapped[0]) mapRef.current?.centerOn(mapped[0].coordinates);
    } catch (error) {
      setMapNotice(error instanceof Error ? error.message : 'ค้นหาสถานที่ไม่สำเร็จ');
    } finally {
      setLoadingCategory(false);
    }
  };

  const centerOnUser = async () => {
    const coordinates = location ?? await refreshLocation();
    if (coordinates) {
      mapRef.current?.centerOn(coordinates);
      setMapNotice('แสดงตำแหน่งจริงจาก GPS');
    } else {
      setMapNotice(locationMessage);
    }
  };

  const updateWeather = async () => {
    if (!location) await refreshLocation();
    refreshWeather();
    setMapNotice('กำลังอัปเดตสภาพอากาศตาม GPS จริง');
  };

  const sharePosition = async () => {
    if (!location) {
      setMapNotice('อนุญาตตำแหน่งก่อนแชร์พิกัดจริง');
      return;
    }
    const url = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`;
    await Share.share({ title: 'ตำแหน่ง StepAble', message: `${placeLabel}\n${url}` });
  };

  const weatherText = weather ? `${Math.round(weather.temperature)}°C · ${weatherLabel(weather.code)}` : locationStatus === 'denied' ? 'Enable GPS' : 'Loading weather';
  return (
    <View style={styles.screen}>
      <OpenStreetMap ref={mapRef} center={location} userLocation={location} markers={visibleMarkers} style={styles.map} />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.pill} accessibilityRole="button" accessibilityLabel="ค้นหาหรือเลือกสถานที่">
            <Icon name="pin" size={20} color={colors.forest} />
            <Text numberOfLines={1} style={styles.pillText}>{location ? placeLabel : locationStatus === 'denied' ? 'เปิดตำแหน่งเพื่อดูสถานที่จริง' : 'กำลังหาตำแหน่งจริง…'}</Text>
            <Icon name="chevron-down" size={16} color={colors.forest} />
          </Pressable>
          <Pressable onPress={() => { void updateWeather(); }} style={({ pressed }) => [styles.weather, pressed && styles.weatherPressed]} accessibilityRole="button" accessibilityLabel={`Weather: ${weatherText}. Tap to refresh`}>
            <WeatherGlyph code={weather?.code} />
            <Text numberOfLines={1} style={styles.weatherTemperature}>{weather ? `${Math.round(weather.temperature)}°C` : '--°'}</Text>
            <View style={styles.weatherDivider} />
            <View style={styles.weatherConditionBadge}>
              <View style={styles.weatherDot} />
              <Text numberOfLines={1} style={styles.weatherCondition}>{weather ? weatherLabel(weather.code) : locationStatus === 'denied' ? 'Enable GPS' : 'Loading'}</Text>
            </View>
          </Pressable>
        </View>
        <View style={styles.search}>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchMain} accessibilityRole="button" accessibilityLabel="ค้นหาสถานที่หรือเส้นทาง">
            <Icon name="search" size={22} color="#174589" />
            <Text numberOfLines={1} style={styles.searchValue}>{places.length ? 'แตะหมุดผลค้นหา หรือค้นหาเพิ่ม' : 'ค้นหาสถานที่หรือที่อยู่'}</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/(tabs)/search', params: { voice: 'true' } })} hitSlop={8} accessibilityRole="button" accessibilityLabel="เปิดช่องค้นหาเพื่อใช้ไมโครโฟนบนแป้นพิมพ์">
            <Icon name="microphone" size={20} color="#174589" />
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchButton} accessibilityRole="button" accessibilityLabel="ค้นหา"><Icon name="search" size={22} color="#FFFFFF" /></Pressable>
        </View>
        <View style={styles.categories}>
          {categories.map((category) => <CategoryButton key={category.label} icon={category.icon} label={category.label} onPress={() => { void showCategory(category.query, category.label); }} />)}
        </View>
        {!mapNotice && (locationStatus === 'denied' || locationStatus === 'error') ? (
          <Pressable onPress={() => { void refreshLocation(); }} style={styles.notice} accessibilityRole="button">
            <Text numberOfLines={2} style={styles.noticeText}>{locationMessage}</Text>
          </Pressable>
        ) : null}
        {mapNotice ? <View style={styles.notice}><Text numberOfLines={2} style={styles.noticeText}>{mapNotice}</Text></View> : null}
        {loadingCategory ? <ActivityIndicator style={styles.activity} color={colors.forest} /> : null}
        <View style={styles.mapRail}>
          <View style={styles.railGroup}>
            <RailButton icon="locate" label={isLocating ? 'กำลังอัปเดตตำแหน่ง' : 'แสดงตำแหน่งปัจจุบัน'} onPress={() => { void centerOnUser(); }} />
            <RailButton icon="plus" label="ขยายแผนที่" onPress={() => mapRef.current?.zoomIn()} />
            <RailButton icon="minus" label="ย่อแผนที่" onPress={() => mapRef.current?.zoomOut()} />
          </View>
          <View style={styles.railGroup}>
            <RailButton icon="map" label={showReports ? 'ซ่อนรายงานในอุปกรณ์นี้' : 'แสดงรายงานในอุปกรณ์นี้'} selected={showReports} onPress={() => setShowReports((value) => !value)} />
            <RailButton icon="navigation" label="เลือกเส้นทางเดิน" primary onPress={() => router.push('/(tabs)/routes')} />
            <RailButton icon="send" label="แชร์ตำแหน่งปัจจุบัน" onPress={() => { void sharePosition(); }} />
            <RailButton icon="warning" label="รายงานปัญหาทางเท้า" onPress={() => router.push('/report-issue')} />
          </View>
        </View>
        <Pressable onPress={() => { void updateWeather(); }} style={styles.sourceNote} accessibilityRole="button" accessibilityLabel={weatherMessage}>
          <Text style={styles.sourceText}>© OpenStreetMap · {weatherMessage}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function CategoryButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.categoryButton} accessibilityRole="button" accessibilityLabel={`ค้นหา${label}`}><Icon name={icon} size={20} color="#174589" /></Pressable>;
}

function RailButton({ icon, label, onPress, primary = false, selected = false }: { icon: IconName; label: string; onPress: () => void; primary?: boolean; selected?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.railButton, primary && styles.primaryRail, selected && styles.selectedRail]} accessibilityRole="button" accessibilityLabel={label}>
    <Icon name={icon} size={18} color={primary ? '#FFFFFF' : colors.forest} />
  </Pressable>;
}

function WeatherGlyph({ code }: { code?: number }) {
  const kind = weatherKind(code);

  if (kind === 'sun') {
    return (
      <Svg width={31} height={31} viewBox="0 0 32 32">
        <G stroke="#FDB43B" strokeWidth={2.5} strokeLinecap="round">
          <Line x1={16} y1={2} x2={16} y2={5} />
          <Line x1={16} y1={27} x2={16} y2={30} />
          <Line x1={2} y1={16} x2={5} y2={16} />
          <Line x1={27} y1={16} x2={30} y2={16} />
          <Line x1={6.1} y1={6.1} x2={8.3} y2={8.3} />
          <Line x1={23.7} y1={23.7} x2={25.9} y2={25.9} />
          <Line x1={25.9} y1={6.1} x2={23.7} y2={8.3} />
          <Line x1={8.3} y1={23.7} x2={6.1} y2={25.9} />
        </G>
        <Circle cx={16} cy={16} r={7.2} fill="#FDB43B" />
      </Svg>
    );
  }

  if (kind === 'fog') {
    return (
      <Svg width={31} height={31} viewBox="0 0 32 32">
        <G stroke="#8FB7F6" strokeWidth={3} strokeLinecap="round">
          <Line x1={5} y1={10} x2={24} y2={10} />
          <Line x1={8} y1={16} x2={27} y2={16} />
          <Line x1={5} y1={22} x2={22} y2={22} />
        </G>
      </Svg>
    );
  }

  const storm = kind === 'storm';
  const rain = kind === 'rain' || storm;
  const snow = kind === 'snow';
  return (
    <Svg width={34} height={31} viewBox="0 0 36 32">
      <Circle cx={21} cy={10} r={7} fill={storm ? '#8CA0B9' : '#AFCBFA'} opacity={0.72} />
      <Path d="M9 24h18.2a6.8 6.8 0 0 0 .7-13.6A9.5 9.5 0 0 0 10 9.1 7.5 7.5 0 0 0 9 24Z" fill={storm ? '#71869F' : '#6297EC'} />
      {rain ? <G stroke="#3F9CF7" strokeWidth={2.5} strokeLinecap="round"><Line x1={11} y1={26} x2={9.5} y2={29} /><Line x1={24} y1={26} x2={22.5} y2={29} /></G> : null}
      {storm ? <Path d="m17 19-3 6h3l-1 6 6-8h-3l2-4Z" fill="#FFD21E" /> : null}
      {snow ? <G stroke="#4D9EF6" strokeWidth={1.8} strokeLinecap="round"><Line x1={12} y1={26} x2={12} y2={30} /><Line x1={10} y1={28} x2={14} y2={28} /><Line x1={23} y1={26} x2={23} y2={30} /><Line x1={21} y1={28} x2={25} y2={28} /></G> : null}
    </Svg>
  );
}

function weatherKind(code?: number): 'sun' | 'cloud' | 'rain' | 'storm' | 'fog' | 'snow' {
  if (code === 0) return 'sun';
  if (code === 45 || code === 48) return 'fog';
  if (code !== undefined && code >= 71 && code <= 77) return 'snow';
  if (code !== undefined && code >= 95) return 'storm';
  if (code !== undefined && code >= 51 && code <= 82) return 'rain';
  return 'cloud';
}

function weatherLabel(code: number) {
  if (code === 0) return 'Sunny';
  if ([1, 2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if (code >= 51 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain';
  if (code >= 95) return 'Thunderstorm';
  return 'Latest weather';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDF5FB' },
  map: { position: 'absolute', inset: 0, height: '100%', borderRadius: 0 },
  overlay: { flex: 1, paddingHorizontal: 14, paddingTop: 8 },
  topRow: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 7, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  pillText: { color: '#102A72', fontSize: 12, fontWeight: '800', flex: 1 },
  weather: { width: '50%', minWidth: 0, minHeight: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.98)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 7, shadowColor: '#6480A0', shadowOpacity: 0.12, shadowRadius: 12, elevation: 3 },
  weatherPressed: { backgroundColor: '#F0F7FF', transform: [{ scale: 0.98 }] },
  weatherTemperature: { color: '#294765', fontSize: 17, fontWeight: '900', letterSpacing: -0.4, flexShrink: 0 },
  weatherDivider: { width: 1, height: 27, backgroundColor: '#D5DEE9', flexShrink: 0 },
  weatherConditionBadge: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: '#F1F6FF' },
  weatherDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4B8BEE' },
  weatherCondition: { color: '#547098', fontSize: 9, fontWeight: '800', flex: 1, minWidth: 0 },
  search: { marginTop: 12, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingLeft: 17, paddingRight: 4, gap: 10, shadowColor: '#0F172A', shadowOpacity: 0.11, shadowRadius: 14, elevation: 4 },
  searchMain: { flex: 1, minWidth: 0, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchValue: { flex: 1, color: '#5572A4', fontSize: 13, fontWeight: '600' },
  searchButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  categories: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 14 },
  categoryButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 9, elevation: 4 },
  mapRail: { position: 'absolute', right: 14, bottom: 45, alignItems: 'center', gap: 14 },
  railGroup: { borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.96)', padding: 5, gap: 5, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
  railButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  primaryRail: { backgroundColor: colors.forest },
  selectedRail: { backgroundColor: '#DBEAFE', borderWidth: 1, borderColor: '#2563EB' },
  notice: { marginTop: 8, alignSelf: 'flex-start', maxWidth: '76%', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)' },
  noticeText: { color: '#334155', fontSize: 10, lineHeight: 14 },
  activity: { position: 'absolute', top: 200, alignSelf: 'center' },
  sourceNote: { position: 'absolute', left: 14, right: 88, bottom: 4, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.88)' },
  sourceText: { fontSize: 8, color: '#334155' },
});
