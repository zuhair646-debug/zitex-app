import { useLocalSearchParams } from 'expo-router';
import ProductAnalyticsScreen from './product-analytics';

export default function PostAnalyticsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  return <ProductAnalyticsScreen kind="post" id={String(params.id || '')} />;
}
