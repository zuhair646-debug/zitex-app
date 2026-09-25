import { useLocalSearchParams } from 'expo-router';
import ProductAnalyticsScreen from './product-analytics';

export default function CompetitionAnalyticsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  return <ProductAnalyticsScreen kind="competition" id={String(params.id || '')} />;
}
