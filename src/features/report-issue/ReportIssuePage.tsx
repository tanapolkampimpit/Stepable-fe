import { issueTypes, severities, issueLabel, severityLabel } from '../../i18n/reports';
import { t, useLanguage, useMessageState, message } from '../../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText as Text } from '../../components/ui/AppText';
import { Icon } from '../../components/ui/Icon';
import { issueAppearance } from '../../components/reports/reportAppearance';
import { PageHeader } from '../../components/layout/PageHeader';
import { Screen } from '../../components/layout/Screen';
import { useAppData } from '../../providers/app-data';
import { distanceMeters, reverseGeocodeOsm, type Coordinates } from '../../services/geo';
import { submitReport as apiSubmitReport, uploadReportPhoto, resolveReportPhotoUrl, thaiToCategory, thaiToSeverity } from '../../services/api';
import { colors } from '../../theme';

export default function ReportIssuePage() {
  useLanguage();
  const { width } = useWindowDimensions();
  const compactIssueCards = width < 600;
  const { lat, lon, image } = useLocalSearchParams<{ lat?: string; lon?: string; image?: string }>();
  const { location, placeLabel, locationMessage, isLocating, refreshLocation, addReport, refreshReports } = useAppData();
  const [issue, setIssue] = useState<(typeof issueTypes)[number]>(issueTypes[0]);
  const [severity, setSeverity] = useState<(typeof severities)[number]>('medium');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useMessageState('');
  const [busy, setBusy] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(typeof image === 'string' ? image : null);
  const [coordinateOverride, setCoordinateOverride] = useState<Coordinates | null>(null);
  const [placeResult, setPlaceResult] = useState<{ coordinates: Coordinates; label: string } | null>(null);
  const lastGeocode = useRef<Coordinates | null>(null);

  const routeCoordinates = useMemo(() => {
    const latitude = Number(lat);
    const longitude = Number(lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && lat && lon
      ? { latitude, longitude }
      : null;
  }, [lat, lon]);
  const coordinates = coordinateOverride ?? routeCoordinates ?? location;

  useEffect(() => {
    if (!coordinates) {
      lastGeocode.current = null;
      return;
    }
    if (lastGeocode.current && distanceMeters(lastGeocode.current, coordinates) < 200) return;
    let active = true;
    lastGeocode.current = coordinates;
    void reverseGeocodeOsm(coordinates).then((place) => {
      if (active) setPlaceResult({ coordinates, label: place ?? '' });
    }).catch(() => {
      if (active) setPlaceResult({ coordinates, label: '' });
    });
    return () => { active = false; };
  }, [coordinates]);

  const updateLocation = async () => {
    setNotice('');
    const fresh = await refreshLocation();
    if (fresh) {
      setCoordinateOverride(fresh);
    } else {
      setNotice(locationMessage || t('reportissue.couldNotReadGpsEnableLocationAnd'));
    }
  };

  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 });
      if (!result.canceled && result.assets[0]?.uri) {
        setImageUri(result.assets[0].uri);
        setNotice('');
      }
    } catch {
      setNotice(message('reportissue.couldNotOpenThePhotoLibraryTry'));
    }
  };

  const submitReport = async () => {
    if (!coordinates) {
      setNotice(message('reportissue.enableGpsAndObtainYourLocationBefore'));
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      let uploadedPhotoUrl: string | null = null;
      if (imageUri) {
        setNotice('กำลังอัปโหลดรูปภาพไปยังเซิร์ฟเวอร์ StepAble…');
        try {
          const uploadRes = await uploadReportPhoto(imageUri);
          uploadedPhotoUrl = uploadRes.publicUrl;
        } catch (uploadErr) {
          console.warn('Upload photo failed, continuing without photo URL:', uploadErr);
        }
      }

      setNotice('กำลังส่งรายงานปัญหาไปยัง StepAble API…');
      let serverReportId: string | undefined;
      try {
        const created = await apiSubmitReport({
          category: thaiToCategory(issue),
          severity: thaiToSeverity(severity),
          title: issueLabel(issue),
          description: description.trim() || undefined,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          photoUrl: uploadedPhotoUrl,
        });
        serverReportId = created.id;
      } catch (apiErr) {
        console.warn('Backend submit failed, saving locally:', apiErr);
      }

      await addReport({
        ...(serverReportId ? { id: serverReportId } : {}),
        type: issue,
        severity,
        description: description.trim(),
        coordinates,
        ...(uploadedPhotoUrl || imageUri ? { imageUri: (resolveReportPhotoUrl(uploadedPhotoUrl) || imageUri) as string } : {}),
        ...(uploadedPhotoUrl && imageUri ? { localImageUri: imageUri } : {}),
        status: serverReportId ? 'submitted' : undefined,
      });

      void refreshReports();

      Alert.alert(
        'ส่งรายงานปัญหาสำเร็จ',
        serverReportId
          ? 'ข้อมูลปัญหาถูกส่งไปยัง StepAble API เรียบร้อยแล้ว ขอบคุณที่ร่วมพัฒนาทางเท้าศรีราชา'
          : 'บันทึกรายงานในอุปกรณ์เรียบร้อยแล้ว (ออฟไลน์)',
      );
      router.replace('/(tabs)/alerts');
    } catch {
      setNotice('บันทึกรายงานไม่สำเร็จ โปรดลองอีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  const geocodedPlace = coordinates && placeResult && distanceMeters(placeResult.coordinates, coordinates) < 200 ? placeResult.label : '';
  const place = geocodedPlace || (coordinates && !coordinateOverride && !routeCoordinates ? placeLabel : '');

  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button"><Icon name="back" size={19} color={colors.ink} /><Text style={styles.backText}>{t('reportissue.back')}</Text></Pressable>
      <PageHeader eyebrow={t('reportissue.helpImproveOurSidewalks')} title={t('ai.reportAnIssue')} subtitle={t('reportissue.addALocationAndAnyDetailsYou')} />
      <View style={styles.locationCard}>
        <View style={styles.locationIcon}><Icon name="pin" size={19} color={colors.forest} /></View>
        <View style={styles.locationCopy}>
          <Text numberOfLines={1} style={styles.locationTitle}>{coordinates ? (place || t('reportissue.gpsLocation')) : t('reportissue.noGpsLocationYet')}</Text>
          <Text style={styles.locationSub}>{coordinates ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}` : t('reportissue.allowLocationAccessWhileUsingTheApp')}</Text>
        </View>
        <Pressable onPress={() => { void updateLocation(); }} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel={t('reportissue.updateGpsLocation')}>
          {isLocating ? <ActivityIndicator size="small" color={colors.forest} /> : <Text style={styles.edit}>{t('reportissue.update')}</Text>}
        </Pressable>
      </View>
      {!coordinates ? <Text style={styles.gpsHint}>{locationMessage}</Text> : null}
      <View style={styles.issuePanel}>
        <Text style={styles.issueHeading}>{t('reportissue.issueType')}</Text>
        <View style={styles.options}>
          {issueTypes.map((item) => {
            const appearance = issueAppearance[item];
            const selected = issue === item;
            return (
              <Pressable
                key={item}
                onPress={() => setIssue(item)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={issueLabel(item)}
                style={({ pressed }) => [
                  styles.option,
                  { width: compactIssueCards ? '48%' : '31.8%', backgroundColor: appearance.background, borderColor: appearance.border },
                  compactIssueCards && styles.optionCompact,
                  selected && styles.optionActive,
                  pressed && styles.optionPressed,
                ]}
              >
                <Icon name={appearance.icon} size={compactIssueCards ? 29 : 38} color={appearance.color} strokeWidth={1.9} />
                <Text style={[styles.optionText, { color: appearance.color }, compactIssueCards && styles.optionTextCompact]}>{issueLabel(item)}</Text>
                {selected ? <View style={[styles.selectedCheck, { backgroundColor: appearance.color }]}><Icon name="check" size={12} color="#FFFFFF" strokeWidth={2.7} /></View> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.label}>{t('reportissue.severity')}</Text>
      <View style={styles.severityRow}>
        {severities.map((item) => (
          <Pressable key={item} onPress={() => setSeverity(item)} accessibilityRole="button" accessibilityState={{ selected: severity === item }} style={[styles.severity, severity === item && styles.severityActive]}>
            <Text style={[styles.severityText, severity === item && styles.severityTextActive]}>{severityLabel(item)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>{t('reportissue.additionalDetails')}<Text style={styles.optional}>{t('reportissue.optional')}</Text></Text>
      <TextInput value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" placeholder={t('reportissue.forExampleUnevenPavementInFrontOf')} placeholderTextColor="#94A3B8" style={styles.description} accessibilityLabel={t('reportissue.issueDetails')} />
      {imageUri ? (
        <View style={styles.photoPreviewWrap}>
          <Image source={{ uri: imageUri }} style={styles.photoPreview} resizeMode="cover" />
          <Pressable onPress={() => setImageUri(null)} style={styles.removePhoto} accessibilityRole="button" accessibilityLabel={t('reportissue.removePhoto')}>
            <Icon name="close" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}
      <Pressable onPress={() => { void choosePhoto(); }} style={styles.photoButton} accessibilityRole="button">
        <Icon name="camera" size={18} color={colors.forest} />
        <Text style={styles.photoText}>{imageUri ? t('reportissue.changePhoto') : t('reportissue.attachAPhotoFromYourLibrary')}</Text>
        <Icon name="chevron-right" size={17} color={colors.muted} />
      </Pressable>
      {notice ? <View style={styles.notice}><Icon name="warning" size={17} color={colors.amber} /><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <View style={styles.warning}><Icon name="info" size={17} color={colors.forest} /><Text style={styles.warningText}>ข้อมูลรายงานจะถูกส่งไปยัง StepAble API เพื่อการตรวจสอบและปรับปรุงทางเท้าในพื้นที่</Text></View>
      <Pressable onPress={() => { void submitReport(); }} disabled={busy || !coordinates} style={[styles.submit, (!coordinates || busy) && styles.submitDisabled]} accessibilityRole="button" accessibilityState={{ disabled: busy || !coordinates }}>
        {busy ? <ActivityIndicator color={colors.paper} /> : <Text style={styles.submitText}>ส่งรายงานปัญหา</Text>}
        {!busy ? <Icon name="arrow-right" size={18} color={colors.paper} /> : null}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colors.paper, borderRadius: 18, borderWidth: 1, borderColor: colors.line, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  locationIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  locationCopy: { flex: 1, gap: 3, minWidth: 0 }, locationTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, locationSub: { color: colors.muted, fontSize: 9 },
  refreshButton: { minWidth: 55, minHeight: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.mint }, edit: { color: colors.forest, fontSize: 10, fontWeight: '800' }, gpsHint: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: -8 },
  issuePanel: { padding: 12, gap: 12, borderRadius: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: '#ECF0F6', shadowColor: '#173153', shadowOpacity: 0.04, shadowRadius: 12, elevation: 1 },
  issueHeading: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  option: { minHeight: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: 1.5, position: 'relative' },
  optionCompact: { minHeight: 82, flexDirection: 'column', justifyContent: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 15 },
  optionActive: { borderWidth: 2, shadowColor: '#1D4ED8', shadowOpacity: 0.14, shadowRadius: 8, elevation: 2 },
  optionPressed: { opacity: 0.76 },
  optionText: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  optionTextCompact: { textAlign: 'center', fontSize: 11, lineHeight: 14 },
  selectedCheck: { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  severityRow: { flexDirection: 'row', gap: 8 }, severity: { flex: 1, minHeight: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, severityActive: { backgroundColor: colors.amberSoft, borderColor: '#E8C997' }, severityText: { color: colors.muted, fontSize: 11, fontWeight: '600' }, severityTextActive: { color: colors.amber },
  optional: { color: colors.muted, fontWeight: '400', fontSize: 10 }, description: { minHeight: 100, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, color: colors.ink, fontFamily: 'NotoSansThai_400Regular', fontSize: 12 },
  photoPreviewWrap: { height: 155, borderRadius: 14, overflow: 'hidden', position: 'relative' }, photoPreview: { width: '100%', height: '100%' }, removePhoto: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(15,23,42,0.72)', alignItems: 'center', justifyContent: 'center' },
  photoButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: colors.paper }, photoText: { flex: 1, color: colors.forest, fontSize: 11, fontWeight: '700' },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 11, backgroundColor: colors.mint, padding: 10 }, warningText: { flex: 1, color: '#334E7D', fontSize: 10, lineHeight: 15 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10 }, noticeText: { color: '#77552E', flex: 1, fontSize: 10, lineHeight: 15 },
  submit: { minHeight: 48, borderRadius: 14, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, submitDisabled: { backgroundColor: '#94A3B8' }, submitText: { color: colors.paper, fontSize: 13, fontWeight: '700' },
});
