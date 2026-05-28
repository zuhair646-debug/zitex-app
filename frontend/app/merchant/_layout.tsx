import { Stack } from 'expo-router';

export default function MerchantLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="products" />
      <Stack.Screen name="product-form" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="services" />
      <Stack.Screen name="competitions" />
      <Stack.Screen name="competition-form" />
      <Stack.Screen name="social" />
      <Stack.Screen name="banners" />
      <Stack.Screen name="customers" />
      <Stack.Screen name="bookings" />
      <Stack.Screen name="branches" />
      <Stack.Screen name="drivers" />
      <Stack.Screen name="delivery-settings" />
    </Stack>
  );
}
