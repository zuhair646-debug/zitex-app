/**
 * Reusable Map component using Leaflet + OpenStreetMap (no API key required, free).
 * 3 modes: 'picker', 'tracking', 'polygon'.
 */
import { useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

type Mode = 'picker' | 'tracking' | 'polygon';

type Props = {
  mode: Mode;
  initialLat?: number;
  initialLng?: number;
  zoom?: number;
  onLocationChange?: (lat: number, lng: number) => void;
  driverLat?: number | null;
  driverLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  branchLat?: number | null;
  branchLng?: number | null;
  polygon?: [number, number][];
  onPolygonChange?: (points: [number, number][]) => void;
  height?: number;
  showZones?: { name: string; polygon?: [number, number][]; center_lat?: number; center_lng?: number; radius_km?: number; color?: string }[];
};

export default function ZitexMap(props: Props) {
  const { mode, height = 320 } = props;
  const webRef = useRef<WebView | null>(null);

  const html = useMemo(() => buildHtml(props), []);

  useEffect(() => {
    if (mode === 'tracking' && webRef.current && props.driverLat != null && props.driverLng != null) {
      const js = `if(window.updateDriver) window.updateDriver(${props.driverLat}, ${props.driverLng}); true;`;
      webRef.current.injectJavaScript(js);
    }
  }, [props.driverLat, props.driverLng, mode]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { height }]}>
        {/* eslint-disable-next-line react-native/no-inline-styles */}
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 0, borderRadius: 12 }}
          ref={(el: any) => {
            if (el && !el._listenerAttached) {
              el._listenerAttached = true;
              window.addEventListener('message', (ev: any) => {
                try {
                  const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
                  if (data?.type === 'location' && props.onLocationChange) props.onLocationChange(data.lat, data.lng);
                  if (data?.type === 'polygon' && props.onPolygonChange) props.onPolygonChange(data.points);
                } catch {}
              });
            }
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data?.type === 'location' && props.onLocationChange) props.onLocationChange(data.lat, data.lng);
            if (data?.type === 'polygon' && props.onPolygonChange) props.onPolygonChange(data.points);
          } catch {}
        }}
      />
    </View>
  );
}

function buildHtml(opts: Props) {
  const { mode, initialLat = 24.7136, initialLng = 46.6753, zoom = 13, polygon, showZones, driverLat, driverLng, destLat, destLng, branchLat, branchLng } = opts;
  const polyJson = JSON.stringify(polygon || []);
  const zonesJson = JSON.stringify(showZones || []);
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="initial-scale=1.0,width=device-width,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<style>
html,body,#map{margin:0;height:100%;width:100%;font-family:system-ui}
.banner{position:absolute;top:8px;left:8px;right:8px;background:rgba(136,51,255,0.95);color:white;padding:8px 12px;border-radius:8px;font-size:12px;z-index:1000;text-align:center;font-weight:600;}
.btn{position:absolute;bottom:24px;right:8px;background:white;border-radius:24px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:pointer;font-size:22px;z-index:1000;border:none}
.btn2{position:absolute;bottom:24px;left:8px;background:#EF4444;color:white;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;z-index:1000;border:none;font-weight:600}
.marker-icon{width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
</style>
</head><body>
<div id="map"></div>
${mode === 'picker' ? '<div class="banner">📍 اضغط على الخريطة لتحديد موقعك</div>' : ''}
${mode === 'polygon' ? '<div class="banner">🗺️ اضغط لإضافة نقاط (3+ لإغلاق المنطقة)</div><button class="btn2" onclick="clearPoly()">✕ مسح</button>' : ''}
${mode === 'picker' ? '<button class="btn" onclick="goMyLocation()">📍</button>' : ''}
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
function send(d){ try{ (window.ReactNativeWebView||window.parent).postMessage(JSON.stringify(d), '*'); }catch(e){} }

var map = L.map('map', { zoomControl: true }).setView([${initialLat}, ${initialLng}], ${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);

function makeIcon(emoji, color){
  return L.divIcon({ className:'', html:'<div class="marker-icon" style="background:'+color+'">'+emoji+'</div>', iconSize:[36,36], iconAnchor:[18,18] });
}

// Zones
var zones = ${zonesJson};
zones.forEach(function(z){
  var color = z.color || '#8833FF';
  if(z.polygon && z.polygon.length >= 3){
    L.polygon(z.polygon, { color: color, weight: 2, fillOpacity: 0.15 }).addTo(map).bindTooltip(z.name);
  } else if(z.center_lat && z.radius_km){
    L.circle([z.center_lat, z.center_lng], { radius: z.radius_km*1000, color: color, weight: 2, fillOpacity: 0.15 }).addTo(map).bindTooltip(z.name);
  }
});

var marker, drvMarker, branchMark, destMark, polyLayer, polyPoints = ${polyJson};

${mode === 'picker' ? `
  marker = L.marker([${initialLat},${initialLng}], { icon: makeIcon('📍','#8833FF'), draggable: true }).addTo(map);
  map.on('click', function(e){ marker.setLatLng(e.latlng); send({type:'location',lat:e.latlng.lat,lng:e.latlng.lng}); });
  marker.on('dragend', function(e){ var ll = e.target.getLatLng(); send({type:'location',lat:ll.lat,lng:ll.lng}); });
  window.goMyLocation = function(){
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function(p){
      marker.setLatLng([p.coords.latitude, p.coords.longitude]);
      map.setView([p.coords.latitude, p.coords.longitude], 16);
      send({type:'location',lat:p.coords.latitude,lng:p.coords.longitude});
    });
  };
` : ''}

${mode === 'tracking' ? `
  var bounds = [];
  ${destLat != null && destLng != null ? `
    destMark = L.marker([${destLat},${destLng}], { icon: makeIcon('🏠','#10B981') }).addTo(map).bindTooltip('موقعك');
    bounds.push([${destLat},${destLng}]);
  ` : ''}
  ${branchLat != null && branchLng != null ? `
    branchMark = L.marker([${branchLat},${branchLng}], { icon: makeIcon('🏪','#8833FF') }).addTo(map).bindTooltip('الفرع');
    bounds.push([${branchLat},${branchLng}]);
  ` : ''}
  ${driverLat != null && driverLng != null ? `
    drvMarker = L.marker([${driverLat},${driverLng}], { icon: makeIcon('🛵','#F59E0B') }).addTo(map).bindTooltip('السائق');
    bounds.push([${driverLat},${driverLng}]);
  ` : ''}
  if(bounds.length >= 2) map.fitBounds(bounds, { padding: [40,40] });
  window.updateDriver = function(lat,lng){
    if(!drvMarker) drvMarker = L.marker([lat,lng], { icon: makeIcon('🛵','#F59E0B') }).addTo(map).bindTooltip('السائق');
    else drvMarker.setLatLng([lat,lng]);
    map.panTo([lat,lng]);
  };
` : ''}

${mode === 'polygon' ? `
  function redrawPoly(){
    if(polyLayer) map.removeLayer(polyLayer);
    if(polyPoints.length >= 2){
      polyLayer = L.polygon(polyPoints, { color:'#EF4444', weight:3, fillOpacity:0.2 }).addTo(map);
    }
  }
  polyPoints.forEach(function(pt,i){
    L.marker(pt, { icon: L.divIcon({ className:'', html:'<div class="marker-icon" style="background:#EF4444">'+(i+1)+'</div>', iconSize:[28,28], iconAnchor:[14,14] }) }).addTo(map);
  });
  if(polyPoints.length) redrawPoly();
  map.on('click', function(e){
    polyPoints.push([e.latlng.lat, e.latlng.lng]);
    L.marker(e.latlng, { icon: L.divIcon({ className:'', html:'<div class="marker-icon" style="background:#EF4444">'+polyPoints.length+'</div>', iconSize:[28,28], iconAnchor:[14,14] }) }).addTo(map);
    redrawPoly();
    send({type:'polygon',points:polyPoints});
  });
  window.clearPoly = function(){ polyPoints = []; if(polyLayer) map.removeLayer(polyLayer); send({type:'polygon',points:[]}); setTimeout(function(){location.reload();}, 50); };
` : ''}
</script>
</body></html>`;
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  web: { flex: 1 },
});
