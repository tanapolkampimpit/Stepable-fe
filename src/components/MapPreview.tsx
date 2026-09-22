import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { OpenStreetMap, type OSMMapMarker } from './OpenStreetMap';
import type { Coordinates } from '../services/geo';

type MapPreviewProps = {
  compact?: boolean;
  navigation?: boolean;
  style?: StyleProp<ViewStyle>;
  center?: Coordinates | null;
  userLocation?: Coordinates | null;
  destination?: OSMMapMarker | null;
  markers?: OSMMapMarker[];
  route?: Coordinates[];
};

export function MapPreview({ compact = false, navigation = false, style, ...mapProps }: MapPreviewProps) {
  return (
    <OpenStreetMap
      {...mapProps}
      style={[styles.frame, compact && styles.compact, navigation && styles.navigation, style]}
    />
  );
}

const styles = StyleSheet.create({
  frame: { height: 390, borderRadius: 24 },
  compact: { height: 230, borderRadius: 20 },
  navigation: { flex: 1, borderRadius: 0 },
});
