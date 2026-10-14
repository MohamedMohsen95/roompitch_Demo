# RoomPitch — AI Concept Co-Pilot (MVP)

أداة للمصمم يستخدمها **وهو قاعد مع العميل**: يصوّر الغرفة → يختار ستايل → يشوف قبل/بعد → يعدّل جزء بالفرشاة → التكلفة تتحسب من أسعاره هو → يطلع عرض سعر PDF بلوجو مكتبه، بالعربي أو الإنجليزي.

> **English summary** at the bottom.

---

## 🗂️ الملفات

| الملف | وظيفته |
|---|---|
| `index.html` | شكل الصفحة |
| `styles.css` | الألوان والتصميم (الألوان كلها متعرفة فوق في أول الملف) |
| `app.js` | كل منطق التطبيق: الستايلات، الرندر، الفرشاة، الميزانية، الـ PDF |
| `i18n.js` | كل الكلام اللي في الواجهة بالعربي والإنجليزي — عدّل الكلام من هنا |
| `api/generate.js` | السيرفر: بيكلم الذكاء الاصطناعي ويخبي مفتاحك السري |
| `dev-server.mjs` | عشان تشغل التطبيق على جهازك |
| `.env.example` | مثال للإعدادات السرية |

مفيش أي حاجة محتاجة `npm install`. محتاج بس **Node.js 18 أو أحدث**.

---

## ▶️ 1. شغّله على جهازك (وضع تجريبي)

```bash
cd roompitch
node dev-server.mjs
```

افتح <http://localhost:3000>. التطبيق هيشتغل في **الوضع التجريبي**: كل حاجة شغالة (الرفع، الستايلات، الفرشاة، الميزانية، الـ PDF)، بس "الرندر" مجرد تلوين للصورة ومكتوب عليه DEMO. ده كفاية عشان تجرب التجربة كلها.

## 🔑 2. شغّل الذكاء الاصطناعي الحقيقي

1. اعمل حساب على <https://fal.ai> واشحن رصيد صغير (مثلاً 10 دولار).
2. من <https://fal.ai/dashboard/keys> اعمل API key.
3. انسخ `.env.example` لملف اسمه `.env` وحط المفتاح:
   ```
   FAL_KEY=المفتاح_بتاعك
   ```
4. اقفل السيرفر (Ctrl+C) وشغله تاني. هتلاقي فوق مكتوب **"AI live"**.

**الموديلات المستخدمة** (تقدر تغيرها من `.env` من غير ما تلمس الكود):
- تغيير الستايل: `fal-ai/nano-banana/edit` (بيحافظ على شكل الغرفة كويس جداً)
- التعديل بالفرشاة: `fal-ai/flux-pro/v1/fill`

> ⚠️ **التكلفة:** كل رندر بيتخصم من رصيدك على fal.ai. شوف الأسعار الحالية في صفحة كل موديل، واحسب إن اشتراك المصمم يغطيها.

## 🚀 3. ارفعه على Vercel

1. ارفع فولدر `roompitch` على GitHub (repo جديد). **الملف `.env` مش هيترفع** — وده مقصود عشان مفتاحك يفضل سري.
2. ادخل <https://vercel.com/new> واختار الـ repo. سيب كل الإعدادات زي ما هي واضغط **Deploy**.
3. من **Project → Settings → Environment Variables** ضيف:
   - `FAL_KEY` = مفتاحك
   - `ACCESS_CODE` = أي كود سري (اختياري لكن **مهم جداً**: من غيره أي حد يعرف اللينك يقدر يصرف من رصيدك)
4. اعمل **Redeploy** عشان الإعدادات تشتغل.
5. لو حطيت `ACCESS_CODE`: افتح التطبيق → **Studio** → اكتب نفس الكود.

---

## 🧭 إزاي تستخدمه في اجتماع مع عميل

1. **مرة واحدة قبل أي اجتماع:** افتح **Price list** وحط أسعارك (المتر المربع للأرضيات والدهانات والجبس، وأسعار القطع) والعملة والضريبة. وافتح **Studio** وحط اسم المكتب واللوجو.
2. صوّر الغرفة أو ارفع صورتها، واختار نوع الغرفة ومقاساتها.
3. اختار ستايل واضغط **Generate**، أو **3 styles at once** عشان العميل يختار.
4. حرّك الخط في النص عشان تقارن **قبل/بعد**.
5. العميل عايز يغير الكنبة بس؟ **Edit an area** → لوّن عليها → اكتب التعديل → **Apply**.
6. اختار مستوى التشطيب، وعدّل الكميات لو محتاج.
7. اكتب اسم العميل واضغط **Export PDF** → اختار **Save as PDF**.

---

## ⚠️ حدود النسخة دي (MVP) — اعرفها قبل ما تبيع

- **الإعدادات بتتحفظ على الجهاز بس** (الأسعار والمكتب). مفيش حسابات ولا تسجيل دخول لسه.
- **الصور مش بتتحفظ:** لو قفلت الصفحة، الرندرات بتروح. نزّل الـ PDF قبل ما تقفل.
- **قراءة المساقط الـ 2D أوتوماتيك مش موجودة** — المقاسات بتدخل باليد (زي ما اتفقنا).
- **التكلفة تقديرية** من أسعار المصمم والمقاسات؛ مساحة الحوائط محسوبة بخصم 15% للأبواب والشبابيك.
- الـ PDF بيطلع من نافذة الطباعة في المتصفح (أدق حاجة للعربي)، يعني ضغطتين مش ضغطة واحدة.
- الرندر صورة واقعية 2D، **مش موديل 3D**.

## 🛣️ الخطوات الجاية المقترحة

1. تجربة مع 5 مصممين حقيقيين — قيس: الرندر بياخد كام ثانية؟ العميل انبهر؟ المصمم قفل البيعة؟
2. حسابات للمصممين + حفظ المشاريع (مثلاً Supabase).
3. الدفع والاشتراكات (بعد ما حد يقول "أنا هدفع").
4. بعدها: المساقط الـ 2D، وكتالوجات المعارض.

---

## English summary

**What it is:** a no-build web app for interior designers to use live with clients — upload a room photo, restyle it with AI (8 styles, 3 structure-preservation levels, "site under construction" option), compare before/after, brush-edit one area, get an itemized estimate from the designer's own price list, and export a branded A4 proposal in English or Arabic (RTL).

**Run locally:** `node dev-server.mjs` → http://localhost:3000 (Node 18+, no dependencies). Without `FAL_KEY` it runs in demo mode.

**Real AI:** put `FAL_KEY=...` in `.env`. Restyle uses `fal-ai/nano-banana/edit`; brush edits use `fal-ai/flux-pro/v1/fill` (override with `FAL_RESTYLE_MODEL` / `FAL_INPAINT_MODEL`).

**Deploy:** push to GitHub → import on Vercel → add `FAL_KEY` and (strongly recommended) `ACCESS_CODE` env vars → redeploy. `api/generate.js` runs as a Vercel serverless function (60s max).

**MVP limits:** settings live in the browser (localStorage); renders aren't saved; no accounts, payments or floor-plan parsing yet; PDF goes through the browser's print dialog.
