# RoomPitch — AI Concept Co-Pilot (MVP)

أداة للمصمم يستخدمها **وهو قاعد مع العميل**: يصوّر الغرفة → يختار ستايل → يشوف قبل/بعد → يعدّل جزء بالفرشاة → التكلفة تتحسب من أسعاره هو → يطلع عرض سعر PDF بلوجو مكتبه، بالعربي أو الإنجليزي.

> **English summary** at the bottom.

---

## ⚙️ Requirements & setup · المتطلبات والتشغيل

### Requirements · المتطلبات
| | Version | Check |
|---|---|---|
| **Node.js** | **20.19 or newer** (Vite 8 needs it) | `node -v` |
| **npm** | comes with Node | `npm -v` |
| **Git** | any recent version | `git --version` |

No database and no other services. AI keys are optional: without them the app runs in **demo mode**.

### First-time setup · أول مرة
```bash
git clone https://github.com/MohamedMohsen95/roompitch_Demo.git
cd roompitch_Demo
npm install
```
Optional, for real AI renders (see [section 2](#-2-شغّل-الذكاء-الاصطناعي-الحقيقي)):
```bash
cp .env.example .env
```
Then fill in `CF_ACCOUNT_ID` and `CF_API_TOKEN` (free) or `FAL_KEY` (paid) in `.env`. Never commit `.env`; it's already in `.gitignore`.

### Run · التشغيل
```bash
npm run dev
```
| Page | URL |
|---|---|
| Main app (photo restyle, budget, PDF) | <http://localhost:5173> |
| Room Studio (2D plan + 3D) | <http://localhost:5173/studio.html> |

The top-right badge says **AI live** when keys are set, **Demo mode** otherwise. After editing `.env`, stop the server (Ctrl+C) and run it again.

### All commands
| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload; also runs the `api/` functions locally |
| `npm run build` | Production build into `dist/` (what Vercel runs) |
| `npm run preview` | Serves the production build locally, to test it before deploying |
| `npm run models` | Compresses 3D models from `models-src/` into `public/models/` |

### Already had an older copy? · عندك نسخة قديمة؟
The project moved from `node dev-server.mjs` to Vite. After `git pull`:
```bash
npm install
npm run dev
```
`dev-server.mjs` is gone, and the port changed from 3000 to **5173**.

### Troubleshooting
- **`npm run dev` fails with a Node version error:** update Node to 20.19+ (<https://nodejs.org>, LTS).
- **Port 5173 is busy:** Vite picks the next free port; use the URL it prints.
- **Badge says Demo mode although `.env` has keys:** restart `npm run dev`; `.env` is only read at startup.
- **"AI key rejected":** the Cloudflare token needs the *Workers AI* permission and must match `CF_ACCOUNT_ID`.
- **"Today's free AI allowance is used up":** Cloudflare's free 10,000 neurons/day reset at 00:00 UTC.

**بالعربي باختصار:** محتاج Node.js 20.19 أو أحدث. أول مرة: `npm install`، وبعدها كل مرة: `npm run dev` وافتح <http://localhost:5173> (التطبيق) أو <http://localhost:5173/studio.html> (استوديو الأوضة). لو عايز رندر حقيقي بالذكاء الاصطناعي، انسخ `.env.example` لـ `.env` وحط المفاتيح (شوف القسم 2). لو عندك نسخة قديمة: بعد `git pull` شغّل `npm install` مرة، و`node dev-server.mjs` اتشال.

---

## 🧪 استوديو الأوضة (تجربة)

صفحة تجربة منفصلة: المصمم يبني أوضة فاضية من المقاسات، يسحب الخامات والأثاث على المسقط أو الـ 3D، والميزانية بتتحسب لوحدها. زرار **ريندر واقعي** بيبعت لقطة الـ 3D للـ AI (Cloudflare) ويرجع صورة واقعية.

افتح <http://localhost:5173/studio.html> بعد `npm run dev`. ده نموذج للتجربة بس، مش الكود النهائي.

الـ 3D مبني على **three.js** (أحدث نسخة) و **Vite**، والإضاءة من صورة HDRI حقيقية (Poly Haven) عشان الخامات تبان واقعية. من قائمة **Lighting** في لوحة الـ 3D المصمم يختار الإضاءة: نهار (Daylight)، دافية (Warm interior)، أو ستوديو (Studio). الرندر بالذكاء الاصطناعي بياخد نفس الإضاءة.

**الشبابيك والأبواب:** من تبويب **Windows & doors** اسحب شباك أو باب على أي حيطة (في المسقط أو الـ 3D)، وحركه على الحيطة أو لحيطة تانية بالسحب في المسقط. لما تختاره تقدر تغير العرض والارتفاع والارتفاع من الأرض. مساحة الدهان في الميزانية بتطرح الفتحات لوحدها.

**الشمس:** الحيطان بقت حيطان حقيقية بسُمك وفتحات، فالشمس بتدخل من الشبابيك بس. من شريط **Sun** تحت الـ 3D اختار الساعة، واتجاه الحيطة اللي فوق في المسقط (Back wall faces)، والموسم — وبقعة الشمس بتتحرك على الأرضية زي الحقيقة (محسوبة لخط عرض القاهرة).

**إضافة أثاث 3D:** حط الموديل الأصلي (`.gltf` بملفاته، أو `.glb`) في `models-src/<فولدر>/` وبعدين شغّل:
```bash
npm run models
```
ده بيضغط الموديل (مثلاً 5 ميجا ← 200 كيلو) ويحطه في `public/models/`، وبيظهر لوحده في مكتبة الأثاث بمقاساته الحقيقية.

---

## 🗂️ الملفات

| الملف | وظيفته |
|---|---|
| `index.html` | شكل الصفحة |
| `styles.css` | الألوان والتصميم (الألوان كلها متعرفة فوق في أول الملف) |
| `app.js` | كل منطق التطبيق: الستايلات، الرندر، الفرشاة، الميزانية، الـ PDF |
| `i18n.js` | كل الكلام اللي في الواجهة بالعربي والإنجليزي — عدّل الكلام من هنا |
| `studio.html` + `src/studio/` | استوديو الأوضة (المسقط + الـ 3D)، مقسوم لملفات صغيرة — الخريطة في أول `src/studio/main.js` |
| `api/generate.js` | السيرفر: بيكلم الذكاء الاصطناعي ويخبي مفتاحك السري |
| `api/models.js` | بيقرا موديلات الأثاث من `public/models/` |
| `models-src/` | الموديلات الأصلية (مش بتترفع على الموقع) |
| `public/models/` | الموديلات المضغوطة اللي الموقع بيستخدمها (`npm run models`) |
| `public/hdri/` | صور الإضاءة HDRI |
| `scripts/optimize-models.mjs` | سكريبت ضغط الموديلات |
| `vite.config.js` | إعدادات Vite (بيشغل الصفحتين و `api/` على جهازك) |
| `.env.example` | مثال للإعدادات السرية |

المتطلبات وطريقة التشغيل في [أول الملف](#️-requirements--setup--المتطلبات-والتشغيل).

---

## ▶️ 1. شغّله على جهازك (وضع تجريبي)

```bash
cd roompitch_Demo
npm install
npm run dev
```

افتح <http://localhost:5173>. التطبيق هيشتغل في **الوضع التجريبي**: كل حاجة شغالة (الرفع، الستايلات، الفرشاة، الميزانية، الـ PDF)، بس "الرندر" مجرد تلوين للصورة ومكتوب عليه DEMO. ده كفاية عشان تجرب التجربة كلها.

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

1. الكود على GitHub بالفعل. **الملف `.env` مش بيترفع** — وده مقصود عشان مفتاحك يفضل سري.
2. ادخل <https://vercel.com/new> واختار الـ repo. Vercel هيعرف إنه مشروع Vite لوحده؛ سيب كل الإعدادات زي ما هي واضغط **Deploy**.
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

**What it is:** a web app (Vite + three.js) for interior designers to use live with clients — upload a room photo, restyle it with AI (8 styles, 3 structure-preservation levels, "site under construction" option), compare before/after, brush-edit one area, get an itemized estimate from the designer's own price list, and export a branded A4 proposal in English or Arabic (RTL).

**Run locally:** `npm install`, then `npm run dev` → http://localhost:5173 (main app) and `/studio.html` (Room Studio). Needs Node 20.19+. Vite also runs the `api/` functions locally, like Vercel does. `npm run build` + `npm run preview` serves the production build. Without any AI keys it runs in demo mode.

**3D models:** put the original `.gltf` (with its files) or `.glb` in `models-src/<folder>/` and run `npm run models`. It writes a compressed `.glb` (Meshopt geometry, WebP textures ≤1024 px) to `public/models/<folder>/`; the desk went from 5.25 MB to 185 KB. Everything in `public/models/` appears in the Room Studio library with its real size.

**Lighting:** a **Lighting** picker in the 3D panel offers moods — *Daylight*, *Warm interior* and *Studio (even)*. Each sets an HDRI from Poly Haven (`public/hdri/`, CC0) for ambient light and reflections, the sun's colour and strength (shadows), the fill light and exposure, and how the light is described to the AI renderer. The choice is remembered per browser; `studio.html?lighting=warm` opens with a given mood. Add a mood in `src/studio/three/lighting.js`.

**Windows & doors:** the *Windows & doors* library tab has a window, wide window, glass/balcony door and door. Drop one on any wall (plan or 3D), drag it along a wall or onto another wall in the plan, and set width, height and sill height in the inspector. Openings are real holes in the walls, never overlap or run past a corner, are subtracted from paintable wall area, and are described to the AI renderer. Logic: `src/studio/openings.js`.

**Sun:** walls are solid (12 cm) with real openings and, with a hidden ceiling, cast shadows, so sunlight only enters through windows and glass doors. The **Sun** bar under the 3D header sets the time of day, which way the back wall (top of the plan) faces, and the season; the sun follows a real solar path for Cairo's latitude (`src/studio/three/sun.js`) and the plan shows a north arrow. Walls between the camera and the room are hidden dollhouse-style but still cast shadows. The lighting mood tints the sun, and the AI prompt says where the sun is and which windows it shines through.

**Studio code:** `src/studio/` — one module per concern (catalog, state, library, inspector, plan, estimate, `three/` scene/room/items/models/interaction, AI render). The map is at the top of `src/studio/main.js`.

**Real AI (free to try):** set `CF_ACCOUNT_ID` + `CF_API_TOKEN` in `.env` to use Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`, roughly 100 free renders/day). Input photos are downscaled below 512px (a Workers AI limit) and brush edits are composited into the painted area in the browser.

**Real AI (paid, best quality):** set `FAL_KEY`. Restyle uses `fal-ai/nano-banana/edit`; brush edits use `fal-ai/flux-pro/v1/fill` (override with `FAL_RESTYLE_MODEL` / `FAL_INPAINT_MODEL`). If both are set, Cloudflare is used unless `AI_PROVIDER=fal`.

**Deploy:** push to GitHub → import on Vercel → add the AI keys and (strongly recommended) `ACCESS_CODE` env vars → redeploy. Vercel detects Vite, runs `npm run build` and serves `dist/`; the files in `api/` run as serverless functions (`api/generate.js` has 60s max).

**MVP limits:** settings live in the browser (localStorage); renders aren't saved; no accounts, payments or floor-plan parsing yet; PDF goes through the browser's print dialog.
