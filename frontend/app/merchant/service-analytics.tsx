import { useLocalSearchParams } from 'expo-router';
import ProductAnalyticsScreen from './product-analytics';

// Service analytics — same UI, different endpoint (routed inside product-analytics via query param)
export default function ServiceAnalyticsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  return <ProductAnalyticsScreen kind="service" id={String(params.id || '')} />;
}
