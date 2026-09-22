import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Alert, Linking, Modal, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Icon, type IconName } from '../../components/Icon';
import { AppText as Text } from '../../components/AppText';
import { Screen } from '../../components/Screen';
import { useAppData, type SavedPlace } from '../../components/AppDataContext';
import { colors } from '../../theme';

const PROFILE_NAME_KEY = '@stepable/profile-name';
const fontSizes: { label: string; value: 0.9 | 1 | 1.15 | 1.3 }[] = [
  { label: 'เล็ก', value: 0.9 },
  { label: 'ปกติ', value: 1 },
  { label: 'ใหญ่', value: 1.15 },
  { label: 'ใหญ่มาก', value: 1.3 },
];

export default function ProfileScreen() {
  const {
    preferences, updatePreferences, location, savedPlaces,
  } = useAppData();
  const [name, setName] = useState('ผู้ใช้ StepAble');
  const [nameDraft, setNameDraft] = useState('');
  const [editName, setEditName] = useState(false);
  const [fontDialog, setFontDialog] = useState(false);
  const [helpDialog, setHelpDialog] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(PROFILE_NAME_KEY).then((storedName) => {
      if (active && storedName) setName(storedName);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const saveName = async () => {
    const nextName = nameDraft.trim();
    if (!nextName) return;
    setName(nextName);
    setEditName(false);
    setNotice('บันทึกชื่อไว้ในอุปกรณ์นี้แล้ว');
    await AsyncStorage.setItem(PROFILE_NAME_KEY, nextName);
  };

  const openSavedPlace = (place: SavedPlace) => {
    router.push({
      pathname: '/(tabs)/routes',
      params: { destination: place.label, lat: String(place.coordinates.latitude), lon: String(place.coordinates.longitude) },
    });
  };

  const updateVibration = (value: boolean) => {
    updatePreferences({ vibration: value });
    if (value) void Haptics.selectionAsync().catch(() => undefined);
  };

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.pageTitle}>โปรไฟล์</Text>
      <View style={styles.account}>
        <View style={styles.avatar}><Icon name="user" size={35} color={colors.forest} /></View>
        <View style={styles.accountCopy}><Text numberOfLines={1} style={styles.name}>{name}</Text><Text style={styles.role}>StepAble User · บันทึกเฉพาะอุปกรณ์นี้</Text></View>
        <Pressable onPress={() => { setNameDraft(name); setEditName(true); }} style={styles.edit} accessibilityRole="button" accessibilityLabel="แก้ไขชื่อโปรไฟล์"><Icon name="edit" size={22} color={colors.forest} /></Pressable>
      </View>

      <Section title="Walking Preferences" icon="walk">
        <ToggleRow icon="shield" title="เส้นทางเดินแนะนำ" subtitle="ปิดเพื่อเน้นระยะสั้น · OSM ไม่มีคะแนนความปลอดภัยที่รับรองได้" value={preferences.safeFirst} onChange={(value) => updatePreferences({ safeFirst: value })} />
        <ToggleRow icon="route" title="หลีกเลี่ยงบันได" subtitle="เพิ่มค่าปรับให้ทางที่มีบันไดเมื่อตั้งเส้นทาง" value={preferences.avoidSteps} onChange={(value) => updatePreferences({ avoidSteps: value })} />
        <ToggleRow icon="wheelchair" title="รองรับวีลแชร์" subtitle="ปรับ route preference; ความชัน/ทางลาดใน OSM อาจไม่ครบ" value={preferences.wheelchair} onChange={(value) => updatePreferences({ wheelchair: value })} />
        <ToggleRow icon="sun" title="เตือนเมื่อใกล้รายงานปัญหา" subtitle="เตือนภายใน 100 เมตรจากรายงานในอุปกรณ์นี้" value={preferences.avoidDark} onChange={(value) => updatePreferences({ avoidDark: value })} last />
      </Section>

      <Section title="Accessibility" icon="sliders">
        <LinkRow icon="info" title="ขนาดตัวอักษร" value={fontSizes.find((item) => item.value === preferences.fontScale)?.label ?? 'ปกติ'} onPress={() => setFontDialog(true)} />
        <ToggleLinkRow icon="volume" title="เสียงนำทาง" value={preferences.voiceNavigation} onChange={(value) => updatePreferences({ voiceNavigation: value })} />
        <ToggleLinkRow icon="vibration" title="การสั่นแจ้งเตือน" value={preferences.vibration} onChange={updateVibration} last />
      </Section>

      <Section title="สถานที่โปรด · บันทึกในเครื่องนี้" icon="pin">
        {savedPlaces.length ? <View style={styles.savedRow}>{savedPlaces.map((place) => <SavedPlaceCard key={place.id} place={place} onPress={() => openSavedPlace(place)} />)}</View> : (
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.addPlace} accessibilityRole="button">
            <Icon name="plus" size={19} color={colors.forest} /><View style={styles.addPlaceCopy}><Text style={styles.savedLabel}>เพิ่มบ้าน/สถานที่โปรด</Text><Text style={styles.savedSub}>ค้นหาแล้วแตะดาวเพื่อบันทึกพิกัดจริง</Text></View><Icon name="chevron-right" size={18} color="#64748B" />
          </Pressable>
        )}
        {savedPlaces.length ? <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.addAnother} accessibilityRole="button"><Icon name="plus" size={15} color={colors.forest} /><Text style={styles.addAnotherText}>ค้นหาและเพิ่มสถานที่</Text></Pressable> : null}
      </Section>

      <View style={styles.links}>
        <LinkRow icon="globe" title="ภาษา" value="ไทย" onPress={() => Alert.alert('ภาษา', 'แอปเวอร์ชันนี้รองรับภาษาไทย')} />
        <LinkRow icon="info" title="ช่วยเหลือ" value="" onPress={() => setHelpDialog(true)} last />
      </View>
      {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
      {location ? <Text style={styles.locationNote}>ตำแหน่ง GPS พร้อมใช้งานในแอป</Text> : null}

      <Modal transparent visible={editName} animationType="fade" onRequestClose={() => setEditName(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>แก้ไขชื่อโปรไฟล์</Text>
          <TextInput value={nameDraft} onChangeText={setNameDraft} maxLength={40} placeholder="ชื่อที่ต้องการแสดง" style={styles.nameInput} accessibilityLabel="ชื่อโปรไฟล์" />
          <View style={styles.modalActions}><Pressable onPress={() => setEditName(false)} style={styles.modalSecondary} accessibilityRole="button"><Text style={styles.modalSecondaryText}>ยกเลิก</Text></Pressable><Pressable onPress={() => { void saveName(); }} style={styles.modalPrimary} accessibilityRole="button"><Text style={styles.modalPrimaryText}>บันทึก</Text></Pressable></View>
        </View></View>
      </Modal>

      <Modal transparent visible={fontDialog} animationType="fade" onRequestClose={() => setFontDialog(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>ขนาดตัวอักษร</Text>
          <Text style={styles.modalSub}>ปรับข้อความในแอปได้ทันที</Text>
          {fontSizes.map((size) => <Pressable key={size.value} onPress={() => {
            updatePreferences({ fontScale: size.value });
            setFontDialog(false);
            AccessibilityInfo.announceForAccessibility(`ขนาดตัวอักษร ${size.label}`);
          }} style={[styles.fontChoice, preferences.fontScale === size.value && styles.fontChoiceActive]} accessibilityRole="button" accessibilityState={{ selected: preferences.fontScale === size.value }}><Text style={[styles.fontChoiceLabel, { fontSize: 13 * size.value }]}>{size.label}</Text><Text style={styles.fontChoiceSample}>Aa กขค</Text>{preferences.fontScale === size.value ? <Icon name="check" size={18} color={colors.forest} /> : null}</Pressable>)}
        </View></View>
      </Modal>

      <Modal transparent visible={helpDialog} animationType="fade" onRequestClose={() => setHelpDialog(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>ช่วยเหลือ StepAble</Text>
          <Text style={styles.helpText}>• พิกัด GPS ส่งไปยังบริการสาธารณะเพื่อค้นหา/ระบุสถานที่ (Photon), คำนวณเส้นทาง (Valhalla), แผนที่ (OpenStreetMap) และอากาศ (Open-Meteo){ '\n' }• บริการสาธารณะอาจขัดข้องหรือจำกัดคำขอได้{ '\n' }• รายงานและสถานที่โปรดเก็บในเครื่องนี้ ยังไม่ส่งให้ผู้อื่นเพราะยังไม่มี backend{ '\n' }• ตรวจสอบเส้นทางจริงก่อนเดิน เนื่องจากข้อมูลทางลาด/บันไดอาจไม่ครบ</Text>
          <View style={styles.modalActions}><Pressable onPress={() => { setHelpDialog(false); void Linking.openURL('https://www.openstreetmap.org/fixthemap'); }} style={styles.modalSecondary} accessibilityRole="link"><Text style={styles.modalSecondaryText}>แจ้งแก้แผนที่</Text></Pressable><Pressable onPress={() => setHelpDialog(false)} style={styles.modalPrimary} accessibilityRole="button"><Text style={styles.modalPrimaryText}>ปิด</Text></Pressable></View>
        </View></View>
      </Modal>
    </Screen>
  );
}

function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHead}><View style={styles.sectionIcon}><Icon name={icon} size={19} color={colors.forest} /></View><Text style={styles.sectionTitle}>{title}</Text></View><View style={styles.sectionBody}>{children}</View></View>;
}

function ToggleRow({ icon, title, subtitle, value, onChange, last = false }: { icon: IconName; title: string; subtitle: string; value: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  return <View style={[styles.row, !last && styles.rowBorder]}><Icon name={icon} size={21} color={colors.forest} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSub}>{subtitle}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: '#CBD5E1', true: '#60A5FA' }} thumbColor="#FFFFFF" accessibilityLabel={title} />
  </View>;
}

function ToggleLinkRow({ icon, title, value, onChange, last = false }: { icon: IconName; title: string; value: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  return <View style={[styles.row, !last && styles.rowBorder]}><Icon name={icon} size={21} color={colors.forest} /><Text style={[styles.rowTitle, styles.linkTitle]}>{title}</Text><Text style={styles.linkValue}>{value ? 'เปิด' : 'ปิด'}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: '#CBD5E1', true: '#60A5FA' }} thumbColor="#FFFFFF" accessibilityLabel={title} /></View>;
}

function LinkRow({ icon, title, value, onPress, last = false }: { icon: IconName; title: string; value: string; onPress: () => void; last?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.row, !last && styles.rowBorder]} accessibilityRole="button"><Icon name={icon} size={21} color={colors.forest} /><Text style={[styles.rowTitle, styles.linkTitle]}>{title}</Text>{value ? <Text style={styles.linkValue}>{value}</Text> : null}<Icon name="chevron-right" size={17} color="#64748B" /></Pressable>;
}

function SavedPlaceCard({ place, onPress }: { place: SavedPlace; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.saved} accessibilityRole="button" accessibilityLabel={`คำนวณเส้นทางไป ${place.label}`}><Icon name="pin" size={23} color={colors.forest} /><Text numberOfLines={1} style={styles.savedLabel}>{place.label}</Text><Text style={styles.savedSub}>ดูเส้นทาง</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#F6FAFF' },
  pageTitle: { color: '#102A72', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  account: { minHeight: 94, borderRadius: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#CFE6FF', alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, gap: 3 }, name: { color: '#102A72', fontSize: 18, fontWeight: '800' }, role: { color: '#5572A4', fontSize: 10 },
  edit: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  section: { borderRadius: 20, backgroundColor: '#FFFFFF', padding: 10, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2, paddingBottom: 8 },
  sectionIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: '#102A72', fontSize: 14, fontWeight: '800' }, sectionBody: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, rowCopy: { flex: 1, gap: 2 }, rowTitle: { color: '#102A72', fontSize: 12, fontWeight: '700' }, rowSub: { color: '#64748B', fontSize: 8, lineHeight: 12 }, linkTitle: { flex: 1 }, linkValue: { color: '#5572A4', fontSize: 10 },
  savedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 8 },
  saved: { flex: 1, minWidth: 100, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', gap: 5 }, savedLabel: { color: '#102A72', fontSize: 11, fontWeight: '800' }, savedSub: { color: '#2563EB', fontSize: 9 },
  addPlace: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11 }, addPlaceCopy: { flex: 1, gap: 3 }, addAnother: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }, addAnotherText: { color: colors.forest, fontSize: 10, fontWeight: '700' },
  links: { borderRadius: 18, backgroundColor: '#FFFFFF', paddingHorizontal: 10, overflow: 'hidden', shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  notice: { color: '#1D4ED8', backgroundColor: '#EAF2FF', borderRadius: 12, padding: 10, fontSize: 10, lineHeight: 15 }, locationNote: { color: '#64748B', fontSize: 9, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 }, modalCard: { width: '100%', maxWidth: 440, padding: 18, borderRadius: 20, backgroundColor: '#FFFFFF', gap: 12 },
  modalTitle: { color: '#102A72', fontSize: 18, fontWeight: '800' }, modalSub: { color: '#64748B', fontSize: 11 }, nameInput: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, color: '#102A72', fontFamily: 'NotoSansThai_400Regular' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 3 }, modalSecondary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#EAF2FF' }, modalSecondaryText: { color: colors.forest, fontSize: 11, fontWeight: '700' }, modalPrimary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.forest }, modalPrimaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  fontChoice: { minHeight: 44, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }, fontChoiceActive: { borderColor: colors.forest, backgroundColor: '#EAF2FF' }, fontChoiceLabel: { flex: 1, color: '#102A72', fontWeight: '700' }, fontChoiceSample: { color: '#64748B', fontSize: 12 },
  helpText: { color: '#334155', fontSize: 11, lineHeight: 18 },
});
