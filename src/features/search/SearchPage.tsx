import { errorMessage, t, useLanguage, useMessageState, message } from '../../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText as Text } from '../../components/ui/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../../components/ui/Icon';
import { Screen } from '../../components/layout/Screen';
import { useAppData, type SavedPlace } from '../../providers/app-data';
import { searchOsmPlaces, type MapPlace } from '../../services/geo';
import { colors } from '../../theme';

const RECENT_KEY = '@stepable/recent-searches';

export default function SearchPage() {
  useLanguage();
  const { query: initialQuery, voice } = useLocalSearchParams<{ query?: string; voice?: string }>();
  const { location, locationStatus, locationMessage, savedPlaces, savePlace, removeSavedPlace } = useAppData();
  const [query, setQuery] = useState(typeof initialQuery === 'string' ? initialQuery : '');
  const [results, setResults] = useState<MapPlace[]>([]);
  const [recent, setRecent] = useState<MapPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useMessageState('');
  const lastInitialQuery = useRef('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(RECENT_KEY).then((value) => {
      if (active && value) setRecent(JSON.parse(value) as MapPlace[]);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const executeSearch = useCallback(async (rawQuery = query) => {
    const cleanQuery = rawQuery.trim();
    if (!cleanQuery) {
      setError(message('search.enterAPlaceNameOrAddressBefore'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const found = await searchOsmPlaces(cleanQuery, location ?? undefined);
      setResults(found);
      if (!found.length) setError(message('search.noPlacesFoundTryAnAreaStreet'));
    } catch (searchError) {
      setError(errorMessage(searchError, 'search.searchFailedCheckYourConnectionAndTry'));
    } finally {
      setLoading(false);
    }
  }, [location, query, setError]);

  useEffect(() => {
    const cleanQuery = typeof initialQuery === 'string' ? initialQuery.trim() : '';
    if (cleanQuery && cleanQuery !== lastInitialQuery.current) {
      lastInitialQuery.current = cleanQuery;
      setQuery(cleanQuery);
      void executeSearch(cleanQuery);
    }
  }, [executeSearch, initialQuery]);

  useEffect(() => {
    if (voice !== 'true') return;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(focusTimer);
  }, [voice]);

  const favoriteIds = useMemo(() => new Set(savedPlaces.map((place) => place.id)), [savedPlaces]);

  const choosePlace = async (place: MapPlace | SavedPlace) => {
    const recentPlace: MapPlace = 'description' in place
      ? place
      : { id: place.id, name: place.label, description: '', category: '', coordinates: place.coordinates };
    const nextRecent = [recentPlace, ...recent.filter((item) => item.id !== recentPlace.id)].slice(0, 6);
    setRecent(nextRecent);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
    router.push({
      pathname: '/(tabs)/routes',
      params: {
        destination: recentPlace.name,
        lat: String(recentPlace.coordinates.latitude),
        lon: String(recentPlace.coordinates.longitude),
      },
    });
  };

  const toggleSaved = (place: MapPlace) => {
    if (favoriteIds.has(place.id)) void removeSavedPlace(place.id);
    else void savePlace({ id: place.id, label: place.name, coordinates: place.coordinates });
  };

  const showResults = results.length ? results : recent;

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.circleButton} accessibilityRole="button" accessibilityLabel={t('reportissue.back')}><Icon name="back" size={21} color="#174589" /></Pressable>
        <Text style={styles.title}>{t('search.searchPlaces')}</Text>
        <Pressable onPress={() => setResults([])} style={styles.circleButton} accessibilityRole="button" accessibilityLabel={t('search.clearSearchResults')}><Icon name="close" size={18} color="#174589" /></Pressable>
      </View>

      <View style={styles.routeCard}>
        <View style={styles.routeRow}>
          <View style={styles.locationIcon}><View style={styles.currentDot} /></View>
          <View style={styles.routeCopy}>
            <Text style={styles.label}>{t('search.startDeviceGps')}</Text>
            <Text numberOfLines={1} style={styles.routeValue}>{location ? t('routes.currentLocation') : t('search.findingYourLocation')}</Text>
          </View>
        </View>
        <View style={styles.routeDivider} />
        <View style={styles.routeRow}>
          <View style={[styles.locationIcon, styles.pinSoft]}><Icon name="pin" size={20} color="#EF4444" /></View>
          <View style={styles.routeCopy}>
            <Text style={styles.label}>{t('navigation.destination')}</Text>
            <Text numberOfLines={1} style={styles.routeValue}>{query.trim() || t('search.searchOpenstreetmap')}</Text>
          </View>
        </View>
        <Pressable onPress={() => inputRef.current?.focus()} style={styles.changeDestination} accessibilityRole="button" accessibilityLabel={t('search.editDestination')}>
          <Icon name="swap" size={21} color={colors.forest} />
        </Pressable>
      </View>

      {!location ? <Text style={styles.locationHint}>{locationStatus === 'denied' ? locationMessage : t('search.allowGpsAccessToFindNearbyPlaces')}</Text> : null}

      <View style={styles.searchBox}>
        <Icon name="search" size={21} color="#174589" />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={(value) => { setQuery(value); setError(''); }}
          onSubmitEditing={() => { void executeSearch(); }}
          returnKeyType="search"
          placeholder={t('search.placeNameStreetOrAddress')}
          placeholderTextColor="#94A3B8"
          style={styles.input}
          accessibilityLabel={t('search.searchOpenstreetmapPlaces')}
          testID="place-search-input"
        />
        {query ? <Pressable onPress={() => { setQuery(''); setResults([]); setError(''); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('search.clearSearch')}><Icon name="close" size={18} color={colors.muted} /></Pressable> : null}
        <Pressable onPress={() => { void executeSearch(); }} style={styles.submitSearch} accessibilityRole="button" accessibilityLabel={t('common.search')}>
          {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Icon name="search" size={19} color="#FFFFFF" />}
        </Pressable>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{results.length ? t('search.openstreetmapResults') : t('search.recentSearchesOnThisDevice')}</Text>
        <Pressable onPress={() => { setRecent([]); setResults([]); void AsyncStorage.removeItem(RECENT_KEY); }} accessibilityRole="button"><Text style={styles.action}>{t('search.clearHistory')}</Text></Pressable>
      </View>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <View style={styles.list}>
        {showResults.map((place) => {
          const saved = favoriteIds.has(place.id);
          return (
            <View key={place.id} style={styles.result}>
              <Pressable onPress={() => { void choosePlace(place); }} style={styles.resultMain} accessibilityRole="button" accessibilityLabel={t('search.chooseAsDestination', { value0: place.name })}>
                <View style={styles.resultIcon}><Icon name="pin" size={20} color={colors.forest} /></View>
                <View style={styles.resultCopy}>
                  <Text numberOfLines={1} style={styles.resultTitle}>{place.name}</Text>
                  <Text numberOfLines={2} style={styles.resultSub}>{place.description || place.category || t('search.placeSavedOnThisDevice')}</Text>
                </View>
                <Icon name="chevron-right" size={18} color="#64748B" />
              </Pressable>
              {'description' in place ? <Pressable onPress={() => toggleSaved(place)} style={styles.favorite} accessibilityRole="button" accessibilityLabel={saved ? t('search.removeFromFavorites', { value0: place.name }) : t('search.save', { value0: place.name })}><Icon name="star" size={18} color={saved ? '#F59E0B' : '#94A3B8'} /></Pressable> : null}
            </View>
          );
        })}
        {!showResults.length && !loading && !error ? <View style={styles.empty}><Icon name="search" size={20} color="#7C93B2" /><Text style={styles.emptyText}>{t('search.enterASearchAboveToFindReal')}</Text></View> : null}
      </View>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('profile.favoritesSavedOnThisDevice')}</Text></View>
      {savedPlaces.length ? (
        <View style={styles.savedRow}>{savedPlaces.map((place) => <Pressable key={place.id} onPress={() => { void choosePlace(place); }} style={styles.saved} accessibilityRole="button"><View style={styles.savedIcon}><Icon name="home" size={22} color={colors.forest} /></View><Text numberOfLines={1} style={styles.savedTitle}>{place.label}</Text><Text style={styles.savedSub}>{t('search.navigate')}</Text></Pressable>)}</View>
      ) : <View style={styles.empty}><Icon name="star" size={20} color="#7C93B2" /><Text style={styles.emptyText}>{t('search.tapTheStarBesideAResultTo')}</Text></View>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#F6FAFF', gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#102A72', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  circleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 9, elevation: 3 },
  routeCard: { position: 'relative', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: '#FFFFFF', shadowColor: '#2563EB', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  routeRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingRight: 42 },
  locationIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  currentDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.forest, borderWidth: 3, borderColor: '#BFDBFE' },
  pinSoft: { backgroundColor: '#FFF1F2' },
  routeCopy: { flex: 1, minWidth: 0, justifyContent: 'center', paddingLeft: 12 },
  routeDivider: { height: 1, marginLeft: 50, marginRight: 42, backgroundColor: '#E5EDF7' },
  changeDestination: { position: 'absolute', right: 12, top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F9FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E3ECF8' },
  label: { color: '#71839D', fontSize: 11, fontWeight: '600' },
  routeValue: { color: '#102A72', fontSize: 15, fontWeight: '900', marginTop: 3 },
  locationHint: { color: '#475569', fontSize: 10, lineHeight: 15 },
  searchBox: { minHeight: 56, borderRadius: 28, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 5, shadowColor: '#2563EB', shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  input: { flex: 1, color: '#102A72', fontFamily: 'NotoSansThai_400Regular', fontSize: 14, minHeight: 48 },
  submitSearch: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { color: '#102A72', fontSize: 16, fontWeight: '900' },
  action: { color: colors.forest, fontSize: 11, fontWeight: '700' },
  list: { gap: 9 },
  result: { minHeight: 66, padding: 8, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 7, elevation: 1 },
  resultMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 },
  resultIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  resultCopy: { flex: 1, gap: 3 },
  resultTitle: { color: '#102A72', fontSize: 13, fontWeight: '800' },
  resultSub: { color: '#64748B', fontSize: 9, lineHeight: 12 },
  favorite: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  savedRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  saved: { flex: 1, minWidth: 100, padding: 12, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  savedIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  savedTitle: { color: '#102A72', fontSize: 11, fontWeight: '800' },
  savedSub: { color: '#2563EB', fontSize: 9, marginTop: 3 },
  empty: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#EDF2F7' },
  emptyText: { flex: 1, color: '#64748B', fontSize: 10, lineHeight: 15 },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 10, borderRadius: 12, fontSize: 11, lineHeight: 16 },
});
