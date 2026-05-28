import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function ChamberScreen() {
  const router = useRouter();
  const { apiCall, user, logout } = useAuth();
  const [comps, setComps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedComp, setSelectedComp] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<any>(null);

  const loadComps = async () => {
    try {
      const d = await apiCall('/api/chamber/competitions');
      // Filter to only competitions assigned to this chamber employee (or all if not specified)
      const myComps = d.filter((c: any) => !c.chamber_supervised || c.assigned_chamber_employee_id === user?.id);
      setComps(myComps);
    }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadComps(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadComps(); setRefreshing(false); }, []);

  const openComp = async (compId: string) => {
    try {
      const full = await apiCall(`/api/chamber/competitions/${compId}/full`);
      setSelectedComp(full);
      setShowDetail(true);
      setDrawResult(null);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const performDraw = async () => {
    if (!selectedComp) return;
    Alert.alert('Confirm Draw', `Are you sure you want to perform draw #${(selectedComp.draw_history?.length || 0) + 1} for "${selectedComp.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Draw Now', onPress: async () => {
        setDrawing(true);
        try {
          const result = await apiCall(`/api/chamber/competitions/${selectedComp.id}/draw`, { method: 'POST' });
          setDrawResult(result);
          const updated = await apiCall(`/api/chamber/competitions/${selectedComp.id}/full`);
          setSelectedComp(updated);
          loadComps();
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setDrawing(false); }
      }}
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } }
    ]);
  };

  const decideApproval = (compId: string, title: string, decision: 'approve' | 'reject') => {
    Alert.alert(decision === 'approve' ? 'Approve Competition' : 'Reject Competition', `Competition: "${title}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: decision === 'approve' ? 'Approve' : 'Reject', style: decision === 'reject' ? 'destructive' : 'default', onPress: async () => {
        try {
          await apiCall(`/api/chamber/competitions/${compId}/decision`, {
            method: 'POST',
            body: JSON.stringify({ decision, note: decision === 'reject' ? 'Rejected by chamber' : 'Approved by chamber' }),
          });
          loadComps();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const statusLabel = (s: string) => s === 'open' ? 'Active' : s === 'ended' ? 'Ended' : 'Coming Soon';
  const statusColor = (s: string) => s === 'open' ? '#10B981' : s === 'ended' ? '#6B7280' : '#3B82F6';

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color="#1E3A5F" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerLogo}><Ionicons name="shield-checkmark" size={24} color="#FFF" /></View>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>Chamber of Commerce</Text>
          <Text style={s.headerSub}>Competition Control Room</Text>
        </View>
        <TouchableOpacity testID="chamber-logout" onPress={handleLogout} style={s.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <View style={s.statsRow}>
        <View style={s.statCard}><Text style={s.statNum}>{comps.length}</Text><Text style={s.statLabel}>Total</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>{comps.filter(c => c.status === 'open').length}</Text><Text style={s.statLabel}>Active</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>{comps.filter(c => c.status === 'ended').length}</Text><Text style={s.statLabel}>Ended</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>{comps.reduce((a: number, c: any) => a + (c.total_participants || 0), 0)}</Text><Text style={s.statLabel}>Entries</Text></View>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E3A5F" />}
        showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
        <Text style={s.sectionTitle}>My Assigned Competitions</Text>
        {comps.map((c: any) => (
          <TouchableOpacity testID={`chamber-comp-${c.id}`} key={c.id} style={s.compCard} onPress={() => openComp(c.id)}>
            <View style={s.compHeader}>
              <View style={[s.statusPill, { backgroundColor: statusColor(c.status) + '20' }]}>
                <View style={[s.statusDot, { backgroundColor: statusColor(c.status) }]} />
                <Text style={[s.statusText, { color: statusColor(c.status) }]}>{statusLabel(c.status)}</Text>
              </View>
              <Text style={s.drawCount}>{c.draw_history?.length || 0} draws</Text>
            </View>
            <Text style={s.compTitle}>{c.title}</Text>
            <View style={s.compMeta}>
              <View style={s.metaItem}><Ionicons name="people" size={14} color="#52525B" /><Text style={s.metaText}>{c.total_participants || c.joined_count} participants</Text></View>
              <View style={s.metaItem}><Ionicons name="trophy" size={14} color="#F59E0B" /><Text style={s.metaText}>{c.prize_count} prizes</Text></View>
            </View>
            {c.winners?.length > 0 && (
              <View style={s.winnersPreview}>
                <Text style={s.winnersLabel}>Winners: </Text>
                <Text style={s.winnersNames}>{c.winners.map((w: any) => w.user_name).join(', ')}</Text>
              </View>
            )}
            <View style={s.viewMore}><Text style={s.viewMoreText}>View Details & Draw</Text><Ionicons name="chevron-forward" size={16} color="#1E3A5F" /></View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Competition Detail Modal */}
      <Modal visible={showDetail} animationType="slide">
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity testID="close-detail" onPress={() => setShowDetail(false)} style={s.closeBtn}>
              <Ionicons name="close" size={24} color="#0A0A0A" />
            </TouchableOpacity>
            <Text style={s.modalTitle}>{selectedComp?.title}</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            <View style={[s.detailStatus, { backgroundColor: statusColor(selectedComp?.status || '') + '15' }]}>
              <Text style={[s.detailStatusText, { color: statusColor(selectedComp?.status || '') }]}>{statusLabel(selectedComp?.status || '')}</Text>
            </View>

            <View style={s.detailGrid}>
              <View style={s.detailItem}><Text style={s.detailLabel}>Prize</Text><Text style={s.detailVal}>{selectedComp?.prize}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>Prizes Count</Text><Text style={s.detailVal}>{selectedComp?.prize_count}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>Start Date</Text><Text style={s.detailVal}>{selectedComp?.start_date}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>Draw Date</Text><Text style={s.detailVal}>{selectedComp?.draw_date}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>Max Participants</Text><Text style={s.detailVal}>{selectedComp?.max_participants}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>Joined</Text><Text style={s.detailVal}>{selectedComp?.participants?.length || 0}</Text></View>
            </View>

            {/* Draw Button */}
            <TouchableOpacity testID="chamber-draw-btn" style={s.drawBtn} onPress={performDraw} disabled={drawing}>
              {drawing ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="dice" size={24} color="#FFF" /><Text style={s.drawBtnText}>Perform Draw #{(selectedComp?.draw_history?.length || 0) + 1}</Text></>
              )}
            </TouchableOpacity>

            {/* Draw Result */}
            {drawResult && (
              <View style={s.resultCard}>
                <Ionicons name="trophy" size={28} color="#F59E0B" />
                <Text style={s.resultTitle}>Draw #{drawResult.draw_number} Winners</Text>
                <Text style={s.resultBy}>Drawn by: {drawResult.drawn_by}</Text>
                {drawResult.winners?.map((w: any, i: number) => (
                  <View key={i} style={s.resultWinner}>
                    <View style={s.resultRank}><Text style={s.rankNum}>#{i + 1}</Text></View>
                    <Text style={s.resultName}>{w.user_name}</Text>
                    <Text style={s.resultPhone}>{w.user_phone}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Draw History */}
            {selectedComp?.draw_history?.length > 0 && (
              <View style={s.historySection}>
                <Text style={s.histTitle}>Draw History</Text>
                {selectedComp.draw_history.map((dh: any, i: number) => (
                  <View key={i} style={s.histCard}>
                    <View style={s.histHeader}>
                      <Text style={s.histNum}>Draw #{dh.draw_number}</Text>
                      <Text style={s.histDate}>{dh.drawn_at?.split('T')[0]}</Text>
                    </View>
                    <Text style={s.histBy}>By: {dh.drawn_by} ({dh.drawn_by_role || 'system'})</Text>
                    {dh.winners?.map((w: any, j: number) => (
                      <Text key={j} style={s.histWinner}>#{j + 1} {w.user_name} - {w.user_phone}</Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Participants */}
            <View style={s.participantsSection}>
              <Text style={s.histTitle}>All Participants ({selectedComp?.participants?.length || 0})</Text>
              {selectedComp?.participants?.map((p: any, i: number) => (
                <View key={i} style={s.participantRow}>
                  <Text style={s.pNum}>{i + 1}</Text>
                  <View style={s.pAvatar}><Text style={s.pAvatarText}>{p.user_name?.[0]}</Text></View>
                  <View style={s.pInfo}>
                    <Text style={s.pName}>{p.user_name}</Text>
                    <Text style={s.pPhone}>{p.user_phone}</Text>
                  </View>
                  <Text style={s.pDate}>{p.joined_at?.split('T')[0]}</Text>
                  {selectedComp?.winners?.some((w: any) => w.user_name === p.user_name) && (
                    <View style={s.winBadge}><Ionicons name="trophy" size={12} color="#F59E0B" /></View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#1E3A5F' },
  headerLogo: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#2D5F8B', alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  headerSub: { fontSize: 12, color: '#94A3B8' },
  logoutBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#1E3A5F' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1E3A5F', marginBottom: 12 },
  compCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  drawCount: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  compTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  compMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#52525B' },
  winnersPreview: { flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: 8, padding: 8, marginBottom: 8 },
  winnersLabel: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  winnersNames: { fontSize: 12, color: '#92400E', flex: 1 },
  viewMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  viewMoreText: { fontSize: 13, fontWeight: '600', color: '#1E3A5F' },
  modalSafe: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  modalContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  detailStatus: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginBottom: 16 },
  detailStatusText: { fontSize: 14, fontWeight: '600' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  detailItem: { width: '48%', backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  detailLabel: { fontSize: 11, color: '#64748B', marginBottom: 4 },
  detailVal: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  drawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1E3A5F', borderRadius: 14, paddingVertical: 18, marginBottom: 16 },
  drawBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  resultCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center', borderWidth: 2, borderColor: '#F59E0B' },
  resultTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 8, marginBottom: 4 },
  resultBy: { fontSize: 12, color: '#64748B', marginBottom: 16 },
  resultWinner: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  resultRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  rankNum: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  resultName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  resultPhone: { fontSize: 13, color: '#64748B' },
  historySection: { marginBottom: 20 },
  histTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  histCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  histNum: { fontSize: 14, fontWeight: '700', color: '#1E3A5F' },
  histDate: { fontSize: 12, color: '#64748B' },
  histBy: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  histWinner: { fontSize: 13, color: '#0F172A', paddingVertical: 2 },
  participantsSection: { marginBottom: 20 },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pNum: { width: 24, fontSize: 12, color: '#64748B', fontWeight: '500' },
  pAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginEnd: 10 },
  pAvatarText: { fontSize: 14, fontWeight: '700', color: '#1E3A5F' },
  pInfo: { flex: 1 },
  pName: { fontSize: 14, fontWeight: '500', color: '#0F172A' },
  pPhone: { fontSize: 12, color: '#64748B' },
  pDate: { fontSize: 11, color: '#94A3B8' },
  winBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginStart: 8 },
});
