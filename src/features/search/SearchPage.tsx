import { errorMessage, t, useLanguage, useMessageState, message } from '../../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText as Text } from '../../components/ui/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon, type IconName } from '../../components/ui/Icon';
import { Screen } from '../../components/layout/Screen';
import { useAppData, type SavedPlace } from '../../providers/app-data';
import { searchOsmPlaces, distanceMeters, type MapPlace, type Coordinates } from '../../services/geo';
import { fetchPlaces, fetchPlaceCategories, type PlaceCategoryRead } from '../../services/api';
import { colors } from '../../theme';

const RECENT_KEY = '@stepable/recent-searches';

export type SuggestionItem = {
  id: string;
  title: string;
  subtitle?: string;
  type: 'history' | 'place';
  icon?: IconName;
  badge?: string;
  place?: MapPlace;
};

function mapCategoryIcon(backendIcon?: string): IconName {
  switch (backendIcon) {
    case 'shopping-bag':
      return 'briefcase';
    case 'cross':
      return 'shield';
    case 'trees':
      return 'park';
    case 'graduation-cap':
      return 'graduation';
    case 'bus':
      return 'navigation';
    case 'utensils':
      return 'restaurant';
    case 'bed':
      return 'bed';
    case 'fuel':
      return 'fuel';
    default:
      return 'pin';
  }
}

async function fetchPhotonSuggestions(cleanQuery: string, refPoint: Coordinates): Promise<SuggestionItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const params = new URLSearchParams({
      q: cleanQuery,
      limit: '4',
      lat: String(refPoint.latitude),
      lon: String(refPoint.longitude),
    });
    const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/geo+json, application/json' },
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: {
          osm_type?: string;
          osm_id?: number;
          name?: string;
          street?: string;
          city?: string;
          district?: string;
          state?: string;
          type?: string;
        };
      }[];
    };
    const features = data?.features || [];
    return features.flatMap((f) => {
      const props = f?.properties;
      const coords = f?.geometry?.coordinates;
      if (!props?.name || !coords || coords.length < 2) return [];
      const [lon, lat] = coords;
      const subtitle = [props.street, props.city || props.district, props.state].filter(Boolean).join(', ');
      return [{
        id: `osm-${props.osm_type || 'node'}-${props.osm_id || `${lat}-${lon}`}`,
        title: props.name,
        subtitle: subtitle || 'OpenStreetMap',
        type: 'place' as const,
        icon: 'pin' as IconName,
        place: {
          id: `osm-${props.osm_id || `${lat}-${lon}`}`,
          name: props.name,
          description: subtitle || '',
          category: props.type || 'สถานที่',
          coordinates: { latitude: lat, longitude: lon },
          distanceMeters: distanceMeters(refPoint, { latitude: lat, longitude: lon }),
        },
      }];
    });
  } catch {
    return [];
  }
}

export default function SearchPage() {
  useLanguage();
  const { query: initialQuery, voice } = useLocalSearchParams<{ query?: string; voice?: string }>();
  const { location, locationStatus, locationMessage, savedPlaces, savePlace, removeSavedPlace } = useAppData();
  const [query, setQuery] = useState(typeof initialQuery === 'string' ? initialQuery : '');
  const [results, setResults] = useState<MapPlace[]>([]);
  const [recent, setRecent] = useState<MapPlace[]>([]);
  const [categories, setCategories] = useState<PlaceCategoryRead[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useMessageState('');
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const lastInitialQuery = useRef('');
  const inputRef = useRef<TextInput>(null);

  // Load real user search history from AsyncStorage
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(RECENT_KEY).then((value) => {
      if (active && value) setRecent(JSON.parse(value) as MapPlace[]);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Load real place categories from backend API
  useEffect(() => {
    let active = true;
    void fetchPlaceCategories().then((cats) => {
      if (active && Array.isArray(cats) && cats.length > 0) {
        setCategories(cats.sort((a, b) => a.displayOrder - b.displayOrder));
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const executeSearch = useCallback(async (rawQuery = query) => {
    const cleanQuery = rawQuery.trim();
    if (!cleanQuery) {
      setError(message('search.enterAPlaceNameOrAddressBefore'));
      return;
    }
    setSelectedCategoryId(null);
    setShowSuggestions(false);
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

  // Real-time suggestions debounced fetch (Real History + Real Backend Places + Real OpenStreetMap)
  useEffect(() => {
    const trimmed = query.trim();
    const timer = setTimeout(async () => {
      if (!trimmed) {
        setSuggestions([]);
        return;
      }
      const lower = trimmed.toLowerCase();
      const refPoint: Coordinates = location || { latitude: 13.1678, longitude: 100.9312 };

      // 1. Real History matches from device
      const historyMatches: SuggestionItem[] = recent
        .filter((item) => item.name.toLowerCase().includes(lower))
        .slice(0, 2)
        .map((item) => ({
          id: `hist-${item.id}`,
          title: item.name,
          subtitle: item.description ? `${item.description} · ประวัติค้นหา` : 'ประวัติการค้นหาล่าสุด',
          type: 'history',
          icon: 'clock',
          badge: 'ประวัติ',
          place: item,
        }));

      // 2. Real Backend database places
      let backendMatches: SuggestionItem[] = [];
      try {
        const fetched = await fetchPlaces({
          query: trimmed,
          latitude: refPoint.latitude,
          longitude: refPoint.longitude,
          limit: 3,
        });

        backendMatches = fetched.map((p) => {
          const isFood = p.category?.includes('อาหาร') || p.category?.includes('ขนม');
          return {
            id: `be-${p.id}`,
            title: p.title,
            subtitle: `${p.address} · ${p.category || 'สถานที่'}`,
            type: 'place',
            icon: isFood ? 'restaurant' : 'pin',
            badge: `${p.safeScore}% ปลอดภัย`,
            place: {
              id: `backend-${p.id}`,
              name: p.title,
              description: `${p.address} · ความปลอดภัย ${p.safeScore}%`,
              category: p.category || 'สถานที่แนะนำ',
              coordinates: { latitude: p.coordinates.latitude, longitude: p.coordinates.longitude },
              distanceMeters: distanceMeters(refPoint, p.coordinates),
            },
          };
        });
      } catch {
        // Fallback gracefully
      }

      // 3. Real OpenStreetMap Photon typeahead
      const osmMatches = await fetchPhotonSuggestions(trimmed, refPoint);

      // Merge avoiding duplicate titles
      const combined: SuggestionItem[] = [];
      const seenTitles = new Set<string>();

      for (const item of [...historyMatches, ...backendMatches, ...osmMatches]) {
        const norm = item.title.toLowerCase().trim();
        if (!seenTitles.has(norm)) {
          seenTitles.add(norm);
          combined.push(item);
        }
      }

      setSuggestions(combined.slice(0, 6));
      if (combined.length > 0) {
        setShowSuggestions(true);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, recent, location]);

  const favoriteIds = useMemo(() => new Set(savedPlaces.map((place) => place.id)), [savedPlaces]);

  const choosePlace = async (place: MapPlace | SavedPlace) => {
    setShowSuggestions(false);
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

  const selectSuggestion = (item: SuggestionItem) => {
    setShowSuggestions(false);
    setQuery(item.title);
    if (item.place) {
      void choosePlace(item.place);
    } else {
      void executeSearch(item.title);
    }
  };

  const selectCategory = async (cat: PlaceCategoryRead) => {
    setSelectedCategoryId(cat.id);
    setQuery(cat.nameTh);
    setShowSuggestions(false);
    setLoading(true);
    setError('');
    try {
      const refPoint = location || { latitude: 13.1678, longitude: 100.9312 };
      const fetched = await fetchPlaces({
        category_id: cat.id,
        latitude: refPoint.latitude,
        longitude: refPoint.longitude,
        limit: 30,
      });

      if (fetched.length > 0) {
        setResults(
          fetched.map((p) => ({
            id: `backend-${p.id}`,
            name: p.title,
            description: `${p.address} · ความปลอดภัย ${p.safeScore}%`,
            category: p.category || cat.nameTh,
            coordinates: { latitude: p.coordinates.latitude, longitude: p.coordinates.longitude },
            distanceMeters: distanceMeters(refPoint, p.coordinates),
          }))
        );
      } else {
        const osmResults = await searchOsmPlaces(cat.nameTh, location ?? undefined);
        setResults(osmResults);
        if (!osmResults.length) setError(message('search.noPlacesFoundTryAnAreaStreet'));
      }
    } catch {
      const osmResults = await searchOsmPlaces(cat.nameTh, location ?? undefined);
      setResults(osmResults);
    } finally {
      setLoading(false);
    }
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
        <Pressable onPress={() => { setResults([]); setShowSuggestions(false); setSelectedCategoryId(null); }} style={styles.circleButton} accessibilityRole="button" accessibilityLabel={t('search.clearSearchResults')}><Icon name="close" size={18} color="#174589" /></Pressable>
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

      {/* Search Input Box with Autocomplete Dropdown */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
          <Icon name="search" size={21} color="#174589" />
          <TextInput
            ref={inputRef}
            value={query}
            onFocus={() => { setIsFocused(true); if (suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => { setIsFocused(false); }}
            onChangeText={(value) => { setQuery(value); setError(''); setSelectedCategoryId(null); }}
            onSubmitEditing={() => { setShowSuggestions(false); void executeSearch(); }}
            returnKeyType="search"
            placeholder={t('search.placeNameStreetOrAddress')}
            placeholderTextColor="#94A3B8"
            style={styles.input}
            accessibilityLabel={t('search.searchOpenstreetmapPlaces')}
            testID="place-search-input"
          />
          {query ? (
            <Pressable
              onPress={() => { setQuery(''); setResults([]); setSuggestions([]); setShowSuggestions(false); setSelectedCategoryId(null); setError(''); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('search.clearSearch')}
            >
              <Icon name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => { setShowSuggestions(false); void executeSearch(); }}
            style={styles.submitSearch}
            accessibilityRole="button"
            accessibilityLabel={t('common.search')}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Icon name="search" size={19} color="#FFFFFF" />}
          </Pressable>
        </View>

        {/* Autocomplete / Search Suggestions Dropdown Overlay */}
        {showSuggestions && suggestions.length > 0 ? (
          <View style={styles.suggestionDropdown}>
            <View style={styles.suggestionHeader}>
              <Icon name="sparkles" size={13} color={colors.forest} />
              <Text style={styles.suggestionHeaderText}>คำแนะนำจากสถานที่จริง & ประวัติค้นหา</Text>
            </View>
            {suggestions.map((item, idx) => (
              <Pressable
                key={`${item.type}-${item.id || idx}`}
                onPress={() => selectSuggestion(item)}
                style={({ pressed }) => [
                  styles.suggestionItem,
                  pressed && styles.suggestionItemPressed,
                  idx === suggestions.length - 1 && styles.suggestionItemLast,
                ]}
                accessibilityRole="button"
              >
                <View style={[styles.suggestionIcon, item.type === 'history' ? styles.historyIcon : styles.searchIcon]}>
                  <Icon name={item.icon || (item.type === 'history' ? 'clock' : 'pin')} size={15} color={item.type === 'history' ? '#64748B' : colors.forest} />
                </View>
                <View style={styles.suggestionCopy}>
                  <Text numberOfLines={1} style={styles.suggestionText}>{item.title}</Text>
                  {item.subtitle ? <Text numberOfLines={1} style={styles.suggestionSub}>{item.subtitle}</Text> : null}
                </View>
                {item.badge ? (
                  <View style={[styles.suggestionBadge, item.type === 'history' ? styles.historyBadge : null]}>
                    <Text style={[styles.suggestionBadgeText, item.type === 'history' ? styles.historyBadgeText : null]}>{item.badge}</Text>
                  </View>
                ) : (
                  <Icon name="arrow-right" size={14} color="#CBD5E1" />
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Real Category Filter Chips loaded dynamically from Backend */}
      {categories.length > 0 && !query && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTags}>
          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => void selectCategory(cat)}
                style={[styles.categoryTag, isSelected && styles.categoryTagActive]}
                accessibilityRole="button"
                accessibilityLabel={cat.nameTh}
              >
                <Icon
                  name={mapCategoryIcon(cat.icon)}
                  size={14}
                  color={isSelected ? '#FFFFFF' : cat.color || colors.forest}
                />
                <Text style={[styles.categoryTagText, isSelected && styles.categoryTagTextActive]}>
                  {cat.nameTh}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>
          {results.length
            ? (location ? 'สถานที่ใกล้คุณ (เรียงตามระยะทาง)' : t('search.openstreetmapResults'))
            : t('search.recentSearchesOnThisDevice')}
        </Text>
        {recent.length > 0 && !results.length ? (
          <Pressable onPress={() => { setRecent([]); void AsyncStorage.removeItem(RECENT_KEY); }} accessibilityRole="button">
            <Text style={styles.action}>{t('search.clearHistory')}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <View style={styles.list}>
        {showResults.map((place) => {
          const saved = favoriteIds.has(place.id);
          const distanceStr = 'distanceMeters' in place && typeof place.distanceMeters === 'number'
            ? formatDistance(place.distanceMeters)
            : null;
          return (
            <View key={place.id} style={styles.result}>
              <Pressable onPress={() => { void choosePlace(place); }} style={styles.resultMain} accessibilityRole="button" accessibilityLabel={t('search.chooseAsDestination', { value0: place.name })}>
                <View style={styles.resultIcon}><Icon name="pin" size={20} color={colors.forest} /></View>
                <View style={styles.resultCopy}>
                  <View style={styles.resultTitleRow}>
                    <Text numberOfLines={1} style={styles.resultTitle}>{place.name}</Text>
                    {distanceStr ? (
                      <View style={styles.distanceBadge}>
                        <Icon name="navigation" size={10} color={colors.forest} />
                        <Text style={styles.distanceBadgeText}>{distanceStr}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text numberOfLines={2} style={styles.resultSub}>{place.description || place.category || t('search.placeSavedOnThisDevice')}</Text>
                </View>
                <Icon name="chevron-right" size={18} color="#64748B" />
              </Pressable>
              {'description' in place ? <Pressable onPress={() => toggleSaved(place)} style={styles.favorite} accessibilityRole="button" accessibilityLabel={saved ? t('search.removeFromFavorites', { value0: place.name }) : t('search.save', { value0: place.name })}><Icon name="star" size={18} color={saved ? '#F59E0B' : '#94A3B8'} /></Pressable> : null}
            </View>
          );
        })}
        {!showResults.length && !loading && !error ? (
          <View style={styles.empty}>
            <Icon name="search" size={20} color="#7C93B2" />
            <Text style={styles.emptyText}>ยังไม่มีประวัติการค้นหา พิมพ์ชื่อสถานที่ หรือแตะหมวดหมู่ด้านบนเพื่อค้นหาสถานที่จริง</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('profile.favoritesSavedOnThisDevice')}</Text></View>
      {savedPlaces.length ? (
        <View style={styles.savedRow}>{savedPlaces.map((place) => <Pressable key={place.id} onPress={() => { void choosePlace(place); }} style={styles.saved} accessibilityRole="button"><View style={styles.savedIcon}><Icon name="home" size={22} color={colors.forest} /></View><Text numberOfLines={1} style={styles.savedTitle}>{place.label}</Text><Text style={styles.savedSub}>{t('search.navigate')}</Text></Pressable>)}</View>
      ) : <View style={styles.empty}><Icon name="star" size={20} color="#7C93B2" /><Text style={styles.emptyText}>{t('search.tapTheStarBesideAResultTo')}</Text></View>}
    </Screen>
  );
}

function formatDistance(meters?: number) {
  if (meters === undefined || !Number.isFinite(meters)) return null;
  return meters < 1000 ? `${Math.round(meters)} ม.` : `${(meters / 1000).toFixed(1)} กม.`;
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
  searchContainer: { position: 'relative', zIndex: 100 },
  searchBox: { minHeight: 56, borderRadius: 28, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 5, shadowColor: '#2563EB', shadowOpacity: 0.07, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#EDF2F7' },
  searchBoxFocused: { borderColor: colors.forest, shadowOpacity: 0.14 },
  input: { flex: 1, color: '#102A72', fontFamily: 'NotoSansThai_400Regular', fontSize: 14, minHeight: 48 },
  submitSearch: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  suggestionDropdown: { position: 'absolute', top: 62, left: 0, right: 0, backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 8, shadowColor: '#102A72', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6, borderWidth: 1, borderColor: '#E2E8F0', zIndex: 999 },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  suggestionHeaderText: { color: '#64748B', fontSize: 10, fontWeight: '700' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  suggestionItemPressed: { backgroundColor: '#F0F7FF' },
  suggestionItemLast: { borderBottomWidth: 0 },
  suggestionIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  searchIcon: { backgroundColor: '#EAF2FF' },
  historyIcon: { backgroundColor: '#F1F5F9' },
  suggestionCopy: { flex: 1, gap: 2, minWidth: 0 },
  suggestionText: { color: '#102A72', fontSize: 13, fontWeight: '700' },
  suggestionSub: { color: '#64748B', fontSize: 9 },
  suggestionBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: '#EAF2FF' },
  suggestionBadgeText: { color: colors.forest, fontSize: 8, fontWeight: '700' },
  historyBadge: { backgroundColor: '#F1F5F9' },
  historyBadgeText: { color: '#64748B' },
  categoryTags: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  categoryTag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 5, elevation: 1 },
  categoryTagActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  categoryTagText: { color: '#102A72', fontSize: 12, fontWeight: '700' },
  categoryTagTextActive: { color: '#FFFFFF' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { color: '#102A72', fontSize: 16, fontWeight: '900' },
  action: { color: colors.forest, fontSize: 11, fontWeight: '700' },
  list: { gap: 9 },
  result: { minHeight: 66, padding: 8, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 7, elevation: 1 },
  resultMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 },
  resultIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  resultCopy: { flex: 1, gap: 3 },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  resultTitle: { color: '#102A72', fontSize: 13, fontWeight: '800', flex: 1 },
  distanceBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EAF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  distanceBadgeText: { color: colors.forest, fontSize: 9, fontWeight: '700' },
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
