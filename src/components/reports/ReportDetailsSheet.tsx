import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLocale, t, useLanguage } from '../../i18n';
import { issueLabel, severityLabel } from '../../i18n/reports';
import type { LocalReport } from '../../providers/app-data';
import { resolveReportPhotoUrl, statusToThai } from '../../services/api';
import { Icon } from '../ui/Icon';
import { AppText as Text } from '../ui/AppText';
import { reportMarkerIconFor } from '../maps/reportMarker';
import { issueAppearance } from './reportAppearance';

type Props = {
  report: LocalReport | null;
  onClose: () => void;
  onRoute: (report: LocalReport) => void;
};

export function ReportDetailsSheet({ report, onClose, onRoute }: Props) {
  return report ? <ReportDetailsContent key={report.id} report={report} onClose={onClose} onRoute={onRoute} /> : null;
}

function ReportDetailsContent({ report, onClose, onRoute }: { report: LocalReport; onClose: () => void; onRoute: (report: LocalReport) => void }) {
  useLanguage();
  const [displayUri, setDisplayUri] = useState<string | null>(resolveReportPhotoUrl(report.imageUri) ?? report.localImageUri ?? null);
  const [imageFailed, setImageFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const onImageError = () => {
    if (displayUri !== report?.localImageUri && report?.localImageUri) {
      setDisplayUri(report.localImageUri);
    } else {
      setImageFailed(true);
    }
  };

  const createdAt = report && Number.isFinite(new Date(report.createdAt).getTime())
    ? new Date(report.createdAt).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <Modal transparent visible animationType="slide" onRequestClose={expanded ? () => setExpanded(false) : onClose}>
      {expanded && displayUri && !imageFailed ? (
        <SafeAreaView style={styles.expanded} edges={['top', 'bottom']} accessibilityViewIsModal>
          <Pressable onPress={() => setExpanded(false)} style={styles.expandedClose} accessibilityRole="button" accessibilityLabel={t('reportdetail.backToDetails')}>
            <Icon name="back" size={22} color="#FFFFFF" />
            <Text style={styles.expandedCloseText}>{t('reportdetail.backToDetails')}</Text>
          </Pressable>
          <Image source={{ uri: displayUri }} style={styles.expandedImage} resizeMode="contain" onError={onImageError} accessibilityLabel={t('reportdetail.photo')} />
        </SafeAreaView>
      ) : (
        <View style={styles.modal}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('reportdetail.close')} />
          <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.handle} />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.heading}>
                <View style={[styles.reportIcon, { backgroundColor: issueAppearance[report.type].background }]}><Icon name={reportMarkerIconFor(report.type)} size={24} color={issueAppearance[report.type].color} /></View>
                <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t('reportdetail.close')}>
                  <Icon name="close" size={20} color="#36516E" />
                </Pressable>
              </View>
              <Text style={styles.title} accessibilityRole="header">{report ? issueLabel(report.type) : ''}</Text>
              {report ? <Text style={styles.severity}>{t('reportissue.severity')}: {severityLabel(report.severity)}</Text> : null}
              {report?.status ? <Text style={styles.status}>{statusToThai(report.status)}</Text> : null}
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>{t('reportdetail.photo')}</Text>
              {displayUri && !imageFailed ? (
                <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" accessibilityLabel={t('reportdetail.viewPhoto')} style={styles.photoButton}>
                  <Image source={{ uri: displayUri }} style={styles.photo} resizeMode="contain" onError={onImageError} />
                  <Text style={styles.photoHint}>{t('reportdetail.viewPhoto')}</Text>
                </Pressable>
              ) : <Text style={styles.emptyPhoto}>{imageFailed ? t('reportdetail.photoUnavailable') : t('reportdetail.noPhoto')}</Text>}
              {report?.description ? <Detail label={t('reportdetail.description')} value={report.description} /> : null}
              {report ? <Detail label={t('reportdetail.coordinates')} value={`${report.coordinates.latitude.toFixed(5)}, ${report.coordinates.longitude.toFixed(5)}`} /> : null}
              {createdAt ? <Detail label={t('reportdetail.reportedAt')} value={createdAt} /> : null}
            </ScrollView>
            {report ? <Pressable onPress={() => onRoute(report)} style={styles.routeButton} accessibilityRole="button" accessibilityLabel={t('place.showRoute')}>
              <Icon name="route" size={20} color="#FFFFFF" />
              <Text style={styles.routeText}>{t('place.showRoute')}</Text>
            </Pressable> : null}
          </SafeAreaView>
        </View>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue} selectable>{value}</Text></View>;
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,31,53,0.42)' },
  sheet: { maxHeight: '82%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 10, shadowColor: '#0F172A', shadowOpacity: 0.15, shadowRadius: 18, elevation: 12 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 14 },
  content: { paddingBottom: 20 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  title: { marginTop: 12, color: '#172B43', fontSize: 22, fontWeight: '800' },
  severity: { marginTop: 5, color: '#526985', fontSize: 14, fontWeight: '600' },
  status: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#F1F5F9', color: '#475569', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, fontSize: 12 },
  divider: { height: 1, backgroundColor: '#E4EAF1', marginVertical: 18 },
  sectionTitle: { color: '#334E7D', fontSize: 13, fontWeight: '800', marginBottom: 9 },
  photoButton: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#F1F5F9', marginBottom: 18 },
  photo: { width: '100%', height: 210 },
  photoHint: { color: '#174589', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 9 },
  emptyPhoto: { color: '#64748B', fontSize: 13, paddingVertical: 14, marginBottom: 10 },
  detail: { marginBottom: 16 },
  detailLabel: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  detailValue: { color: '#243B55', fontSize: 14, lineHeight: 21, marginTop: 4 },
  routeButton: { minHeight: 52, borderRadius: 14, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 10 },
  routeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  expanded: { flex: 1, backgroundColor: '#0D1522' },
  expandedClose: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 18 },
  expandedCloseText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  expandedImage: { flex: 1, width: '100%' },
});
