import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const MenuItem = ({ icon, label, onPress, color, badge }: { icon: string; label: string; onPress?: () => void; color?: string; badge?: string }) => (
    <TouchableOpacity testID={`settings-${icon}`} style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconWrap, { backgroundColor: (color || '#8833FF') + '15' }]}>
        <Ionicons name={icon as any} size={22} color={color || '#8833FF'} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <View style={styles.menuRight}>
        {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
        <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>My Account</Text>

        {/* Profile Card */}
        <TouchableOpacity testID="profile-card" style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Ionicons name="person" size={32} color="#8833FF" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profilePhone}>{user?.phone}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#A1A1AA" />
        </TouchableOpacity>

        {/* Wallet */}
        <View style={styles.walletCard}>
          <View style={styles.walletItem}>
            <Text style={styles.walletValue}>{user?.points || 0}</Text>
            <Text style={styles.walletLabel}>Points</Text>
          </View>
          <View style={styles.walletDivider} />
          <View style={styles.walletItem}>
            <Text style={styles.walletValue}>{user?.wallet_balance || 0} SAR</Text>
            <Text style={styles.walletLabel}>Balance</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuSection}>
          <MenuItem icon="cart" label="My Orders" onPress={() => router.push('/orders')} />
          <MenuItem icon="receipt" label="Invoices" onPress={() => router.push('/invoices')} />
          <MenuItem icon="heart" label="Favorites" onPress={() => router.push('/favorites')} />
          <MenuItem icon="shield-checkmark" label="Warranties" onPress={() => router.push('/warranties')} />
          <MenuItem icon="location" label="Addresses" onPress={() => router.push('/addresses')} />
          <MenuItem icon="wallet" label="Wallet" onPress={() => router.push('/wallet')} />
        </View>

        <View style={styles.menuSection}>
          <MenuItem icon="storefront" label="About Store" color="#3366FF" onPress={() => router.push('/about-store')} />
          <MenuItem icon="headset" label="Support" color="#10B981" onPress={() => router.push('/support')} />
          <MenuItem icon="notifications" label="Notification Settings" color="#F59E0B" />
          <MenuItem icon="language" label="Language" color="#9333EA" badge="English" />
        </View>

        <View style={styles.menuSection}>
          <MenuItem icon="document-text" label="Return Policy" color="#52525B" />
          <MenuItem icon="shield-checkmark" label="Terms & Conditions" color="#52525B" />
        </View>

        <TouchableOpacity testID="logout-button" style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#0A0A0A', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 16, backgroundColor: '#F9F9FB', borderRadius: 16, marginBottom: 16 },
  avatarWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginBottom: 2 },
  profilePhone: { fontSize: 14, color: '#52525B' },
  walletCard: { flexDirection: 'row', marginHorizontal: 20, padding: 20, backgroundColor: '#8833FF', borderRadius: 16, marginBottom: 20 },
  walletItem: { flex: 1, alignItems: 'center' },
  walletValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  walletLabel: { fontSize: 13, color: '#FFFFFF', opacity: 0.8 },
  walletDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  menuSection: { marginHorizontal: 20, backgroundColor: '#F9F9FB', borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#0A0A0A' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { backgroundColor: '#EFE6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: '#8833FF', fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, paddingVertical: 16, borderRadius: 14, backgroundColor: '#FEF2F2', gap: 8 },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#EF4444' },
});
