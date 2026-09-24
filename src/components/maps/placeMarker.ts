import { getIconPaths } from '../ui/Icon';

export const placeMarkerIcons = [
  'wheelchair', 'crosswalk', 'park', 'restaurant', 'coffee', 'bed', 'fuel',
  'graduation', 'hospital', 'plane', 'bus', 'train', 'shopping',
  'shield', 'briefcase', 'star', 'send',
] as const;
export type PlaceMarkerIcon = (typeof placeMarkerIcons)[number];

const placeMarkerColors: Record<PlaceMarkerIcon, string> = {
  wheelchair: '#2563EB',
  crosswalk: '#A855F7',
  park: '#16A34A',
  restaurant: '#F97316',
  coffee: '#C2410C',
  bed: '#EC4899',
  fuel: '#EA580C',
  graduation: '#7C3AED',
  hospital: '#DC2626',
  plane: '#2563EB',
  bus: '#0284C7',
  train: '#475569',
  shopping: '#DB2777',
  shield: '#334E7D',
  briefcase: '#64748B',
  star: '#D97706',
  send: '#0891B2',
};

export function placeIconForOsmTags(tags: Record<string, string>): PlaceMarkerIcon | null {
  if (tags.healthcare === 'hospital' || tags.healthcare === 'clinic' || tags.healthcare === 'doctor' || tags.healthcare === 'pharmacy') return 'hospital';
  if (tags.aeroway === 'aerodrome' || tags.aeroway === 'terminal') return 'plane';
  if (tags.railway === 'station') return 'train';
  if (tags.leisure === 'park') return 'park';
  if (tags.shop === 'supermarket' || tags.shop === 'convenience' || tags.shop === 'mall') return 'shopping';
  if (tags.tourism === 'hotel' || tags.tourism === 'hostel' || tags.tourism === 'guest_house' || tags.tourism === 'motel') return 'bed';
  if (tags.tourism === 'museum' || tags.tourism === 'attraction') return 'star';
  switch (tags.amenity) {
    case 'hospital': case 'clinic': case 'doctors': case 'pharmacy': return 'hospital';
    case 'university': case 'college': case 'school': case 'kindergarten': case 'library': return 'graduation';
    case 'restaurant': case 'fast_food': return 'restaurant';
    case 'cafe': return 'coffee';
    case 'bus_station': return 'bus';
    case 'fuel': return 'fuel';
    case 'bank': case 'atm': return 'briefcase';
    case 'police': case 'fire_station': return 'shield';
    case 'post_office': return 'send';
    case 'townhall': case 'place_of_worship': return 'star';
    default: return null;
  }
}

export function placeIconForGeoapifyCategories(categories: string[]): PlaceMarkerIcon | null {
  const has = (prefix: string) => categories.some((category) => category === prefix || category.startsWith(`${prefix}.`));
  if (has('healthcare')) return 'hospital';
  if (has('airport')) return 'plane';
  if (has('public_transport.train') || has('public_transport.subway')) return 'train';
  if (has('education') || has('childcare')) return 'graduation';
  if (has('accommodation')) return 'bed';
  if (has('leisure.park')) return 'park';
  if (has('commercial.shopping_mall') || has('commercial.supermarket')) return 'shopping';
  if (has('public_transport.bus')) return 'bus';
  if (has('service.vehicle.fuel')) return 'fuel';
  if (has('service.police')) return 'shield';
  if (has('entertainment.museum')) return 'star';
  if (has('catering.cafe')) return 'coffee';
  if (has('catering.restaurant')) return 'restaurant';
  return null;
}

export function placePriorityForOsmTags(tags: Record<string, string>): number {
  if (tags.aeroway === 'aerodrome' || tags.amenity === 'hospital' || tags.healthcare === 'hospital') return 100;
  if (tags.aeroway === 'terminal' || tags.amenity === 'university') return 90;
  if (tags.railway === 'station' || tags.amenity === 'clinic' || tags.healthcare === 'clinic') return 85;
  if (tags.leisure === 'park' || tags.amenity === 'college' || tags.amenity === 'bus_station') return 75;
  if (tags.tourism === 'hotel' || tags.amenity === 'school' || tags.amenity === 'police') return 70;
  if (tags.amenity === 'pharmacy' || tags.shop === 'supermarket' || tags.amenity === 'fuel') return 60;
  if (tags.amenity === 'restaurant' || tags.amenity === 'fire_station' || tags.tourism === 'museum') return 55;
  if (tags.amenity === 'cafe' || tags.amenity === 'bank' || tags.tourism === 'hostel') return 45;
  return 30;
}

export function placePriorityForGeoapifyCategories(categories: string[]): number {
  const has = (prefix: string) => categories.some((category) => category === prefix || category.startsWith(`${prefix}.`));
  if (has('airport') || has('healthcare.hospital')) return 100;
  if (has('education.university')) return 90;
  if (has('healthcare.clinic_or_praxis') || has('public_transport.train') || has('public_transport.subway')) return 85;
  if (has('leisure.park') || has('education.college')) return 75;
  if (has('accommodation.hotel') || has('education.school')) return 70;
  if (has('healthcare.pharmacy') || has('commercial.supermarket')) return 60;
  if (has('catering.restaurant') || has('entertainment.museum')) return 55;
  return 45;
}

export const placeMarkerCss = `
  .stepable-place-icon{background:none;border:none;overflow:visible}
  .stepable-place{position:relative;width:24px;height:24px}
  .stepable-place-badge{box-sizing:border-box;width:24px;height:24px;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px #0f172a44}
  .stepable-place-badge svg{position:relative;z-index:1;width:14px;height:14px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .stepable-place-label{display:none;position:absolute;left:29px;top:3px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334155;font-size:10px;font-weight:700;text-shadow:-1px -1px #fff,1px -1px #fff,-1px 1px #fff,1px 1px #fff}
  .stepable-place.show-label .stepable-place-label{display:block}
`;

export const placeMarkerScript = `
  const placeIconPaths=${JSON.stringify(Object.fromEntries(placeMarkerIcons.map((icon) => [icon, getIconPaths(icon)])))};
  const placeIconColors=${JSON.stringify(placeMarkerColors)};
  const makePlaceIcon=(point)=>{
    const root=document.createElement('div');root.className='stepable-place';
    const badge=document.createElement('span');badge.className='stepable-place-badge';badge.style.backgroundColor=placeIconColors[point.placeIcon];
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
    placeIconPaths[point.placeIcon].forEach((value)=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',value);svg.appendChild(path);});
    badge.appendChild(svg);root.appendChild(badge);
    if(point.showLabel){const label=document.createElement('span');label.className='stepable-place-label';label.textContent=String(point.label||'');root.appendChild(label);}
    return L.divIcon({className:'stepable-place-icon',html:root,iconSize:[24,24],iconAnchor:[12,12]});
  };
`;

export const placeMarkerVisibilityScript = `
  const updatePoiVisibility=()=>{
    const zoom=map.getZoom();
    const size=map.getSize();
    otherMarkers.forEach((marker)=>{
      const root=marker.getElement()?.querySelector('.stepable-place');
      if(root)root.classList.toggle('show-label',zoom>=16);
    });
    const minPriority=zoom<13?95:zoom<14?75:zoom<15?55:zoom<16?30:0;
    const minDistance=zoom<15?104:zoom<16?64:zoom<17?48:36;
    const maxIcons=zoom<14?10:zoom<15?20:zoom<16?40:zoom<17?70:120;
    const maxLabels=zoom<15?5:zoom<16?8:zoom<17?10:14;
    const minLabelPriority=zoom<15?80:zoom<16?70:zoom<17?55:40;
    const iconPoints=otherMarkers.map((marker)=>map.latLngToContainerPoint(marker.getLatLng()));
    const labelRects=[];
    let shownIcons=0;
    for(const entry of [...poiMarkers].sort((a,b)=>(b.point.poiPriority||0)-(a.point.poiPriority||0))){
      const marker=entry.marker,point=entry.point;
      const pixel=map.latLngToContainerPoint(marker.getLatLng());
      const inView=pixel.x>=-20&&pixel.y>=-20&&pixel.x<=size.x+20&&pixel.y<=size.y+20;
      const nearIcon=iconPoints.some((used)=>Math.hypot(used.x-pixel.x,used.y-pixel.y)<minDistance);
      const overLabel=labelRects.some((rect)=>pixel.x>=rect.left-12&&pixel.x<=rect.right+12&&pixel.y>=rect.top-12&&pixel.y<=rect.bottom+12);
      const visible=inView&&shownIcons<maxIcons&&(point.poiPriority||0)>=minPriority&&!nearIcon&&!overLabel;
      if(!visible){if(map.hasLayer(marker))map.removeLayer(marker);continue;}
      if(!map.hasLayer(marker))marker.addTo(map);
      iconPoints.push(pixel);shownIcons++;
      let showLabel=false;
      if(point.showLabel&&(point.poiPriority||0)>=minLabelPriority&&labelRects.length<maxLabels){
        const width=Math.min(120,Math.max(40,String(point.label||'').length*7));
        const rect={left:pixel.x+19,right:pixel.x+25+width,top:pixel.y-11,bottom:pixel.y+12};
        showLabel=rect.right<=size.x-4&&!labelRects.some((used)=>rect.left<used.right+8&&rect.right>used.left-8&&rect.top<used.bottom+5&&rect.bottom>used.top-5);
        if(showLabel)labelRects.push(rect);
      }
      const root=marker.getElement()?.querySelector('.stepable-place');
      if(root)root.classList.toggle('show-label',showLabel);
    }
  };
  map.on('zoomend moveend',updatePoiVisibility);
`;

export const placeMarkerLayerScript = `
  let lastMarkerPayload='';
  const setOtherMarkers=(points)=>{
    const payload=JSON.stringify(points||[]);
    if(payload===lastMarkerPayload){updatePoiVisibility();return;}
    lastMarkerPayload=payload;
    otherMarkers.forEach((marker)=>map.removeLayer(marker));
    poiMarkers.forEach(({marker})=>{if(map.hasLayer(marker))map.removeLayer(marker);});
    otherMarkers=[];poiMarkers=[];
    (points||[]).forEach((point)=>{
      let marker;
      if(point.reportIcon&&reportIconPaths[point.reportIcon]){
        const color=typeof point.color==='string'&&/^#[0-9a-f]{6}$/i.test(point.color)?point.color:'#dc2626';
        const svg='<svg viewBox="0 0 24 24">'+reportIconPaths[point.reportIcon].map((path)=>'<path d="'+path+'"/>').join('')+'</svg>';
        const icon=L.divIcon({className:'',html:'<div class="stepable-report" style="background-color:'+color+'">'+svg+'</div>',iconSize:[30,30],iconAnchor:[15,15]});
        marker=L.marker([point.coordinates.latitude,point.coordinates.longitude],{icon}).addTo(map);
        otherMarkers.push(marker);
      }else if(point.placeIcon&&placeIconPaths[point.placeIcon]){
        marker=L.marker([point.coordinates.latitude,point.coordinates.longitude],{icon:makePlaceIcon(point)});
        if(point.markerKind==='poi')poiMarkers.push({marker,point});
        else{marker.addTo(map);otherMarkers.push(marker);}
      }else{
        marker=L.circleMarker([point.coordinates.latitude,point.coordinates.longitude],{radius:8,color:'#fff',weight:3,fillColor:point.color||'#f97316',fillOpacity:1}).addTo(map);
        otherMarkers.push(marker);
      }
      if(point.placeIcon||point.reportIcon)marker.on('click',()=>send({type:'markerPress',id:point.id}));
      else marker.bindPopup(safePopup(point.label));
    });
    updatePoiVisibility();
  };
`;
