import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText as Text } from './AppText';
import type { Coordinates } from '../services/geo';

export type OSMMapMarker = { id: string; label: string; coordinates: Coordinates; color?: string };
export type OpenStreetMapHandle = { zoomIn: () => void; zoomOut: () => void; centerOn: (coordinates: Coordinates) => void };
type OpenStreetMapProps = {
  style?: StyleProp<ViewStyle>;
  center?: Coordinates | null;
  userLocation?: Coordinates | null;
  destination?: OSMMapMarker | null;
  markers?: OSMMapMarker[];
  route?: Coordinates[];
  onMapPress?: (coordinates: Coordinates) => void;
};
type MapMessage = { source?: string; type?: string; latitude?: number; longitude?: number };

const iframeStyle: CSSProperties = { width: '100%', height: '100%', border: 0, display: 'block', background: '#E8EEF2' };

export const OpenStreetMap = forwardRef<OpenStreetMapHandle, OpenStreetMapProps>(function OpenStreetMap(
  { style, center, userLocation, destination, markers = [], route, onMapPress },
  forwardedRef,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const lastFitKey = useRef('');

  const send = useCallback((message: object) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'stepable-parent', ...message }, '*');
  }, []);
  const centerOn = useCallback((coordinates: Coordinates) => {
    send({ type: 'center', latitude: coordinates.latitude, longitude: coordinates.longitude, zoom: 17 });
  }, [send]);

  useImperativeHandle(forwardedRef, () => ({
    zoomIn: () => send({ type: 'zoom', step: 1 }),
    zoomOut: () => send({ type: 'zoom', step: -1 }),
    centerOn,
  }), [centerOn, send]);

  const fitKey = useMemo(() => destination || route?.length
    ? `${destination?.id ?? ''}|${destination?.coordinates.latitude ?? ''}|${destination?.coordinates.longitude ?? ''}|${route?.map((point) => `${point.latitude},${point.longitude}`).join(';') ?? ''}`
    : '', [destination, route]);
  const shouldFit = Boolean(fitKey && fitKey !== lastFitKey.current);
  const mapData = useMemo(() => ({ user: userLocation, destination, markers, route: route ?? null, fit: shouldFit }), [destination, markers, route, shouldFit, userLocation]);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data as MapMessage;
      if (message.source !== 'stepable-map') return;
      if (message.type === 'ready') { setReady(true); setError(false); }
      if (message.type === 'error') setError(true);
      if (message.type === 'mapPress' && typeof message.latitude === 'number' && typeof message.longitude === 'number') {
        onMapPress?.({ latitude: message.latitude, longitude: message.longitude });
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onMapPress, revision]);

  useEffect(() => {
    if (!ready) return;
    send({ type: 'setData', data: mapData });
    if (shouldFit) lastFitKey.current = fitKey;
  }, [fitKey, mapData, ready, send, shouldFit]);

  useEffect(() => {
    if (ready && center) centerOn(center);
  }, [center, centerOn, ready]);

  const reload = () => {
    setReady(false);
    setError(false);
    setRevision((value) => value + 1);
  };

  return (
    <View style={[styles.container, style]}>
      {createElement('iframe', {
        key: revision,
        ref: iframeRef,
        srcDoc: createMapDocument(),
        title: 'แผนที่ OpenStreetMap แบบโต้ตอบ',
        style: iframeStyle,
        sandbox: 'allow-scripts allow-same-origin',
        allow: 'geolocation',
        onLoad: () => setError(false),
      })}
      {!ready && !error ? <View pointerEvents="none" style={styles.loading}><Text style={styles.loadingText}>กำลังโหลด OpenStreetMap…</Text></View> : null}
      {error ? <View style={styles.networkNotice}><Text style={styles.networkText}>โหลดแผนที่ไม่สำเร็จ · ตรวจอินเทอร์เน็ต</Text><Pressable onPress={reload} accessibilityRole="button"><Text style={styles.retryText}>ลองอีกครั้ง</Text></Pressable></View> : null}
    </View>
  );
});

function createMapDocument() {
  return `<!doctype html>
<html lang="th"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    html,body,#map{height:100%;width:100%;margin:0;background:#e8eef2;font-family:'Noto Sans Thai',sans-serif}
    .leaflet-container{background:#e8eef2;outline:none}.leaflet-control-attribution{font-size:10px!important;background:rgba(255,255,255,.9)!important;padding:2px 5px!important}
    .stepable-pin{width:22px;height:22px;border:4px solid #fff;border-radius:50%;background:#2563eb;box-shadow:0 2px 9px #0f172a66}
    .stepable-destination{width:21px;height:21px;border:4px solid #fff;border-radius:50% 50% 50% 2px;background:#ef4444;transform:rotate(-45deg);box-shadow:0 2px 9px #0f172a55}
    .map-error{position:absolute;z-index:1000;left:12px;right:12px;top:42%;padding:12px;border-radius:12px;background:#fff;color:#334155;text-align:center;box-shadow:0 2px 10px #0f172a22}
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</head><body><div id="map"></div><script>
  (function(){
    const send=(message)=>window.parent.postMessage({source:'stepable-map',...message},'*');
    if(!window.L){document.body.insertAdjacentHTML('beforeend','<div class="map-error">โหลดเครื่องมือแผนที่ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่</div>');send({type:'error'});return;}
    const map=L.map('map',{zoomControl:false,preferCanvas:true,zoomSnap:.5,minZoom:3,maxZoom:19}).setView([0,0],3);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,updateWhenIdle:true,updateWhenZooming:false,keepBuffer:1,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}).addTo(map);
    let userMarker=null,destinationMarker=null,routeLine=null,otherMarkers=[];
    const userIcon=L.divIcon({className:'',html:'<div class="stepable-pin"></div>',iconSize:[22,22],iconAnchor:[11,11]});
    const destinationIcon=L.divIcon({className:'',html:'<div class="stepable-destination"></div>',iconSize:[29,29],iconAnchor:[14,22]});
    const safePopup=(text)=>{const node=document.createElement('span');node.textContent=String(text||'');return node;};
    const setData=(data)=>{
      if(data.user){if(!userMarker)userMarker=L.marker([data.user.latitude,data.user.longitude],{icon:userIcon,zIndexOffset:900}).addTo(map);else userMarker.setLatLng([data.user.latitude,data.user.longitude]);}
      if(data.destination){if(destinationMarker)map.removeLayer(destinationMarker);destinationMarker=L.marker([data.destination.coordinates.latitude,data.destination.coordinates.longitude],{icon:destinationIcon,zIndexOffset:700}).addTo(map);destinationMarker.bindPopup(safePopup(data.destination.label));}else if(destinationMarker){map.removeLayer(destinationMarker);destinationMarker=null;}
      otherMarkers.forEach((marker)=>map.removeLayer(marker));otherMarkers=[];(data.markers||[]).forEach((point)=>{const marker=L.circleMarker([point.coordinates.latitude,point.coordinates.longitude],{radius:8,color:'#fff',weight:3,fillColor:point.color||'#f97316',fillOpacity:1}).addTo(map);marker.bindPopup(safePopup(point.label));otherMarkers.push(marker);});
      if(data.route){if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(data.route.map((point)=>[point.latitude,point.longitude]),{color:'#2563eb',weight:6,opacity:.92,lineCap:'round',lineJoin:'round'}).addTo(map);}else if(routeLine){map.removeLayer(routeLine);routeLine=null;}
      if(data.fit){const points=[];if(data.user)points.push([data.user.latitude,data.user.longitude]);if(data.destination)points.push([data.destination.coordinates.latitude,data.destination.coordinates.longitude]);if(routeLine)points.push(...routeLine.getLatLngs());if(points.length>1)map.fitBounds(L.latLngBounds(points).pad(.2),{maxZoom:17});}
    };
    window.addEventListener('message',(event)=>{const message=event.data;if(!message||message.source!=='stepable-parent')return;if(message.type==='setData')setData(message.data||{});if(message.type==='center')map.setView([message.latitude,message.longitude],message.zoom||17,{animate:true});if(message.type==='zoom')map.setZoom(Math.max(3,Math.min(19,map.getZoom()+message.step)));});
    map.on('click',(event)=>send({type:'mapPress',latitude:event.latlng.lat,longitude:event.latlng.lng}));
    tiles.on('tileerror',()=>send({type:'error'}));
    setTimeout(()=>map.invalidateSize(),0);send({type:'ready'});
  })();
</script></body></html>`;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#E8EEF2', position: 'relative' },
  loading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EEF2' },
  loadingText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  networkNotice: { position: 'absolute', left: 10, right: 10, bottom: 26, borderRadius: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  networkText: { flex: 1, textAlign: 'center', color: '#475569', fontSize: 10 },
  retryText: { color: '#2563EB', fontSize: 10, fontWeight: '800', padding: 3 },
});
