# ملخص حالة مشروع Church Service Management System

## الوضع الحالي (مهم جدًا)
بيئة التنفيذ بتعمل Reset لملفات الكود بين كل رسالة (Turn) جديدة. آخر حاجة
فعليًا **اتحفظت وأتبعتت لك كملف** هي Phase 0-3. شغل Phase 4 إلى 9 اللي كنت
بنيته في الرد اللي فات **اتفقد مع الـ Reset** لأنه ما كانش اتزيب في ملف
نهائي قبل ما الرد يخلص. دلوقتي بعيد بناء نفس المراحل تاني من نفس التصميم
والأكواد اللي كانت مكتوبة بالظبط (موجودة في سجل المحادثة)، مع تطبيق كل
الإصلاحات اللي كنت لقيتها أثناء المراجعة.

---

## 1. المُسلَّم فعليًا كملف (Phase 0-3) ✅
- `church-system-architecture.md` — وثيقة التصميم الكاملة (DB Schema, RBAC Matrix, API Design, Business Rules, Roadmap)
- `church-backend-phase0-3.zip` — باك إند NestJS + Prisma + PostgreSQL شغال فعليًا:
  - **Auth**: login / refresh (rotation + reuse detection) / logout / change-password / forgot-password / reset-password / me
  - **RBAC**: Role + Permission + Scope + Override لكل مستخدم، محلولة بالكامل Server-side (`src/rbac/resolve.ts`, مختبَرة بـ Unit Tests)
  - **Users**: CRUD كامل، تعطيل/تفعيل، Logout All، تعيين الأدوار بحفظ التاريخ، Override الصلاحيات
  - **Devices/Sessions**: عرض وإلغاء
  - **Audit Log**: Append-only فعليًا على مستوى الـ DB (Trigger)
  - **Stages/Classes/Children/Parents/Servants**: CRUD كامل + Transfer بحفظ التاريخ + تعيين أمين المرحلة
  - طبقة `src/common/scope.ts`: فرض الـ Scope (OWN_STAGE/ALL/OWN_RECORD) فعليًا على كل Query، مش مجرد Check سطحي
- `RUN_AND_TEST_ON_ANDROID.md` — دليل تشغيل السيرفر واختباره من موبايل أندرويد حقيقي

---

## 2. اللي كان اتبنى في الرد اللي فات وبيتبنى تاني دلوقتي (Phase 4-9)

| المرحلة | الحالة |
|---|---|
| Settings (Developer Controls) | مبني، بيتم إعادة تطبيقه |
| QR (توليد/تشفير AES-256-GCM/طباعة PDF جماعية/Revoke) | مبني ومُختبَر (Unit Tests للـ Token logic)، بيتم إعادة تطبيقه |
| Attendance + Offline Sync | مبني بالكامل (Scan/Manual/Batch Sync بـ idempotency)، **لوحظ وصُحِّح فيه Bug حقيقي** (تضارب أكواد الأخطاء) قبل الفقد |
| iScore | مبني، **لوحظ وصُحِّح فيه Bug حقيقي** (استدعاء خاطئ لـ pagination helper كان هيكسر الـ Build) — هيتبنى تاني من الصفر بنفس الدروس المستفادة |
| Confession | مبني بالكامل (Scan + منع تكرار بنافذة زمنية قابلة للضبط) |
| Weekly Service (أدوار/جداول/نسخ الأسبوع السابق) | مبني بالكامل |
| Preparations (نسخ تاريخية، بدون Overwrite) | الـ Service كان مكتوب، الـ Controller والـ Module لسه |

---

## 3. لسه معمولش خالص
- **Phase 10 — Notifications** (أخبار الكنيسة/المرحلة، استهداف، حالة القراءة)
- **Phase 11 — Anonymous Questions** (فصل الهوية الحقيقية، صلاحيات الإجابة)
- **Phase 12 — Reports + Export** (CSV/Excel، PDF للـ QR فقط)
- ربط كل الموديولات الجديدة في `app.module.ts`
- تحديث `seed.ts` بقواعد نقاط افتراضية وإعدادات النظام
- تحديث `README.md`

---

## 4. خارج نطاق الباك إند تمامًا (لسه ما اتكلمناش نبدأ فيه)
- **Web Admin Dashboard** (React) — مشروع Frontend منفصل بالكامل
- **Android App** (Kotlin) — مشروع منفصل بالكامل، ده اللي هيتجرب فعليًا على الموبايل

---

## 5. قيود بيئة التنفيذ (مهم تعرفها)
- مفيش اتصال إنترنت هنا، يعني مقدرش أعمل `npm install` ولا أشغّل `npm test` فعليًا بنفسي — المراجعة بتتم يدويًا سطر بسطر بدل التشغيل الفعلي.
- الملفات بترجع تتصفّر بين كل رسالة، فأي كود مهم لازم يتزبط في ملف ويتبعت **قبل** ما الرد يخلص، مش يفضل بس جوه بيئة التنفيذ المؤقتة.

---

## الخطوة الجاية
استكمال إعادة بناء Phase 4-9 بالكامل، وبعدين 10/11/12، وتسليم zip واحد نهائي
محدّث لما يخلص كل حاجة.
