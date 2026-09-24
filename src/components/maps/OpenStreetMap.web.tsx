import { t, useLanguage } from '../../i18n';
import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText as Text } from '../ui/AppText';
import type { Coordinates, MapBounds } from '../../services/geo';
import { reportMarkerIconPathsJson, type ReportMarkerIcon } from './reportMarker';
import { placeMarkerCss, placeMarkerLayerScript, placeMarkerScript, placeMarkerVisibilityScript, type PlaceMarkerIcon } from './placeMarker';

export type OSMMapMarker = { id: string; label: string; coordinates: Coordinates; color?: string; reportIcon?: ReportMarkerIcon; placeIcon?: PlaceMarkerIcon; showLabel?: boolean; markerKind?: 'poi'; poiPriority?: number; osmTags?: Record<string, string> };
export type OpenStreetMapHandle = { zoomIn: () => void; zoomOut: () => void; centerOn: (coordinates: Coordinates) => void };
type OpenStreetMapProps = {
  style?: StyleProp<ViewStyle>;
  center?: Coordinates | null;
  userLocation?: Coordinates | null;
  destination?: OSMMapMarker | null;
  markers?: OSMMapMarker[];
  fitCoordinates?: Coordinates[];
  route?: Coordinates[];
  onMapPress?: (coordinates: Coordinates) => void;
  onMarkerPress?: (markerId: string) => void;
  onViewportChange?: (bounds: MapBounds, zoom: number) => void;
};
type MapMessage = { source?: string; type?: string; id?: string; latitude?: number; longitude?: number; zoom?: number; west?: number; south?: number; east?: number; north?: number };

const MAP_TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const MAP_ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION?.trim() || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

const iframeStyle: CSSProperties = { width: '100%', height: '100%', border: 0, display: 'block', background: '#E8EEF2' };

export const OpenStreetMap = forwardRef<OpenStreetMapHandle, OpenStreetMapProps>(function OpenStreetMap(
  { style, center, userLocation, destination, markers = [], fitCoordinates = [], route, onMapPress, onMarkerPress, onViewportChange },
  forwardedRef,
) {
  const { language } = useLanguage();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [readyLanguage, setReady] = useState<string | null>(null);
  const [readyVersion, setReadyVersion] = useState(0);
  const ready = readyLanguage === language;
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const lastFitKey = useRef('');
  const lastMapData = useRef('');
  const document = useMemo(() => createMapDocument(language), [language]);

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

  const fitKey = useMemo(() => destination || route?.length || fitCoordinates.length
    ? `${language}|${revision}|${destination?.id ?? ''}|${destination?.coordinates.latitude ?? ''}|${destination?.coordinates.longitude ?? ''}|${route?.map((point) => `${point.latitude},${point.longitude}`).join(';') ?? ''}|${fitCoordinates.map((point) => `${point.latitude},${point.longitude}`).join(';')}`
    : '', [destination, fitCoordinates, route, language, revision]);
  const shouldFit = Boolean(fitKey && fitKey !== lastFitKey.current);
  const mapData = useMemo(() => ({ user: userLocation, destination, markers, fitCoordinates, route: route ?? null, fit: shouldFit }), [destination, fitCoordinates, markers, route, shouldFit, userLocation]);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data as MapMessage;
      if (message.source !== 'stepable-map') return;
      if (message.type === 'ready') {
        lastFitKey.current = '';
        lastMapData.current = '';
        setReady(language);
        setReadyVersion((value) => value + 1);
        setError(false);
      }
      if (message.type === 'error') setError(true);
      if (message.type === 'markerPress' && typeof message.id === 'string') onMarkerPress?.(message.id);
      if (message.type === 'viewportChange' && typeof message.west === 'number' && typeof message.south === 'number' && typeof message.east === 'number' && typeof message.north === 'number' && typeof message.zoom === 'number') {
        onViewportChange?.({ west: message.west, south: message.south, east: message.east, north: message.north }, message.zoom);
      }
      if (message.type === 'mapPress' && typeof message.latitude === 'number' && typeof message.longitude === 'number') {
        onMapPress?.({ latitude: message.latitude, longitude: message.longitude });
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onMapPress, onMarkerPress, onViewportChange, revision, language]);

  useEffect(() => {
    const payload = JSON.stringify(mapData);
    if (!ready || lastMapData.current === payload) return;
    send({ type: 'setData', data: mapData });
    lastMapData.current = payload;
    if (shouldFit) lastFitKey.current = fitKey;
  }, [fitKey, mapData, ready, readyVersion, send, shouldFit]);

  useEffect(() => {
    if (ready && center) centerOn(center);
  }, [center, centerOn, ready, readyVersion, language]);

  const reload = () => {
    setReady(null);
    setError(false);
    setRevision((value) => value + 1);
  };

  return (
    <View style={[styles.container, style]}>
      {createElement('iframe', {
        key: revision,
        ref: iframeRef,
        srcDoc: document,
        title: t('common.interactiveOpenstreetmap'),
        style: iframeStyle,
        sandbox: 'allow-scripts allow-same-origin',
        allow: 'geolocation',
        onLoad: () => setError(false),
      })}
      {!ready && !error ? <View pointerEvents="none" style={styles.loading}><Text style={styles.loadingText}>{t('common.loadingOpenstreetmap')}</Text></View> : null}
      {error ? <View style={styles.networkNotice}><Text style={styles.networkText}>{t('common.couldNotLoadTheMapCheckYour')}</Text><Pressable onPress={reload} accessibilityRole="button"><Text style={styles.retryText}>{t('common.tryAgain')}</Text></Pressable></View> : null}
    </View>
  );
});

function createMapDocument(language: string) {
  return `<!doctype html>
<html lang="${language}"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="preconnect" href="https://unpkg.com" crossorigin />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    html,body,#map{height:100%;width:100%;margin:0;background:#e8eef2;font-family:system-ui,sans-serif}
    .leaflet-container{background:#e8eef2;outline:none}.leaflet-control-attribution{font-size:10px!important;background:rgba(255,255,255,.9)!important;padding:2px 5px!important}
    .stepable-pin{width:22px;height:22px;border:4px solid #fff;border-radius:50%;background:#2563eb;box-shadow:0 2px 9px #0f172a66}
    .stepable-destination{position:relative;display:flex;align-items:center;justify-content:center;width:21px;height:21px;border:4px solid #fff;border-radius:50% 50% 50% 2px;background:#dc2626;transform:rotate(-45deg);box-shadow:0 2px 9px #0f172a55}
    .stepable-destination::after{content:"";width:7px;height:7px;border-radius:50%;background:#991b1b}
    .stepable-report{box-sizing:border-box;width:30px;height:30px;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #0f172a66}
    .stepable-report svg{width:17px;height:17px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    ${placeMarkerCss}
    .map-error{position:absolute;z-index:1000;left:12px;right:12px;top:42%;padding:12px;border-radius:12px;background:#fff;color:#334155;text-align:center;box-shadow:0 2px 10px #0f172a22}
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</head><body><div id="map"></div><script>
  (function(){
    const send=(message)=>window.parent.postMessage({source:'stepable-map',...message},'*');
    const reportIconPaths=${reportMarkerIconPathsJson};
    ${placeMarkerScript}
    if(!window.L){document.body.insertAdjacentHTML('beforeend','<div class="map-error">${t('map.loadFailed')}</div>');send({type:'error'});return;}
    const map=L.map('map',{zoomControl:false,preferCanvas:true,zoomSnap:.5,minZoom:3,maxZoom:19}).setView([0,0],3);
    const tiles=L.tileLayer('${MAP_TILE_URL}',{maxZoom:19,updateWhenIdle:true,updateWhenZooming:false,keepBuffer:1,attribution:'${MAP_ATTRIBUTION}'}).addTo(map);
    let userMarker=null,destinationMarker=null,routeLine=null,otherMarkers=[],poiMarkers=[];
    let lastDestinationPayload='null',lastRoutePayload='null';
    const userIcon=L.divIcon({className:'',html:'<div class="stepable-pin"></div>',iconSize:[22,22],iconAnchor:[11,11]});
    const destinationIcon=L.divIcon({className:'',html:'<div class="stepable-destination"></div>',iconSize:[29,29],iconAnchor:[14,22]});
    const safePopup=(text)=>{const node=document.createElement('span');node.textContent=String(text||'');return node;};
    ${placeMarkerVisibilityScript}
    ${placeMarkerLayerScript}
    const setData=(data)=>{
      if(data.user){if(!userMarker)userMarker=L.marker([data.user.latitude,data.user.longitude],{icon:userIcon,zIndexOffset:900}).addTo(map);else userMarker.setLatLng([data.user.latitude,data.user.longitude]);}
      const destinationPayload=JSON.stringify(data.destination||null);
      if(destinationPayload!==lastDestinationPayload){
        if(destinationMarker)map.removeLayer(destinationMarker);
        destinationMarker=data.destination?L.marker([data.destination.coordinates.latitude,data.destination.coordinates.longitude],{icon:destinationIcon,zIndexOffset:700}).addTo(map):null;
        if(destinationMarker)destinationMarker.bindPopup(safePopup(data.destination.label));
        lastDestinationPayload=destinationPayload;
      }
      setOtherMarkers(data.markers);
      const routePayload=JSON.stringify(data.route||null);
      if(routePayload!==lastRoutePayload){
        if(routeLine)map.removeLayer(routeLine);
        routeLine=data.route&&data.route.length?L.polyline(data.route.map((point)=>[point.latitude,point.longitude]),{color:'#2563eb',weight:6,opacity:.92,lineCap:'round',lineJoin:'round'}).addTo(map):null;
        lastRoutePayload=routePayload;
      }
      if(data.fit){const points=[];if(data.user)points.push([data.user.latitude,data.user.longitude]);if(data.destination)points.push([data.destination.coordinates.latitude,data.destination.coordinates.longitude]);if(routeLine)points.push(...routeLine.getLatLngs());points.push(...(data.fitCoordinates||[]).map((point)=>[point.latitude,point.longitude]));if(points.length>1)map.fitBounds(L.latLngBounds(points).pad(.2),{maxZoom:17});else if(points.length===1)map.setView(points[0],17);}
    };
    window.addEventListener('message',(event)=>{const message=event.data;if(!message||message.source!=='stepable-parent')return;if(message.type==='setData')setData(message.data||{});if(message.type==='center')map.setView([message.latitude,message.longitude],message.zoom||17,{animate:true});if(message.type==='zoom')map.setZoom(Math.max(3,Math.min(19,map.getZoom()+message.step)));});
    map.on('click',(event)=>send({type:'mapPress',latitude:event.latlng.lat,longitude:event.latlng.lng}));
    map.on('moveend zoomend',()=>{const bounds=map.getBounds();send({type:'viewportChange',west:bounds.getWest(),south:bounds.getSouth(),east:bounds.getEast(),north:bounds.getNorth(),zoom:map.getZoom()});});
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
