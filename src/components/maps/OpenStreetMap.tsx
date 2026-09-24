import { t, getLanguage, useLanguage } from '../../i18n';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText as Text } from '../ui/AppText';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Coordinates } from '../../services/geo';

export type OSMMapMarker = { id: string; label: string; coordinates: Coordinates; color?: string };
export type OpenStreetMapHandle = { zoomIn: () => void; zoomOut: () => void; centerOn: (coordinates: Coordinates) => void };
type MapMessage = { type?: string; latitude?: number; longitude?: number };
type OpenStreetMapProps = {
  style?: StyleProp<ViewStyle>;
  center?: Coordinates | null;
  userLocation?: Coordinates | null;
  destination?: OSMMapMarker | null;
  markers?: OSMMapMarker[];
  route?: Coordinates[];
  onMapPress?: (coordinates: Coordinates) => void;
};

const MAP_TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const MAP_ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION?.trim() || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

const createMapDocument = () => `<!doctype html>
<html lang="${getLanguage()}">
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    html,body,#map{height:100%;width:100%;margin:0;background:#e8eef2;font-family:'Noto Sans Thai',sans-serif}
    .leaflet-container{background:#e8eef2;outline:none}
    .leaflet-control-attribution{font-size:10px!important;background:rgba(255,255,255,.9)!important;padding:2px 5px!important}
    .stepable-pin{width:22px;height:22px;border:4px solid #fff;border-radius:50%;background:#2563eb;box-shadow:0 2px 9px #0f172a66}
    .stepable-destination{width:21px;height:21px;border:4px solid #fff;border-radius:50% 50% 50% 2px;background:#ef4444;transform:rotate(-45deg);box-shadow:0 2px 9px #0f172a55}
    .map-error{position:absolute;z-index:1000;left:12px;right:12px;top:42%;padding:12px;border-radius:12px;background:#fff;color:#334155;text-align:center;box-shadow:0 2px 10px #0f172a22}
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      const send=(message)=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(message));
      if(!window.L){document.body.insertAdjacentHTML('beforeend','<div class="map-error">${t('map.loadFailed')}</div>');send({type:'error'});return;}
      const map=L.map('map',{zoomControl:false,preferCanvas:true,zoomSnap:0.5,minZoom:3,maxZoom:19}).setView([0,0],3);
      L.tileLayer('${MAP_TILE_URL}',{maxZoom:19,updateWhenIdle:true,updateWhenZooming:false,keepBuffer:1,attribution:'${MAP_ATTRIBUTION}'}).addTo(map);
      let userMarker=null,destinationMarker=null,routeLine=null,otherMarkers=[];
      const userIcon=L.divIcon({className:'',html:'<div class="stepable-pin"></div>',iconSize:[22,22],iconAnchor:[11,11]});
      const destinationIcon=L.divIcon({className:'',html:'<div class="stepable-destination"></div>',iconSize:[29,29],iconAnchor:[14,22]});
      const safePopup=(text)=>{const node=document.createElement('span');node.textContent=String(text||'');return node;};
      window.StepAbleMap={
        zoom:(step)=>map.setZoom(Math.max(3,Math.min(19,map.getZoom()+step))),
        center:(lat,lon,zoom)=>map.setView([lat,lon],zoom||17,{animate:true}),
        setData:(data)=>{
          if(data.user){if(!userMarker)userMarker=L.marker([data.user.latitude,data.user.longitude],{icon:userIcon,zIndexOffset:900}).addTo(map);else userMarker.setLatLng([data.user.latitude,data.user.longitude]);}
          if(data.destination){if(destinationMarker)map.removeLayer(destinationMarker);destinationMarker=L.marker([data.destination.coordinates.latitude,data.destination.coordinates.longitude],{icon:destinationIcon,zIndexOffset:700}).addTo(map);destinationMarker.bindPopup(safePopup(data.destination.label));}
          else if(destinationMarker){map.removeLayer(destinationMarker);destinationMarker=null;}
          if(data.markers){otherMarkers.forEach((marker)=>map.removeLayer(marker));otherMarkers=[];data.markers.forEach((point)=>{const marker=L.circleMarker([point.coordinates.latitude,point.coordinates.longitude],{radius:8,color:'#fff',weight:3,fillColor:point.color||'#f97316',fillOpacity:1}).addTo(map);marker.bindPopup(safePopup(point.label));otherMarkers.push(marker);});}
          if(data.route){if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(data.route.map((point)=>[point.latitude,point.longitude]),{color:'#2563eb',weight:6,opacity:.92,lineCap:'round',lineJoin:'round'}).addTo(map);}
          if(data.route===null&&routeLine){map.removeLayer(routeLine);routeLine=null;}
          if(data.fit){const points=[];if(data.user)points.push([data.user.latitude,data.user.longitude]);if(data.destination)points.push([data.destination.coordinates.latitude,data.destination.coordinates.longitude]);if(routeLine)points.push(...routeLine.getLatLngs());if(points.length>1)map.fitBounds(L.latLngBounds(points).pad(.2),{maxZoom:17});}
        }
      };
      map.on('click',(event)=>send({type:'mapPress',latitude:event.latlng.lat,longitude:event.latlng.lng}));
      send({type:'ready'});
    })();
  </script>
</body>
</html>`;

export const OpenStreetMap = forwardRef<OpenStreetMapHandle, OpenStreetMapProps>(function OpenStreetMap(
  { style, center, userLocation, destination, markers = [], route, onMapPress },
  forwardedRef,
) {
  const { language } = useLanguage();
  const webView = useRef<WebView>(null);
  const [readyLanguage, setReady] = useState<string | null>(null);
  const ready = readyLanguage === language;
  const [error, setError] = useState(false);
  const centerApplied = useRef('');
  const lastFitKey = useRef('');
  const inject = useCallback((source: string) => webView.current?.injectJavaScript(`${source};true;`), []);
  const centerOn = useCallback((coordinates: Coordinates) => inject(`window.StepAbleMap&&window.StepAbleMap.center(${coordinates.latitude},${coordinates.longitude},17)`), [inject]);

  useImperativeHandle(forwardedRef, () => ({
    zoomIn: () => inject('window.StepAbleMap&&window.StepAbleMap.zoom(1)'),
    zoomOut: () => inject('window.StepAbleMap&&window.StepAbleMap.zoom(-1)'),
    centerOn,
  }), [centerOn, inject]);

  const fitKey = useMemo(() => destination || route?.length
    ? `${language}|${destination?.id ?? ''}|${destination?.coordinates.latitude ?? ''}|${destination?.coordinates.longitude ?? ''}|${route?.map((point) => `${point.latitude},${point.longitude}`).join(';') ?? ''}`
    : '', [destination, route, language]);
  const shouldFit = Boolean(fitKey && fitKey !== lastFitKey.current);
  const mapData = useMemo(() => JSON.stringify({ user: userLocation, destination, markers, route: route ?? null, fit: shouldFit }), [userLocation, destination, markers, route, shouldFit]);
  useEffect(() => {
    if (!ready) return;
    inject(`window.StepAbleMap&&window.StepAbleMap.setData(${mapData})`);
    if (shouldFit) lastFitKey.current = fitKey;
  }, [fitKey, inject, mapData, ready, shouldFit]);

  useEffect(() => {
    if (!ready || centerApplied.current === language || !center) return;
    centerOn(center);
    centerApplied.current = language;
  }, [center, centerOn, ready, language]);

  const onMessage = (event: WebViewMessageEvent) => {
    let message: MapMessage;
    try { message = JSON.parse(event.nativeEvent.data) as MapMessage; }
    catch { return; }
    if (message.type === 'ready') { setReady(language); setError(false); }
    if (message.type === 'error') setError(true);
    if (message.type === 'mapPress' && typeof message.latitude === 'number' && typeof message.longitude === 'number') {
      onMapPress?.({ latitude: message.latitude, longitude: message.longitude });
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, styles.webUnavailable, style]}>
        <Text style={styles.webTitle}>{t('common.openOpenstreetmap')}</Text>
        <Text style={styles.webCopy}>{t('common.theInteractiveMapUsesWebviewOnIos')}</Text>
        <Text accessibilityRole="link" onPress={() => { void import('react-native').then(({ Linking }) => Linking.openURL('https://www.openstreetmap.org/')); }} style={styles.link}>{t('common.viewOnOpenstreetmapOrg')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webView}
        source={{ html: createMapDocument() }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        mixedContentMode="never"
        userAgent="StepAble/1.0 (OpenStreetMap-powered accessible walking app)"
        onMessage={onMessage}
        onHttpError={() => setError(true)}
        onError={() => setError(true)}
        style={styles.webView}
        accessibilityLabel={t('common.openstreetmapDragToPanAndPinchTo')}
      />
      {error ? <View style={styles.networkNotice}><Text style={styles.networkText}>{t('common.couldNotLoadTheMapCheckYour')}</Text><Pressable onPress={() => webView.current?.reload()} accessibilityRole="button"><Text style={styles.retryText}>{t('common.tryAgain')}</Text></Pressable></View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#E8EEF2' },
  webView: { backgroundColor: 'transparent' },
  webUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8 },
  webTitle: { color: '#102A72', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  webCopy: { color: '#475569', fontSize: 12, textAlign: 'center' },
  link: { color: '#2563EB', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  networkNotice: { position: 'absolute', left: 10, right: 10, bottom: 26, borderRadius: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.94)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  networkText: { textAlign: 'center', color: '#475569', fontSize: 10 },
  retryText: { color: '#2563EB', fontSize: 10, fontWeight: '800', padding: 3 },
});
