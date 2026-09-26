/**
 * MediaCarousel — Instagram-style swipeable media viewer for social posts
 * Supports mixed image + video items with:
 *  - 4:5 portrait aspect (design_guidelines.json)
 *  - Paged horizontal FlatList
 *  - Dot indicators (max 5 visible, condensed for >5)
 *  - Video: auto-plays muted on active slide, tap to unmute
 *  - Video badge (top-right) to distinguish from images
 *  - Tap image → open full-screen viewer (native Modal)
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Image, FlatList, TouchableOpacity, Text, StyleSheet, Modal, Dimensions,
  ViewToken, ImageStyle, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

export type MediaItem = {
  type?: 'image' | 'video';
  url: string;
  thumbnail?: string;
  duration?: string;
  title?: string;
};

interface Props {
  items: MediaItem[] | string[];  // accepts string[] for legacy image lists
  borderRadius?: number;
  aspectRatio?: number;  // width/height ratio; default 4/5 = 0.8
  showBadge?: boolean;
}

const { width: SCREEN_W } = Dimensions.get('window');

// Normalize legacy string[] → MediaItem[]
function normalize(items: any[]): MediaItem[] {
  return (items || []).map((it) => {
    if (typeof it === 'string') {
      const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(it) || it.includes('/video-files/');
      return { type: isVideo ? 'video' : 'image', url: it };
    }
    if (typeof it === 'object' && it && (it.url || it.uri)) {
      const url = it.url || it.uri;
      const explicitType = it.type;
      const isVideo = explicitType === 'video' || /\.(mp4|mov|m4v|webm)$/i.test(url) || (url || '').includes('/video-files/');
      return { type: isVideo ? 'video' : 'image', url, thumbnail: it.thumbnail, duration: it.duration, title: it.title };
    }
    return null;
  }).filter(Boolean) as MediaItem[];
}

export default function MediaCarousel({ items, borderRadius = 14, aspectRatio = 4 / 5, showBadge = true }: Props) {
  const data = useMemo(() => normalize(items as any), [items]);
  const [active, setActive] = useState(0);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const containerWidthRef = useRef<number>(SCREEN_W - 24);
  const [w, setW] = useState<number>(SCREEN_W - 24);

  const onViewableChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems && viewableItems.length > 0 && viewableItems[0].index != null) {
      setActive(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => {
    const height = w / aspectRatio;
    if (item.type === 'video') {
      return <CarouselVideo item={item} active={active === index} width={w} height={height} borderRadius={borderRadius} onOpen={() => setPreviewIdx(index)} />;
    }
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewIdx(index)}>
        <Image source={{ uri: item.url }} style={{ width: w, height, borderRadius } as ImageStyle} resizeMode="cover" />
      </TouchableOpacity>
    );
  }, [w, aspectRatio, borderRadius, active]);

  if (data.length === 0) return null;

  // Single item — no carousel logic
  if (data.length === 1) {
    return (
      <View onLayout={e => setW(e.nativeEvent.layout.width)} style={styles.wrap}>
        {renderItem({ item: data[0], index: 0 })}
      </View>
    );
  }

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={styles.wrap}>
      <FlatList
        data={data}
        keyExtractor={(_, i) => `media-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        onViewableItemsChanged={onViewableChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: w, offset: w * index, index })}
      />
      {/* Counter chip (top-right) */}
      {showBadge && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>{active + 1} / {data.length}</Text>
          {data[active]?.type === 'video' && (
            <Ionicons name="videocam" size={11} color="#fff" style={{ marginLeft: 4 }} />
          )}
        </View>
      )}
      {/* Dots */}
      <View style={styles.dots}>
        {data.slice(0, Math.min(data.length, 8)).map((it, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              active === i && styles.dotActive,
              it.type === 'video' && styles.dotVideo,
            ]}
          />
        ))}
        {data.length > 8 && <Text style={styles.moreDots}>+{data.length - 8}</Text>}
      </View>
      {/* Full-screen preview */}
      <Modal visible={previewIdx !== null} transparent animationType="fade" onRequestClose={() => setPreviewIdx(null)}>
        <View style={styles.previewBg}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewIdx(null)}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {previewIdx !== null && data[previewIdx] && (
            data[previewIdx].type === 'video' ? (
              <CarouselVideo item={data[previewIdx]} active width={SCREEN_W} height={SCREEN_W * 1.25} borderRadius={0} fullscreen onOpen={() => {}} />
            ) : (
              <Image source={{ uri: data[previewIdx].url }} style={{ width: SCREEN_W, height: SCREEN_W * 1.25 }} resizeMode="contain" />
            )
          )}
        </View>
      </Modal>
    </View>
  );
}

function CarouselVideo({ item, active, width, height, borderRadius, onOpen, fullscreen }: any) {
  const player = useVideoPlayer(item.url, (p) => {
    p.loop = true;
    p.muted = true;
    p.volume = 1.0;
  });
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(true);

  React.useEffect(() => {
    if (fullscreen) {
      // Fullscreen — unmute + play from start
      try { player.muted = false; setMuted(false); player.currentTime = 0; player.play(); setIsPlaying(true); } catch {}
    } else if (active) {
      try { player.muted = true; setMuted(true); player.play(); setIsPlaying(true); } catch {}
    } else {
      try { player.pause(); setIsPlaying(false); } catch {}
    }
    return () => { try { player.pause(); } catch {} };
  }, [active, player, fullscreen]);

  const handleTap = () => {
    if (fullscreen) return;
    // Toggle mute on tap. Long-press or expand icon opens fullscreen.
    try {
      if (!isPlaying) { player.play(); setIsPlaying(true); }
      const newMuted = !muted;
      player.muted = newMuted;
      setMuted(newMuted);
    } catch {}
  };

  return (
    <View style={{ width, height, borderRadius, overflow: 'hidden', backgroundColor: '#000' }}>
      <TouchableOpacity activeOpacity={0.95} onPress={handleTap} style={{ width, height }}>
        <VideoView
          style={{ width, height }}
          player={player}
          contentFit="cover"
          nativeControls={!!fullscreen}
        />
        {!fullscreen && (
          <>
            <View style={styles.videoBadge}>
              <Ionicons name="videocam" size={12} color="#fff" />
            </View>
            {!!item.duration && (
              <View style={styles.durBadge}>
                <Text style={styles.durText}>{item.duration}</Text>
              </View>
            )}
            {/* Mute / unmute chip */}
            <TouchableOpacity onPress={handleTap} style={styles.muteChip} hitSlop={{ top: 12, left: 12, right: 12, bottom: 12 }}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
            </TouchableOpacity>
            {/* Expand to fullscreen */}
            <TouchableOpacity onPress={onOpen} style={styles.expandChip} hitSlop={{ top: 12, left: 12, right: 12, bottom: 12 }}>
              <Ionicons name="expand" size={16} color="#fff" />
            </TouchableOpacity>
            {!isPlaying && (
              <View pointerEvents="none" style={styles.playOverlay}>
                <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.9)" />
              </View>
            )}
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', width: '100%', overflow: 'hidden' },
  counter: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  counterText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  dots: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { width: 10, backgroundColor: '#fff' },
  dotVideo: { backgroundColor: 'rgba(212,175,55,0.7)' },
  moreDots: { color: '#fff', fontSize: 10, fontWeight: '700', marginLeft: 4 },
  videoBadge: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', padding: 5, borderRadius: 999,
  },
  durBadge: {
    position: 'absolute', bottom: 30, right: 10,
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  durText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  playOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  muteChip: {
    position: 'absolute', bottom: 32, left: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  expandChip: {
    position: 'absolute', top: 42, left: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewBg: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  previewClose: {
    position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
});
