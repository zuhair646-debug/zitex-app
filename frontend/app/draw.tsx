import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './_layout';

export default function DrawScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiCall, user } = useAuth();
  const [comp, setComp] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [currentName, setCurrentName] = useState('');
  const [finalWinners, setFinalWinners] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const intervalRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const c = await apiCall(`/api/chamber/competitions/${id}/full`);
      setComp(c);
      setEntries(c.entries || c.participants || []);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, [load]);

  const startDraw = async () => {
    if (entries.length === 0) { Alert.alert('No Entries', 'No participants to draw from'); return; }
    setDrawing(true); setFinalWinners([]); setCurrentName('');
    // Animate name cycling for 4 seconds
    intervalRef.current = setInterval(() => {
      const rnd = entries[Math.floor(Math.random() * entries.length)];
      setCurrentName(rnd.user_name || rnd.name || 'Participant');
    }, 80);
    // After 4s, call the real draw API for true random winner
    setTimeout(async () => {
      clearInterval(intervalRef.current);
      try {
        const result = await apiCall(`/api/chamber/competitions/${id}/draw`, { method: 'POST' });
        setFinalWinners(result.winners || []);
        if (result.winners?.length) setCurrentName(result.winners[0].user_name || 'Winner');
        load();
      } catch (e: any) { Alert.alert('Error', e.message); }
      setDrawing(false);
    }, 4000);
  };

  const uploadVideo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission', 'Media library access needed to upload video'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 0.7, videoMaxDuration: 120 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(true);
      // Get signed upload params
      const sig = await apiCall('/api/upload/signature', { method: 'POST', body: JSON.stringify({ folder: `zitex/draws/${id}`, resource_type: 'video' }) });
      // Upload directly to Cloudinary
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, type: 'video/mp4', name: 'draw.mp4' } as any);
      formData.append('signature', sig.signature);
      formData.append('timestamp', String(sig.timestamp));
      formData.append('api_key', sig.api_key);
      formData.append('folder', sig.folder);
      const uploadUrl = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/video/upload`;
      const resp = await fetch(uploadUrl, { method: 'POST', body: formData });
      const data = await resp.json();
      if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
      // Save URL on backend
      await apiCall(`/api/competitions/${id}/draw-video`, { method: 'POST', body: JSON.stringify({ video_url: data.secure_url }) });
      Alert.alert('Success', 'Draw video uploaded and saved');
      load();
    } catch (e: any) { Alert.alert('Upload Error', e.message); } finally { setUploading(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#1E3A5F" /></View>;
  if (!comp) return <View style={s.center}><Text>Not found</Text></View>;

  // Check if logged-in chamber user is the assigned supervisor
  const isAssigned = !comp.chamber_supervised || comp.assigned_chamber_employee_id === user?.id;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>{comp.title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={s.compInfo}>
          <Text style={s.prize}>{comp.prize}</Text>
          <Text style={s.meta}>{entries.length} participants • {comp.prize_count} winners</Text>
          {comp.chamber_supervised && (
            <View style={s.permitBox}>
              <Ionicons name="shield-checkmark" size={16} color="#1E3A5F" />
              <Text style={s.permitText}>Permit #{comp.permit_number}</Text>
            </View>
          )}
        </View>

        {!isAssigned && (
          <View style={s.warning}>
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <Text style={s.warningText}>You are not the assigned supervisor for this competition</Text>
          </View>
        )}

        <View style={s.drawBox}>
          <Text style={s.drawLabel}>Draw Window</Text>
          <View style={s.nameDisplay}>
            <Text style={s.nameText}>{currentName || (finalWinners.length ? finalWinners.map(w => w.user_name).join(', ') : 'Press start to draw')}</Text>
          </View>
          {finalWinners.length > 0 && (
            <View style={s.winnerBadge}><Ionicons name="trophy" size={20} color="#F59E0B" /><Text style={s.winnerText}>WINNER{finalWinners.length > 1 ? 'S' : ''} SELECTED</Text></View>
          )}
          <TouchableOpacity disabled={!isAssigned || drawing} onPress={startDraw} style={[s.startBtn, (!isAssigned || drawing) && { opacity: 0.4 }]}>
            {drawing ? <ActivityIndicator color="white" /> : <Text style={s.startBtnText}>{finalWinners.length ? 'Re-Draw' : '🎲 Start Draw'}</Text>}
          </TouchableOpacity>
        </View>

        {finalWinners.length > 0 && (
          <View style={s.uploadBox}>
            <Text style={s.uploadTitle}>Upload Draw Video</Text>
            <Text style={s.uploadHint}>Record the draw process on your phone and upload here. Customers will be able to view it to verify legitimacy.</Text>
            <TouchableOpacity disabled={uploading} onPress={uploadVideo} style={[s.uploadBtn, uploading && { opacity: 0.4 }]}>
              {uploading ? <ActivityIndicator color="white" /> : <><Ionicons name="videocam" size={18} color="white" /><Text style={s.uploadBtnText}>Pick Video from Gallery</Text></>}
            </TouchableOpacity>
            {comp.draw_video_url ? <Text style={s.videoOk}>✓ Video uploaded</Text> : null}
          </View>
        )}

        <Text style={s.entriesTitle}>Participants ({entries.length})</Text>
        {entries.slice(0, 50).map((e, i) => (
          <View key={i} style={s.entry}>
            <Text style={s.entryNum}>#{i + 1}</Text>
            <Text style={s.entryName}>{e.user_name || e.name}</Text>
            <Text style={s.entryPhone}>{e.user_phone || e.phone}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 12 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0A0A0A' },
  compInfo: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 12 },
  prize: { fontSize: 18, fontWeight: '800', color: '#8833FF' },
  meta: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  permitBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFE6FF', padding: 8, borderRadius: 8, marginTop: 8 },
  permitText: { fontSize: 12, fontWeight: '700', color: '#1E3A5F' },
  warning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10, marginBottom: 12, gap: 8 },
  warningText: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '600' },
  drawBox: { backgroundColor: '#0A0A0A', padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  drawLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },
  nameDisplay: { width: '100%', backgroundColor: '#1F2937', padding: 24, borderRadius: 12, alignItems: 'center', minHeight: 100, justifyContent: 'center' },
  nameText: { color: '#FBBF24', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  winnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: '#F59E0B', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  winnerText: { color: 'white', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  startBtn: { backgroundColor: '#10B981', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, marginTop: 16 },
  startBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
  uploadBox: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 12 },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  uploadHint: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8833FF', padding: 14, borderRadius: 10, marginTop: 12 },
  uploadBtnText: { color: 'white', fontWeight: '700' },
  videoOk: { color: '#10B981', fontWeight: '700', marginTop: 8, textAlign: 'center' },
  entriesTitle: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', marginTop: 12, marginBottom: 8 },
  entry: { flexDirection: 'row', backgroundColor: 'white', padding: 10, borderRadius: 8, marginBottom: 6, alignItems: 'center', gap: 12 },
  entryNum: { fontSize: 12, color: '#9CA3AF', width: 30 },
  entryName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0A0A0A' },
  entryPhone: { fontSize: 11, color: '#6B7280' },
});
