import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/ui/AppText';
import { Icon, type IconName } from '../../components/ui/Icon';
import { MapPreview } from '../../components/maps/MapPreview';
import { Screen } from '../../components/layout/Screen';
import { useAppData, type LocalReport } from '../../providers/app-data';
import { distanceMeters } from '../../services/geo';
import { colors } from '../../theme';
import { router } from 'expo-router';

const ALL = 'ทั้งหมด';

export default function AlertsPage() {
  const { reports, location } = useAppData();
  const [active, setActive] = useState(ALL);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const categories = useMemo(() => [ALL, ...Array.from(new Set(reports.map((report) => report.type)))], [reports]);
  const visibleReports = useMemo(() => active === ALL ? reports : reports.filter((report) => report.type === active), [active, reports]);
  const markers = useMemo(() => reports.map((report) => ({
    id: report.id,
    label: `${report.type} · ${report.severity}`,
    coordinates: report.coordinates,
    color: report.severity === 'สูง' ? '#DC2626' : report.severity === 'ปานกลาง' ? '#F97316' : '#2563EB',
  })), [reports]);

  const openReportRoute = (report: LocalReport) => router.push({
    pathname: '/(tabs)/routes',
    params: { destination: report.type, lat: String(report.coordinates.latitude), lon: String(report.coordinates.longitude) },
  });

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.title}>แจ้งเตือนความปลอดภัย</Text>
        <Pressable onPress={() => setFiltersVisible((value) => !value)} style={styles.filterIcon} accessibilityRole="button" accessibilityLabel={filtersVisible ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง'} accessibilityState={{ expanded: filtersVisible }}>
          <Icon name="sliders" size={21} color={colors.forest} />
        </Pressable>
      </View>
      {filtersVisible ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {categories.map((item) => <Pressable key={item} onPress={() => setActive(item)} style={[styles.filter, active === item && styles.filterActive]} accessibilityRole="button" accessibilityState={{ selected: active === item }}><Text style={[styles.filterText, active === item && styles.filterTextActive]}>{item}</Text></Pressable>)}
      </ScrollView> : null}
      <View style={styles.sourceNote}><Icon name="info" size={14} color={colors.forest} /><Text style={styles.sourceText}>รายงานที่บันทึกในอุปกรณ์นี้ · ไม่มีข้อมูลรายงานสาธารณะจากเซิร์ฟเวอร์</Text></View>
      <MapPreview compact center={location} userLocation={location} markers={markers} />
      {visibleReports.length ? <View style={styles.list}>{visibleReports.map((report) => {
        const tone = report.severity === 'สูง' ? 'red' : report.severity === 'ปานกลาง' ? 'orange' : 'blue';
        const icon: IconName = report.type.includes('แสง') || report.type.includes('มืด') ? 'sun' : report.type.includes('ทางเท้า') ? 'route' : 'warning';
        const distance = location ? formatDistance(distanceMeters(location, report.coordinates)) : 'GPS ไม่พร้อม';
        return <Pressable key={report.id} onPress={() => openReportRoute(report)} style={styles.card} accessibilityRole="button" accessibilityLabel={`${report.type}, ${distance}. แตะเพื่อดูเส้นทาง`}>
          <View style={[styles.alertIcon, styles[tone]]}><Icon name={icon} size={24} color={iconColors[tone]} /></View>
          <View style={styles.cardCopy}>
            <Text numberOfLines={1} style={styles.cardTitle}>{report.type}</Text>
            <Text numberOfLines={1} style={styles.place}>{report.description || `${report.coordinates.latitude.toFixed(4)}, ${report.coordinates.longitude.toFixed(4)}`}</Text>
            <View style={[styles.badge, styles[`${tone}Badge`]]}><Text style={[styles.badgeText, { color: iconColors[tone] }]}>{report.severity === 'สูง' ? 'เสี่ยงสูง' : `ความรุนแรง${report.severity}`}</Text></View>
          </View>
          <View style={styles.meta}><Text style={styles.metaText}>{distance}</Text><Text style={styles.metaText}>{formatAge(report.createdAt)}</Text><Icon name="chevron-right" size={18} color="#174589" /></View>
        </Pressable>;
      })}</View> : <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}><Icon name="bell" size={25} color={colors.forest} /></View>
        <Text style={styles.emptyTitle}>{reports.length ? 'ไม่มีรายงานในหมวดนี้' : 'ยังไม่มีรายงานในอุปกรณ์นี้'}</Text>
        <Text style={styles.emptyText}>{reports.length ? 'เลือก “ทั้งหมด” หรือหมวดอื่นเพื่อดูรายงาน' : 'รายงานปัญหาพร้อมพิกัด GPS เพื่อดูรายการและหมุดบนแผนที่ได้ที่นี่'}</Text>
        <Pressable onPress={() => router.push('/report-issue')} style={styles.reportButton} accessibilityRole="button"><Icon name="flag" size={17} color="#FFFFFF" /><Text style={styles.reportButtonText}>รายงานปัญหา</Text></Pressable>
      </View>}
    </Screen>
  );
}

function formatDistance(meters: number) {
  return meters < 1_000 ? `${Math.round(meters)} เมตร` : `${(meters / 1_000).toFixed(1)} กม.`;
}

function formatAge(createdAt: string) {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime());
  if (!Number.isFinite(elapsed)) return 'เวลาไม่พร้อม';
  if (elapsed < 60_000) return 'เมื่อสักครู่';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} นาทีที่แล้ว`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(elapsed / 86_400_000)} วันที่แล้ว`;
}

const iconColors = { red: '#DC2626', orange: '#F97316', blue: '#2563EB' };
const styles = StyleSheet.create({
  content: { backgroundColor: '#F6FAFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerSpacer: { width: 42 }, title: { color: '#102A72', fontSize: 20, fontWeight: '800' }, filterIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 8, paddingRight: 4 }, filter: { minHeight: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 }, filterActive: { backgroundColor: colors.forest }, filterText: { color: '#334E7D', fontSize: 10, fontWeight: '700' }, filterTextActive: { color: '#FFFFFF' },
  sourceNote: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 }, sourceText: { flex: 1, color: '#64748B', fontSize: 9, lineHeight: 13 },
  list: { gap: 10 }, card: { minHeight: 92, borderRadius: 19, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 9, elevation: 2 }, alertIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' }, red: { backgroundColor: '#FEE2E2' }, orange: { backgroundColor: '#FFEDD5' }, blue: { backgroundColor: '#DBEAFE' }, cardCopy: { flex: 1, gap: 3, minWidth: 0 }, cardTitle: { color: '#102A72', fontSize: 13, fontWeight: '800' }, place: { color: '#64748B', fontSize: 9 }, badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 2 }, redBadge: { backgroundColor: '#FEE2E2' }, orangeBadge: { backgroundColor: '#FFEDD5' }, blueBadge: { backgroundColor: '#DBEAFE' }, badgeText: { fontSize: 8, fontWeight: '800' }, meta: { alignItems: 'flex-end', gap: 4 }, metaText: { color: '#64748B', fontSize: 8 },
  emptyCard: { alignItems: 'center', padding: 20, borderRadius: 20, backgroundColor: '#FFFFFF', gap: 8 }, emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: '#102A72', fontSize: 14, fontWeight: '800', textAlign: 'center' }, emptyText: { color: '#64748B', fontSize: 10, lineHeight: 15, textAlign: 'center' }, reportButton: { minHeight: 42, marginTop: 2, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, reportButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
