import { issueLabel, severityLabel } from '../../i18n/reports';
import { errorMessage, t, useLanguage, useMessageState, message, type TranslationKey } from '../../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/ui/AppText';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { Icon, type IconName } from '../../components/ui/Icon';
import { OpenStreetMap, type OpenStreetMapHandle, type OSMMapMarker } from '../../components/maps/OpenStreetMap';
import { PlaceDetailsSheet } from '../../components/maps/PlaceDetailsSheet';
import { ReportDetailsSheet } from '../../components/reports/ReportDetailsSheet';
import { issueAppearance } from '../../components/reports/reportAppearance';
import { reportMarkerIconFor } from '../../components/maps/reportMarker';
import { placeIconForGeoapifyCategories, placeIconForOsmTags, placePriorityForGeoapifyCategories, placePriorityForOsmTags, type PlaceMarkerIcon } from '../../components/maps/placeMarker';
import { useAppData, type LocalReport } from '../../providers/app-data';
import { useBottomNavigation } from '../../components/navigation/BottomNavigationContext';
import type { MapBounds } from '../../services/geo';
import { findImportantOsm, findNearbyOsm, type NearbyCategory } from '../../services/nearbyOsm';
import { findImportantGeoapify, hasGeoapifyKey } from '../../services/geoapifyPlaces';
import { intersectsSupportedProvince, isInSupportedProvince } from '../../services/supportedProvinces';
import { colors } from '../../theme';

const categoryIcons: Record<NearbyCategory, PlaceMarkerIcon> = {
  ramps: 'wheelchair',
  crossings: 'crosswalk',
  parks: 'park',
};

export default function HomePage() {
  const categories: { category: NearbyCategory; labelKey: TranslationKey; icon: IconName; accent: string }[] = [
    { category: 'ramps', labelKey: 'home.ramps', icon: 'wheelchair', accent: '#2563EB' },
    { category: 'crossings', labelKey: 'home.crossings', icon: 'crosswalk', accent: '#7C3AED' },
    { category: 'parks', labelKey: 'home.parks', icon: 'park', accent: '#15803D' },
  ];
  useLanguage();
  const { setCompact } = useBottomNavigation();
  const { location, placeLabel, locationStatus, locationMessage, isLocating, refreshLocation, weather, refreshWeather, reports } = useAppData();
  const mapRef = useRef<OpenStreetMapHandle>(null);
  const categoryRequest = useRef(0);
  const poiRequest = useRef(0);
  const poiCoverage = useRef<MapBounds | null>(null);
  const poiCoverageZoom = useRef(0);
  const poiViewport = useRef<{ bounds: MapBounds; zoom: number } | null>(null);
  const poiRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poiDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poiRetryCount = useRef(0);
  const [places, setPlaces] = useState<OSMMapMarker[]>([]);
  const [importantPlaces, setImportantPlaces] = useState<OSMMapMarker[]>([]);
  const [poiStatus, setPoiStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const [selectedPlace, setSelectedPlace] = useState<OSMMapMarker | null>(null);
  const [selectedReport, setSelectedReport] = useState<LocalReport | null>(null);
  const [activeCategory, setActiveCategory] = useState<NearbyCategory | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [mapNotice, setMapNotice] = useMessageState('');

  useFocusEffect(useCallback(() => setCompact(false), [setCompact]));

  const loadImportantPlaces = useCallback(function loadImportantPlaces(bounds: MapBounds, zoom: number, retry = false) {
    const coverage = poiCoverage.current;
    if (!retry && coverage && zoom <= poiCoverageZoom.current
      && bounds.west >= coverage.west && bounds.east <= coverage.east
      && bounds.south >= coverage.south && bounds.north <= coverage.north) return;
    if (!retry) poiRetryCount.current = 0;
    if (poiRetryTimer.current) clearTimeout(poiRetryTimer.current);
    poiRetryTimer.current = null;
    const request = ++poiRequest.current;
    const longitudePadding = (bounds.east - bounds.west) * 0.2;
    const latitudePadding = (bounds.north - bounds.south) * 0.2;
    const queryBounds = {
      west: bounds.west - longitudePadding,
      south: bounds.south - latitudePadding,
      east: bounds.east + longitudePadding,
      north: bounds.north + latitudePadding,
    };
    poiCoverage.current = queryBounds;
    poiCoverageZoom.current = zoom;
    setPoiStatus('loading');
    const requestPlaces = hasGeoapifyKey
      ? findImportantGeoapify(queryBounds).then((found) => found.length ? found : findImportantOsm(queryBounds).catch(() => found))
      : findImportantOsm(queryBounds);
    void requestPlaces.then((found) => {
      if (request !== poiRequest.current) return;
      poiRetryCount.current = 0;
      const mapped = found.flatMap((place) => {
        const geoapifyCategories = 'categories' in place && Array.isArray(place.categories) ? place.categories : [];
        const placeIcon = placeIconForGeoapifyCategories(geoapifyCategories) ?? placeIconForOsmTags(place.tags);
        if (!placeIcon || !isInSupportedProvince(place.coordinates)) return [];
        return [{
          id: place.id,
          label: place.name || t('service.openstreetmapPlace'),
          coordinates: place.coordinates,
          placeIcon,
          showLabel: Boolean(place.name),
          markerKind: 'poi' as const,
          poiPriority: Math.max(placePriorityForGeoapifyCategories(geoapifyCategories), placePriorityForOsmTags(place.tags)),
          osmTags: place.tags,
        }];
      });
      if (!mapped.length) poiCoverage.current = null;
      setImportantPlaces(mapped);
      setPoiStatus(mapped.length ? 'idle' : 'empty');
    }).catch(() => {
      if (request !== poiRequest.current) return;
      setPoiStatus('error');
      const delay = Math.min(30000 * 2 ** poiRetryCount.current, 120000);
      poiRetryCount.current += 1;
      poiRetryTimer.current = setTimeout(() => loadImportantPlaces(bounds, zoom, true), delay);
    });
  }, []);

  const onViewportChange = useCallback((bounds: MapBounds, zoom: number) => {
    if (poiDebounceTimer.current) clearTimeout(poiDebounceTimer.current);
    poiViewport.current = { bounds, zoom };
    if (!intersectsSupportedProvince(bounds)) {
      poiRequest.current += 1;
      poiCoverage.current = null;
      if (poiRetryTimer.current) clearTimeout(poiRetryTimer.current);
      setImportantPlaces([]);
      setPoiStatus('idle');
      return;
    }
    if (zoom < 11) {
      poiRequest.current += 1;
      poiCoverage.current = null;
      if (poiRetryTimer.current) clearTimeout(poiRetryTimer.current);
      setImportantPlaces([]);
      setPoiStatus('idle');
      return;
    }
    poiDebounceTimer.current = setTimeout(() => loadImportantPlaces(bounds, zoom), 350);
  }, [loadImportantPlaces]);

  useEffect(() => () => {
    poiRequest.current += 1;
    if (poiRetryTimer.current) clearTimeout(poiRetryTimer.current);
    if (poiDebounceTimer.current) clearTimeout(poiDebounceTimer.current);
  }, []);

  const reportMarkers = reports.map((report) => ({
    id: report.id,
    label: `${issueLabel(report.type)} · ${severityLabel(report.severity)}`,
    coordinates: report.coordinates,
    color: issueAppearance[report.type].color,
    reportIcon: reportMarkerIconFor(report.type),
  }));
  const categoryIds = new Set(places.map((place) => place.id));
  const visibleMarkers: OSMMapMarker[] = [
    ...importantPlaces.filter((place) => !categoryIds.has(place.id)),
    ...places,
    ...(showReports ? reportMarkers : []),
  ];

  const showCategory = async (category: NearbyCategory, labelKey: TranslationKey) => {
    const request = ++categoryRequest.current;
    setActiveCategory(category);
    setPlaces([]);
    setLoadingCategory(true);
    setMapNotice(message('home.searchingOpenstreetmapFor', { value0: message(labelKey) }));
    try {
      const near = location ?? await refreshLocation();
      if (!near) {
        if (request === categoryRequest.current) setMapNotice(message('home.allowGpsAccessToSearchNearYour'));
        return;
      }
      const bounds = poiViewport.current?.bounds ?? {
        west: near.longitude - 0.05,
        south: near.latitude - 0.05,
        east: near.longitude + 0.05,
        north: near.latitude + 0.05,
      };
      const found = await findNearbyOsm(category, bounds, near, t(labelKey));
      if (request !== categoryRequest.current) return;
      const mapped = found.map((place) => ({
        id: place.id,
        label: place.name,
        coordinates: place.coordinates,
        placeIcon: categoryIcons[category],
        showLabel: place.name !== t(labelKey),
        osmTags: place.osmTags,
      }));
      setPlaces(mapped);
      setMapNotice(mapped.length ? message('home.foundPlacesTapAPinForIts', { value0: mapped.length }) : message('home.noFoundNearby', { value0: message(labelKey) }));
      if (!mapped.length) mapRef.current?.centerOn(near);
    } catch (error) {
      if (request === categoryRequest.current) setMapNotice(errorMessage(error, 'home.couldNotFindPlaces'));
    } finally {
      if (request === categoryRequest.current) setLoadingCategory(false);
    }
  };

  const centerOnUser = async () => {
    const coordinates = location ?? await refreshLocation();
    if (coordinates) {
      mapRef.current?.centerOn(coordinates);
      setMapNotice(message('home.showingYourGpsLocation'));
    } else {
      setMapNotice(locationMessage);
    }
  };

  const updateWeather = async () => {
    if (!location) await refreshLocation();
    refreshWeather();
    setMapNotice(message('home.updatingWeatherForYourGpsLocation'));
  };

  const sharePosition = async () => {
    if (!location) {
      setMapNotice(message('home.allowLocationAccessBeforeSharingYourPosition'));
      return;
    }
    const url = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`;
    await Share.share({ title: t('home.stepableLocation'), message: `${placeLabel}\n${url}` });
  };

  const weatherText = weather ? `${Math.round(weather.temperature)}°C · ${weatherLabel(weather.code)}` : locationStatus === 'denied' ? 'Enable GPS' : 'Loading weather';
  const openMarker = (markerId: string) => {
    const report = reports.find((item) => item.id === markerId);
    if (report) {
      setSelectedReport(report);
      return;
    }
    const selected = visibleMarkers.find((marker) => marker.id === markerId && marker.placeIcon);
    if (selected) setSelectedPlace(selected);
  };
  return (
    <View style={styles.screen}>
      <OpenStreetMap ref={mapRef} center={location} userLocation={location} markers={visibleMarkers} fitCoordinates={places.map((place) => place.coordinates)} onMarkerPress={openMarker} onViewportChange={onViewportChange} style={styles.map} />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.pill} accessibilityRole="button" accessibilityLabel={t('home.searchOrChooseAPlace')}>
            <Icon name="pin" size={20} color={colors.forest} />
            <Text numberOfLines={1} style={styles.pillText}>{location ? placeLabel : locationStatus === 'denied' ? t('home.enableLocationToSeeNearbyPlaces') : t('home.findingYourLocation')}</Text>
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
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchMain} accessibilityRole="button" accessibilityLabel={t('home.searchPlacesOrRoutes')}>
            <Icon name="search" size={22} color="#174589" />
            <Text numberOfLines={1} style={styles.searchValue}>{places.length ? t('home.tapASearchPinOrSearchAgain') : t('home.searchForAPlaceOrAddress')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/(tabs)/search', params: { voice: 'true' } })} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('home.openSearchToUseYourKeyboardMicrophone')}>
            <Icon name="microphone" size={20} color="#174589" />
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchButton} accessibilityRole="button" accessibilityLabel={t('common.search')}><Icon name="search" size={22} color="#FFFFFF" /></Pressable>
        </View>
        <View style={styles.categories}>
          {categories.map((item) => <CategoryButton key={item.category} icon={item.icon} label={t(item.labelKey)} accent={item.accent} selected={activeCategory === item.category} loading={loadingCategory && activeCategory === item.category} onPress={() => { void showCategory(item.category, item.labelKey); }} />)}
        </View>
        {poiStatus === 'error' ? <Pressable style={styles.poiNotice} onPress={() => { if (poiViewport.current) loadImportantPlaces(poiViewport.current.bounds, poiViewport.current.zoom, true); }} accessibilityRole="button" accessibilityLabel={t('home.poiLoadFailedRetry')}>
          <Text style={styles.poiNoticeText}>{t('home.poiLoadFailedRetry')}</Text>
        </Pressable> : null}
        {poiStatus === 'loading' && importantPlaces.length === 0 ? <View style={styles.poiNotice}><ActivityIndicator size="small" color={colors.forest} /><Text style={styles.poiNoticeText}>{t('home.loadingMapPlaces')}</Text></View> : null}
        {poiStatus === 'empty' ? <View style={styles.poiNotice}><Text style={styles.poiNoticeText}>{t('home.noMappedPlacesHere')}</Text></View> : null}
        {!mapNotice && (locationStatus === 'denied' || locationStatus === 'error') ? (
          <Pressable onPress={() => { void refreshLocation(); }} style={styles.notice} accessibilityRole="button">
            <Text numberOfLines={2} style={styles.noticeText}>{locationMessage}</Text>
          </Pressable>
        ) : null}
        {mapNotice ? <View style={styles.notice}><Text numberOfLines={2} style={styles.noticeText}>{mapNotice}</Text></View> : null}
        <View style={styles.mapRail}>
          <View style={styles.railGroup}>
            <RailButton icon="locate" label={isLocating ? t('home.updatingLocation') : t('home.showCurrentLocation')} onPress={() => { void centerOnUser(); }} />
            <RailButton icon="plus" label={t('home.zoomIn')} onPress={() => mapRef.current?.zoomIn()} />
            <RailButton icon="minus" label={t('home.zoomOut')} onPress={() => mapRef.current?.zoomOut()} />
          </View>
          <View style={styles.railGroup}>
            <RailButton icon="map" label={showReports ? t('home.hideReportsOnThisDevice') : t('home.showReportsOnThisDevice')} selected={showReports} onPress={() => setShowReports((value) => !value)} />
            <RailButton icon="navigation" label={t('home.chooseAWalkingRoute')} primary onPress={() => router.push('/(tabs)/routes')} />
            <RailButton icon="send" label={t('home.shareCurrentLocation')} onPress={() => { void sharePosition(); }} />
            <RailButton icon="warning" label={t('home.reportASidewalkIssue')} onPress={() => router.push('/report-issue')} />
          </View>
        </View>
      </SafeAreaView>
      <PlaceDetailsSheet place={selectedPlace} userLocation={location} onClose={() => setSelectedPlace(null)} onRoute={(place) => {
        setSelectedPlace(null);
        router.push({ pathname: '/(tabs)/routes', params: { destination: place.label, lat: String(place.coordinates.latitude), lon: String(place.coordinates.longitude) } });
      }} />
      <ReportDetailsSheet report={selectedReport} onClose={() => setSelectedReport(null)} onRoute={(report) => {
        setSelectedReport(null);
        router.push({ pathname: '/(tabs)/routes', params: { destination: issueLabel(report.type), lat: String(report.coordinates.latitude), lon: String(report.coordinates.longitude) } });
      }} />
    </View>
  );
}

function CategoryButton({ icon, label, accent, selected, loading, onPress }: { icon: IconName; label: string; accent: string; selected: boolean; loading: boolean; onPress: () => void }) {
  useLanguage();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.categoryButton, selected && { backgroundColor: accent }, pressed && styles.categoryButtonPressed]} accessibilityRole="button" accessibilityState={{ selected, busy: loading }} accessibilityLabel={t('home.searchFor', { value0: label })}>
    {loading ? <ActivityIndicator size="small" color={selected ? '#FFFFFF' : accent} /> : <Icon name={icon} size={21} color={selected ? '#FFFFFF' : accent} strokeWidth={2} />}
  </Pressable>;
}

function RailButton({ icon, label, onPress, primary = false, selected = false }: { icon: IconName; label: string; onPress: () => void; primary?: boolean; selected?: boolean }) {
  useLanguage();
  return <Pressable onPress={onPress} style={[styles.railButton, primary && styles.primaryRail, selected && styles.selectedRail]} accessibilityRole="button" accessibilityLabel={label}>
    <Icon name={icon} size={18} color={primary ? '#FFFFFF' : colors.forest} />
  </Pressable>;
}

function WeatherGlyph({ code }: { code?: number }) {
  useLanguage();
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
  categories: { flexDirection: 'row', alignSelf: 'center', gap: 18, marginTop: 14 },
  categoryButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 9, elevation: 4 },
  categoryButtonPressed: { opacity: 0.78 },
  poiNotice: { marginTop: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '90%', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.96)' },
  poiNoticeText: { color: '#174589', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  mapRail: { position: 'absolute', right: 14, bottom: 45, alignItems: 'center', gap: 14 },
  railGroup: { borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.96)', padding: 5, gap: 5, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
  railButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  primaryRail: { backgroundColor: colors.forest },
  selectedRail: { backgroundColor: '#DBEAFE', borderWidth: 1, borderColor: '#2563EB' },
  notice: { marginTop: 8, alignSelf: 'flex-start', maxWidth: '76%', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)' },
  noticeText: { color: '#334155', fontSize: 10, lineHeight: 14 },
});
