# دليل التشغيل والتجربة على جهاز أندرويد حقيقي

> **تنويه مهم قبل ما تبدأ:** تطبيق الأندرويد نفسه لسه ما اتبنيش (هيبدأ في المرحلة 6
> حسب الـ Roadmap). اللي موجود دلوقتي هو الـ **Backend API** بس. يعني اللي هنعمله هنا
> هو: نشغّل السيرفر على جهاز الكمبيوتر، ونخلي موبايل الأندرويد (على نفس شبكة الواي
> فاي) يقدر يكلّم الـ API ده ويجرب الـ Login والـ Endpoints الأساسية، باستخدام تطبيق
> بسيط زي Postman أو HTTP Shortcuts، أو حتى المتصفح. ده بيأكد إن السيرفر شغال
> ومتاح على الشبكة، وده أول حاجة لازم تتأكد منها قبل ما تطبيق الأندرويد الحقيقي يتبني.

---

## الجزء الأول: تشغيل السيرفر على الكمبيوتر

### 1. تأكد من المتطلبات

- Node.js نسخة 20 أو أحدث مثبت على جهازك
- Docker مثبت وشغال (لتشغيل PostgreSQL وRedis)
- فك ضغط ملف `church-backend-phase0-3.zip` اللي بعتهولك، وافتح Terminal/CMD جوه فولدر `church-backend`

### 2. ثبّت المكتبات

```bash
npm install
```

### 3. جهّز ملف الإعدادات

```bash
cp .env.example .env
```

افتح `.env` وغيّر السطر ده لأي قيمة عشوائية طويلة (مهم حتى في التجربة المحلية):

```
JWT_ACCESS_SECRET=اكتب-هنا-نص-عشوائي-طويل-32-حرف-على-الأقل
```

### 4. شغّل قاعدة البيانات

```bash
docker compose up -d
```

### 5. أنشئ الجداول

```bash
npm run prisma:migrate
```

هيطلب منك اسم للـ Migration أول مرة، اكتب أي اسم زي `init` واضغط Enter.

### 6. طبّق قيود الحماية الإضافية (مرة واحدة بس)

```bash
docker compose exec -T db psql -U church -d church < prisma/manual/audit_append_only.sql
docker compose exec -T db psql -U church -d church < prisma/manual/partial_unique_indexes.sql
```

### 7. ازرع البيانات الأساسية (الأدوار والصلاحيات + Super Admin)

```bash
npm run seed
```

هيطبعلك في الآخر اسم المستخدم وكلمة المرور المؤقتة لحساب الـ Super Admin
(افتراضيًا `admin` / `ChangeMe!12345` لو ما غيّرتش القيم في `.env`).

### 8. شغّل السيرفر

```bash
npm run start:dev
```

لو كل حاجة تمام هتشوف رسالة إن السيرفر شغال على البورت `3000`. جرّب من نفس
الجهاز إنه شغال فعلًا:

```bash
curl http://localhost:3000/api/v1/stages
```

لو رجعلك JSON (حتى لو فاضي زي `{"data":[],"meta":...}`)، يبقى السيرفر شغال صح.

---

## الجزء الثاني: خلّي السيرفر متاح لموبايل الأندرويد

السيرفر دلوقتي شغال وبيسمع بس على `localhost` (جهاز الكمبيوتر نفسه). عشان
الموبايل يقدر يوصله، لازم:

### 1. اعرف الـ IP المحلي بتاع الكمبيوتر

**Windows (CMD):**
```bash
ipconfig
```
دوّر على سطر `IPv4 Address` تحت الشبكة اللي متوصل بيها (الواي فاي عادة)، هيكون شكله مثلاً `192.168.1.25`.

**Mac:**
```bash
ipconfig getifaddr en0
```

**Linux:**
```bash
hostname -I
```

احفظ الرقم ده، هنسميه `<PC_IP>` من دلوقتي.

### 2. تأكد إن الموبايل والكمبيوتر على نفس شبكة الواي فاي

ده شرط أساسي — لازم الاتنين متوصلين بنفس الراوتر.

### 3. افتح البورت 3000 في الفايروول (لو موجود)

**Windows:** لو ظهرت رسالة "Windows Defender Firewall" لما شغّلت السيرفر،
اضغط "Allow access". لو مش متأكد إنه مفتوح، جرب تتأكد بتشغيل الأمر ده في
PowerShell كـ Administrator:
```powershell
New-NetFirewallRule -DisplayName "Church API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

**Mac:** عادة Docker/Node بيطلب سماح أول مرة، وافق عليه من System Settings → Network → Firewall.

**Linux (ufw):**
```bash
sudo ufw allow 3000/tcp
```

### 4. جرّب من الموبايل إن الاتصال شغال

افتح متصفح الأندرويد واكتب:

```
http://<PC_IP>:3000/api/v1/stages
```

مثلاً: `http://192.168.1.25:3000/api/v1/stages`

لو ظهرلك JSON، يبقى الموبايل بيكلم السيرفر بنجاح. لو ظهر "لا يمكن الوصول
للموقع"، راجع: (أ) إنكم على نفس الشبكة، (ب) الفايروول، (ج) إن `.env` ماعندوش
`CORS_ORIGINS` بيمنع الطلب (مش هيأثر على المتصفح العادي أو curl، بس هيأثر لو
بنيت صفحة ويب لاحقًا).

---

## الجزء الثالث: اختبار الـ Endpoints فعليًا من الموبايل

المتصفح بيعمل GET بس، وده مش كفاية لاختبار Login (محتاج POST مع Body). عندك
خيارين على الأندرويد:

### الخيار الأول (الأسهل): تطبيق Postman أو HTTP Shortcuts

1. نزّل من Google Play تطبيق **Postman** أو **HTTP Shortcuts** (مجاني وأخف).
2. اعمل طلب جديد:
   - **Method:** POST
   - **URL:** `http://<PC_IP>:3000/api/v1/auth/login`
   - **Body (JSON):**
     ```json
     { "identifier": "admin", "password": "ChangeMe!12345" }
     ```
   - **Header:** `Content-Type: application/json`
3. اضغط Send. المفروض يرجعلك شيء زي:
   ```json
   { "accessToken": "...", "refreshToken": "...", "mustChangePassword": true }
   ```
4. انسخ قيمة `accessToken`، واستخدمه في طلب جديد:
   - **Method:** POST
   - **URL:** `http://<PC_IP>:3000/api/v1/auth/change-password`
   - **Header:** `Authorization: Bearer <الصق التوكن هنا>`
   - **Body:**
     ```json
     { "currentPassword": "ChangeMe!12345", "newPassword": "كلمة-سر-جديدة-أطول-من-10-حروف" }
     ```
5. بعد كده جرّب أي Endpoint تاني بنفس طريقة الـ Header:
   - `GET /api/v1/auth/me`
   - `GET /api/v1/users`
   - `GET /api/v1/stages`

### الخيار الثاني: Termux (لو عايز تجربة أقرب للـ Command Line)

1. نزّل **Termux** من F-Droid أو Google Play.
2. جواه نفّذ:
   ```bash
   pkg install curl -y
   curl -s -X POST http://<PC_IP>:3000/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"identifier":"admin","password":"ChangeMe!12345"}'
   ```

---

## الجزء الرابع: لو عايز تجرب من بره شبكة البيت (اختياري)

لو الموبايل مش على نفس الواي فاي (شبكة بيانات مثلًا)، استخدم **ngrok** عشان
يعمل رابط عام مؤقت للسيرفر المحلي:

```bash
# نزّل ngrok من ngrok.com وسجل حساب مجاني، بعدين:
ngrok http 3000
```

هيديك رابط زي `https://xxxx.ngrok-free.app`، استخدمه بدل `http://<PC_IP>:3000`
في كل الطلبات اللي فوق. **ده للتجربة بس، مش للاستخدام الفعلي أو الإنتاج.**

---

## مشاكل شائعة

| المشكلة | الحل |
|---|---|
| الموبايل مش عارف يوصل خالص | تأكد من نفس الشبكة، وجرب تبينج الكمبيوتر من تطبيق زي Termux: `ping <PC_IP>` |
| `ECONNREFUSED` أو السيرفر مش شغال | تأكد إن `npm run start:dev` لسه شغال في الـ Terminal ومفيهوش Error |
| خطأ في الاتصال بقاعدة البيانات | تأكد إن `docker compose up -d` شغال: `docker compose ps` |
| `401 UNAUTHORIZED` على أي Endpoint غير `/auth/*` | لازم تبعت `Authorization: Bearer <accessToken>` في الـ Header |
| `PASSWORD_CHANGE_REQUIRED` | ده طبيعي أول مرة، لازم تعمل `change-password` الأول زي فوق |
| الـ accessToken بقى `401 TOKEN_EXPIRED` | صلاحيته 15 دقيقة بس، استخدم `refreshToken` على `/auth/refresh` تجيب واحد جديد، أو اعمل Login تاني |

---

## الخطوة الجاية

لما تطبيق الأندرويد الفعلي يتبني (المرحلة 6 في الـ Roadmap)، هيكلم نفس الـ
`<PC_IP>:3000/api/v1` ده (أو عنوان السيرفر الحقيقي بعد النشر)، ونفس خطوات
Login وTokens اللي جربتها هنا هتبقى هي نفسها جوه التطبيق تلقائيًا.
