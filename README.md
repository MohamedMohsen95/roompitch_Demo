# RoomPitch — AI Concept Co-Pilot (MVP)

أداة للمصمم يستخدمها **وهو قاعد مع العميل**: يصوّر الغرفة → يختار ستايل → يشوف قبل/بعد → يعدّل جزء بالفرشاة → التكلفة تتحسب من أسعاره هو → يطلع عرض سعر PDF بلوجو مكتبه، بالعربي أو الإنجليزي.

> **English summary** at the bottom.

---

## 🧪 تجربة: استوديو الأوضة (فرع `room-studio-test`)

صفحة تجربة منفصلة: المصمم يبني أوضة فاضية من المقاسات، يسحب الخامات والأثاث على المسقط أو الـ 3D، والميزانية بتتحسب لوحدها. زرار **ريندر واقعي** بيبعت لقطة الـ 3D للـ AI (Cloudflare) ويرجع صورة واقعية.

```bash
node dev-server.mjs
```
وافتح <http://localhost:3000/studio.html>. ده نموذج للتجربة بس، مش الكود النهائي.

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

فيه اختيارين. انسخ `.env.example` لملف اسمه `.env` وحط مفاتيح واحد منهم:

### أ) Cloudflare Workers AI — **مجاني للتجربة**
فيه رصيد مجاني يومي (10,000 neuron ≈ حوالي 100 رندر في اليوم)، بيتجدد كل يوم الساعة 12 بالليل UTC.

1. اعمل حساب مجاني على <https://dash.cloudflare.com>.
2. الـ **Account ID**: هتلاقيه في الداشبورد (Workers & Pages → على اليمين)، أو في اللينك بعد `dash.cloudflare.com/`.
3. الـ **API Token**: من <https://dash.cloudflare.com/profile/api-tokens> → **Create Token** → اختار template **Workers AI**.
4. في `.env`:
   ```
   CF_ACCOUNT_ID=الـ_account_id
   CF_API_TOKEN=التوكن
   ```

الموديل: `@cf/black-forest-labs/flux-2-klein-4b` (سريع ورخيص). الجودة أقل شوية من fal، والصورة اللي بتتبعت للموديل بتصغر لأقل من 512 بكسل (شرط عندهم)، والتعديل بالفرشاة بيتلزق على الجزء اللي لونته بس.

### ب) fal.ai — مدفوع، أحسن جودة
1. اعمل حساب على <https://fal.ai> واشحن رصيد صغير (مثلاً 10 دولار).
2. من <https://fal.ai/dashboard/keys> اعمل API key، وحطه في `.env`: `FAL_KEY=المفتاح_بتاعك`

الموديلات: تغيير الستايل `fal-ai/nano-banana/edit`، والتعديل بالفرشاة `fal-ai/flux-pro/v1/fill`.

---

بعدها اقفل السيرفر (Ctrl+C) وشغله تاني. هتلاقي فوق مكتوب **"AI live"**. لو حطيت الاتنين، Cloudflare هو اللي هيشتغل (أو اختار بـ `AI_PROVIDER=fal`).

> ⚠️ **التكلفة:** على fal كل رندر بيتخصم من رصيدك. على Cloudflare لما الرصيد المجاني اليومي يخلص هيظهرلك رسالة، ولو فعلت الخطة المدفوعة (Workers Paid) هيتحسب عليك.

## 🚀 3. ارفعه على Vercel

1. ارفع فولدر `roompitch` على GitHub (repo جديد). **الملف `.env` مش هيترفع** — وده مقصود عشان مفتاحك يفضل سري.
2. ادخل <https://vercel.com/new> واختار الـ repo. سيب كل الإعدادات زي ما هي واضغط **Deploy**.
3. من **Project → Settings → Environment Variables** ضيف:
   - `CF_ACCOUNT_ID` و `CF_API_TOKEN` (أو `FAL_KEY`)
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

**Run locally:** `node dev-server.mjs` → http://localhost:3000 (Node 18+, no dependencies). Without any AI keys it runs in demo mode.

**Real AI (free to try):** set `CF_ACCOUNT_ID` + `CF_API_TOKEN` in `.env` to use Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`, roughly 100 free renders/day). Input photos are downscaled below 512px (a Workers AI limit) and brush edits are composited into the painted area in the browser.

**Real AI (paid, best quality):** set `FAL_KEY`. Restyle uses `fal-ai/nano-banana/edit`; brush edits use `fal-ai/flux-pro/v1/fill` (override with `FAL_RESTYLE_MODEL` / `FAL_INPAINT_MODEL`). If both are set, Cloudflare is used unless `AI_PROVIDER=fal`.

**Deploy:** push to GitHub → import on Vercel → add the AI keys and (strongly recommended) `ACCESS_CODE` env vars → redeploy. `api/generate.js` runs as a Vercel serverless function (60s max).

**MVP limits:** settings live in the browser (localStorage); renders aren't saved; no accounts, payments or floor-plan parsing yet; PDF goes through the browser's print dialog.
