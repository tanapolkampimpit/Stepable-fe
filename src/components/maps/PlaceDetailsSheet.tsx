import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t, useLanguage } from '../../i18n';
import { distanceMeters, type Coordinates } from '../../services/geo';
import { Icon } from '../ui/Icon';
import { AppText as Text } from '../ui/AppText';
import type { OSMMapMarker } from './OpenStreetMap';

type Props = {
  place: OSMMapMarker | null;
  userLocation: Coordinates | null;
  onClose: () => void;
  onRoute: (place: OSMMapMarker) => void;
};

const categoryKeys = {
  wheelchair: 'place.ramp', crosswalk: 'place.crossing', park: 'place.park',
  restaurant: 'place.restaurant', coffee: 'place.cafe', bed: 'place.hotel',
  fuel: 'place.fuel', graduation: 'place.education', hospital: 'place.healthcare',
  plane: 'place.airport', bus: 'place.bus', train: 'place.train',
  shopping: 'place.shop', shield: 'place.publicService', briefcase: 'place.finance',
  star: 'place.landmark', send: 'place.publicService',
} as const;

export function PlaceDetailsSheet({ place, userLocation, onClose, onRoute }: Props) {
  useLanguage();
  const tags = place?.osmTags ?? {};
  const address = tags['addr:full'] || [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:province'], tags['addr:postcode']].filter(Boolean).join(' ');
  const phone = tags['contact:phone'] || tags.phone;
  const website = tags['contact:website'] || tags.website;
  const validWebsite = website && /^https?:\/\//i.test(website) ? website : null;
  const distance = place && userLocation ? distanceMeters(userLocation, place.coordinates) : null;

  return (
    <Modal transparent visible={Boolean(place)} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('place.close')} />
        <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.heading}>
              <View style={styles.placeIcon}><Icon name={place?.placeIcon ?? 'pin'} size={24} color="#174589" /></View>
              <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t('place.close')}>
                <Icon name="close" size={20} color="#36516E" />
              </Pressable>
            </View>
            <Text style={styles.title} accessibilityRole="header">{place?.label}</Text>
            <Text style={styles.category}>{place?.placeIcon ? t(categoryKeys[place.placeIcon]) : t('place.place')}</Text>
            {distance !== null ? <Text style={styles.distance}>{distance < 1000 ? `${Math.round(distance)} ${t('place.metersAway')}` : `${(distance / 1000).toFixed(1)} ${t('place.kilometersAway')}`}</Text> : null}
            <View style={styles.divider} />
            {address ? <DetailRow icon="pin" label={t('place.address')} value={address} /> : null}
            {tags.opening_hours ? <DetailRow icon="clock" label={t('place.openingHours')} value={tags.opening_hours} /> : null}
            {phone ? <DetailRow icon="info" label={t('place.phone')} value={phone} /> : null}
            {validWebsite ? <Pressable onPress={() => { void Linking.openURL(validWebsite); }} accessibilityRole="link"><DetailRow icon="globe" label={t('place.website')} value={validWebsite} link /></Pressable> : null}
            {!address && !tags.opening_hours && !phone && !validWebsite ? <Text style={styles.empty}>{t('place.limitedDetails')}</Text> : null}
            <Text style={styles.source}>{t('place.source')}</Text>
          </ScrollView>
          {place ? <Pressable style={styles.routeButton} onPress={() => onRoute(place)} accessibilityRole="button">
            <Icon name="route" size={20} color="#FFFFFF" />
            <Text style={styles.routeText}>{t('place.showRoute')}</Text>
          </Pressable> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function DetailRow({ icon, label, value, link = false }: { icon: 'pin' | 'clock' | 'info' | 'globe'; label: string; value: string; link?: boolean }) {
  return <View style={styles.detailRow}>
    <Icon name={icon} size={18} color="#4B6790" />
    <View style={styles.detailCopy}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, link && styles.link]} selectable>{value}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,31,53,0.4)' },
  sheet: { maxHeight: '72%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 10, shadowColor: '#0F172A', shadowOpacity: 0.15, shadowRadius: 18, elevation: 12 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 16 },
  content: { paddingBottom: 16 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF2FF' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  title: { marginTop: 14, color: '#172B43', fontSize: 23, fontWeight: '800', lineHeight: 31 },
  category: { marginTop: 3, color: '#527095', fontSize: 14, fontWeight: '600' },
  distance: { marginTop: 6, color: '#174589', fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#E4EAF1', marginVertical: 18 },
  detailRow: { flexDirection: 'row', gap: 12, paddingBottom: 18 },
  detailCopy: { flex: 1 },
  detailLabel: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  detailValue: { color: '#243B55', fontSize: 14, lineHeight: 21, marginTop: 3 },
  link: { color: '#1755A0', textDecorationLine: 'underline' },
  empty: { color: '#64748B', fontSize: 13, lineHeight: 20 },
  source: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  routeButton: { minHeight: 52, borderRadius: 14, backgroundColor: '#087E5B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 10 },
  routeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
