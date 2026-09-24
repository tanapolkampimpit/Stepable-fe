# ภาษาไทยและภาษาอังกฤษใน StepAble

ผู้ใช้เปลี่ยนภาษาได้ที่ **โปรไฟล์ → ภาษา** การเปลี่ยนมีผลทันทีและบันทึกใน
AsyncStorage (`@stepable/language`) เพื่อใช้ครั้งถัดไป ภาษาเริ่มต้นคือไทย
ระบบรออ่านค่าที่บันทึกก่อนแสดงหน้าแอป ไม่รีเซ็ตหน้าจอหรือข้อมูลที่กำลังกรอก
ไม่ใช้บริการแปลออนไลน์ และไม่เพิ่ม dependency ใหม่

## โครงสร้าง

| ไฟล์ | หน้าที่ |
| --- | --- |
| `locales/en.ts`, `locales/th.ts` | คำแปลที่แอปเป็นเจ้าของ ใช้ key เดียวกันทั้งสองภาษา |
| `core.ts` | ชนิดข้อมูล, interpolation, locale store, ข้อความและ error ที่เปลี่ยนภาษาได้ |
| `LanguageProvider.tsx` | โหลด/บันทึกภาษา, React subscription, `useMessageState` |
| `reports.ts` | รหัสประเภทปัญหา/ความรุนแรงและแปลงรายงานเก่า |
| `detections.ts` | แปลงทิศทางจาก AI API เดิมเป็นข้อความตามภาษา |
| `native/*.json` | คำอธิบายสิทธิ์ iOS ซึ่ง Expo ใช้ตอน build |
| `index.ts` | จุด import สำหรับ component |

`LanguageProvider` อยู่เหนือ `AppDataProvider` ใน `src/app/_layout.tsx`.
Locale store มีหนึ่งชุดสำหรับ client app นี้ ใช้ `useSyncExternalStore` ให้ทุกหน้า
อัปเดตพร้อมกัน และให้ service/เสียงนำทางอ่านภาษาปัจจุบันได้โดยไม่ใช้ React hook
ถ้าเปลี่ยนระบบเป็น server-rendered หลายผู้ใช้ ต้องแยก store ต่อ request

## เพิ่มข้อความใหม่

1. เพิ่ม key ที่สื่อความหมายใน `locales/en.ts` เช่น `profile.accountName`.
2. เพิ่ม key เดียวกันใน `locales/th.ts` — TypeScript ตรวจว่ามีครบและไม่มี key เกิน.
3. Component ที่ใช้คำแปลต้องเรียก `useLanguage()` เพื่อรับการเปลี่ยนภาษา.

```tsx
import { t, useLanguage } from '../../i18n';

function PageTitle() {
  useLanguage();
  return <Text>{t('common.profile')}</Text>;
}
```

ใช้ parameter เมื่อมีค่าที่เปลี่ยน เช่น
`t('routes.riskScore', { score: 24 })` โดยค่า `score` ต้องมาจากข้อมูลจริง.
ห้ามประกอบประโยคด้วยการต่อคำไทย/อังกฤษใน component และห้ามแปล label
ตอนโหลด module เพราะจะไม่เปลี่ยนตามภาษาภายหลัง

สำหรับข้อความที่เก็บใน state ให้เก็บ key แทนคำแปลสำเร็จรูป:

```tsx
const [notice, setNotice] = useMessageState();
setNotice(message('language.saved'));
```

Service import จาก `i18n/core` เพื่อไม่ดึง React/AsyncStorage เข้าไปด้วย.
โยน `LocalizedError(message(key, params))` และใช้ `errorMessage(error, fallbackKey)`
ที่หน้าจอ ทำให้ error ที่แสดงอยู่เปลี่ยนภาษาได้ด้วย
ข้อผิดพลาด HTTP ของ route API ที่ไม่มีรหัสมาตรฐานจะแสดง status ที่แปลได้
ไม่แสดงข้อความภาษาไทยที่ server ส่งมาโดยไม่มี contract ภาษา ส่วน local AI ใช้
รหัสใน `services/local-ai-errors.ts` เพื่อแสดง error ที่แปลแล้วและสอดคล้องกับ
อุปกรณ์หรือไฟล์โมเดลที่ต้องตรวจสอบ

## ข้อมูลที่บันทึกและข้อมูลจากภายนอก

- รายงานใหม่ใช้ `damaged_sidewalk`, `poor_lighting` ฯลฯ และ `low/medium/high`.
  ใช้ `issueLabel()` / `severityLabel()` เฉพาะตอนแสดง ห้ามใช้ label เป็นเงื่อนไข.
- รายงานเก่าแปลงชื่อประเภทและความรุนแรงจากไทยเป็นรหัสเมื่อโหลด โดยคง ID,
  รูป, พิกัด, วันที่ และข้อความที่ผู้ใช้เขียนไว้เดิม การแปลงซ้ำไม่เปลี่ยนข้อมูล.
- ชื่อผู้ใช้ ชื่อสถานที่ และรายละเอียดรายงานเป็นข้อมูลจริง ไม่แปลหรือแต่งใหม่.
  Photon ขอชื่ออังกฤษเมื่อเลือก English แต่หาก OSM ไม่มีชื่ออังกฤษ อาจยังได้
  ชื่อท้องถิ่น รูปภาพ tile ของ OpenStreetMap มีข้อความในภาพที่แอปเปลี่ยนไม่ได้.
- โมเดลตรวจภาพทำงานในเครื่องผ่าน ONNX Runtime ผลภาพไม่ถูกส่งไป AI server.
  class, ทิศทาง และช่วงระยะจาก local/legacy AI แปลตอนแสดงผล ไม่เปลี่ยนผลโมเดล.
  การคำนวณเส้นทางยังเรียก backend และส่ง `Accept-Language`; server ต้องรองรับเอง.
- ระยะทาง เวลา และคะแนนหน้าเลือกเส้นทางแสดงเฉพาะค่าที่ API ส่งให้ตัวเลือก
  ปัจจุบัน ไม่มีการคูณ/บวกค่าขึ้นเอง ตัวเลือกอื่นให้กดเพื่อคำนวณ.
- เสียงนำทางใช้ `th-TH` หรือ `en-US`; เสียงที่ใช้ได้ขึ้นอยู่กับเสียงบนอุปกรณ์.

## Native permission dialogs

คำอธิบายสิทธิ์ iOS แยกไทย/อังกฤษใน `native/` และประกาศใน `app.json`.
ต้อง build แอปใหม่เพื่อใช้ข้อความ native; เปลี่ยน JavaScript หรือ reload Expo Go
จะไม่เปลี่ยนข้อความสิทธิ์ของตัว Expo Go. ภาษาของหน้าต่างสิทธิ์และปุ่มระบบ
เลือกโดยระบบปฏิบัติการ ไม่ใช่ปุ่มภาษาในแอป.

## การตรวจสอบ

```sh
npm run test:i18n
npm run lint -- --no-cache
npx tsc --noEmit
```

ชุดทดสอบตรวจ key/parameter ครบทั้งคู่, ไม่มีไทยใน catalog อังกฤษ, error ที่ค้าง
เปลี่ยนภาษาได้, migration รายงานเดิม, ทิศทาง AI และข้อความไทยที่หลุดไปอยู่ใน UI.

ตรวจบนอุปกรณ์เพิ่มเติม: เปลี่ยนไทย → อังกฤษ → ปิดเปิดแอป, ตรวจทุกหน้าและ modal,
เปิดรายงานเก่า, เปลี่ยนภาษาระหว่างมีข้อความ error, ตรวจขนาดตัวอักษรใหญ่และ
เสียงนำทางทั้งสองภาษา โดยไม่ใช้ข้อมูลจำลองแทนผลตรวจจากกล้องจริง.
