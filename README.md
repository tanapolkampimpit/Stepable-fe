# StepAble Frontend

แอป Frontend ของ StepAble สร้างด้วย Expo, React Native และ Expo Router

## สิ่งที่ต้องติดตั้ง

- Git สำหรับ clone repository
- Node.js **22.13 ขึ้นไป** และ npm (ติดตั้งมาพร้อม Node.js) — โปรเจกต์นี้ใช้ Expo SDK 57 ([ข้อกำหนด Expo SDK](https://docs.expo.dev/versions/v57.0.0/))
- เว็บเบราว์เซอร์ เช่น Chrome หรือ Edge

ไม่ต้องติดตั้ง Expo CLI แยก เพราะคำสั่งด้านล่างใช้ Expo CLI ของโปรเจกต์นี้

## ติดตั้งและเปิดเว็บ

เปิด Terminal หรือ PowerShell ในโฟลเดอร์ `st-fe` แล้วรัน:

```bash
npm ci
npm run web
```

เปิด URL ที่ Expo แสดงใน Terminal โดยใช้เบราว์เซอร์บนเครื่องเดียวกับที่รันโปรเจกต์ โดยปกติ URL จะเป็น `http://localhost:8081`

ตรวจเวอร์ชัน Node.js และ npm ได้ด้วย:

```bash
node --version
npm --version
```

## การใช้ตำแหน่ง GPS บนเว็บ

บนเว็บ แอปขอตำแหน่งผ่านเบราว์เซอร์และระบบปฏิบัติการ จึงต้องอนุญาต Location ให้เว็บไซต์และเปิด Location Services ของเครื่องด้วย เบราว์เซอร์อนุญาตการขอตำแหน่งบนหน้า `https://` หรือ `http://localhost` เท่านั้น [อ่านรายละเอียดเรื่อง permissions ของ Expo](https://docs.expo.dev/guides/permissions/)

- เปิดเว็บบนเครื่องเดียวกับ Expo ด้วย `localhost` แล้วกด Allow เมื่อเบราว์เซอร์ถามสิทธิ์ Location
- ถ้าเคยกด Block ให้เปลี่ยน Location เป็น Allow จากการตั้งค่าเว็บไซต์ในเบราว์เซอร์ แล้วโหลดหน้าใหม่
- ถ้าใช้ Windows ให้เปิด Location Services ใน Settings ด้วย
- ถ้าเปิดเว็บจากโทรศัพท์ผ่าน IP ของคอมพิวเตอร์ เช่น `http://192.168.x.x:8081` เบราว์เซอร์อาจบล็อก Location เพราะเป็น HTTP; ใช้เว็บไซต์ผ่าน HTTPS หรือเปิดแอปแบบ native แทน
- การหาตำแหน่งอาจช้าหรือไม่แม่นบนคอมพิวเตอร์ที่ไม่มี GPS โดยเฉพาะเมื่อปิด Location Services หรือไม่มีข้อมูลตำแหน่งจากระบบ

ถ้าสถานะยังหมุนค้าง ให้เช็ก URL ที่เปิดและสิทธิ์ Location ก่อน โค้ดปัจจุบันรอให้เบราว์เซอร์ส่งพิกัดกลับมา จึงอาจยังแสดงสถานะกำลังหาตำแหน่งเมื่อระบบไม่ส่งพิกัด

## ค่าแวดล้อม (ไม่บังคับ)

ไม่ต้องตั้งค่า `.env` เพื่อเปิดแผนที่ ค้นหาสถานที่ ดูสภาพอากาศ หรือขอตำแหน่ง GPS ฟีเจอร์เหล่านี้ต้องใช้อินเทอร์เน็ต

ถ้าจะใช้ฟีเจอร์ AI ให้คัดลอก `.env.example` เป็น `.env` และตั้ง `EXPO_PUBLIC_AI_API_URL` เป็น URL ของ AI backend ที่เครื่องนี้เข้าถึงได้ จากนั้นเริ่ม Expo ใหม่ ตัวแปรที่ขึ้นต้นด้วย `EXPO_PUBLIC_` จะถูกใส่ไว้ในแอปฝั่งผู้ใช้ ห้ามใส่ secret หรือ API key ส่วนตัวในตัวแปรเหล่านี้

## คำสั่งที่มี

```bash
npm run web      # เปิดเว็บ
npm start        # เปิด Expo development server
npm run lint     # ตรวจ lint
```
