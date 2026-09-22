export const placeSamples = [
  { id: 'hospital', name: 'โรงพยาบาลสมเด็จฯ', category: 'โรงพยาบาล', address: 'ถนนเจิมจอมพล · ศรีราชา', distance: '1.2 กม.', score: 86, access: 'มีทางลาดบางจุด' },
  { id: 'kohloy', name: 'สวนสุขภาพเกาะลอย', category: 'สวนสาธารณะ / ทะเล', address: 'เกาะลอย · ศรีราชา', distance: '2.4 กม.', score: 92, access: 'ทางเดินเรียบ' },
  { id: 'robinson', name: 'โรบินสัน ศรีราชา', category: 'ห้างสรรพสินค้า', address: 'ถนนสุขุมวิท · ศรีราชา', distance: '1.8 กม.', score: 78, access: 'มีทางม้าลายใกล้เคียง' },
  { id: 'station', name: 'สถานีรถไฟศรีราชา', category: 'จุดต่อรถสาธารณะ', address: 'ตำบลศรีราชา', distance: '3.1 กม.', score: 71, access: 'ข้อมูลทางลาดยังไม่ครบ' },
];

export const routeSamples = [
  { id: 'safe', name: 'ปลอดภัยเป็นหลัก', note: 'เลี่ยงถนนใหญ่และจุดข้ามที่ข้อมูลไม่ครบ', distance: '1.4 กม.', duration: '22 นาที', safety: 91, access: 88, label: 'แนะนำ' },
  { id: 'accessible', name: 'เข้าถึงง่าย', note: 'เน้นทางเท้าเรียบและหลีกเลี่ยงบันได', distance: '1.7 กม.', duration: '27 นาที', safety: 87, access: 96, label: 'เหมาะกับรถเข็น' },
  { id: 'fast', name: 'ใช้เวลาน้อย', note: 'เส้นทางตรงกว่า แต่มีช่วงทางเท้าแคบ', distance: '1.1 กม.', duration: '17 นาที', safety: 74, access: 69, label: 'เร็วที่สุด' },
];

export const placeCategories = ['ทั้งหมด', 'โรงพยาบาล', 'สวนสาธารณะ / ทะเล', 'ห้างสรรพสินค้า', 'จุดต่อรถสาธารณะ'];
