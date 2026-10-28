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

Everything else is optional. Without AI keys the app runs in **demo mode**; without Supabase keys rooms are saved only in the browser, and there are no accounts, projects list or model uploads.

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

For accounts and cloud saving, create `.env.local` with the two Supabase values (Supabase → Project Settings → API keys, or ask a teammate; both are safe to share inside the team):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
That's all a designer or front-end developer needs. See [Working with Supabase as a team](#working-with-supabase-as-a-team) for database changes and admin tasks.

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
| `npm run textures` | Downloads the photo textures the catalog names (Poly Haven, CC0) into `public/textures/` |
| `npm test` | Runs the automated tests (room geometry, saving, photo analysis); needs no install |
| `npm run db:generate -- --name=<what>` | Writes a migration into `supabase/migrations/` from changes in `db/schema.js` |
| `npm run db:custom -- --name=<what>` | Empty migration for SQL Drizzle can't express (triggers, functions) |
| `npm run db:push` | Applies new migrations to the linked Supabase project |
| `npm run db:studio` | Browse the database (needs `DATABASE_URL` in `.env.local`) |
| `npm run catalog:sync` | Publishes the built-in catalog to Supabase: optimises new models, uploads them, adds missing rows |
| `npm run admin -- grant <email>` | Makes an account an admin (`revoke <email>`, `list`) |

### Working with Supabase as a team
There is **one** Supabase project, used by the live site and by everyone's `npm run dev`. Rooms you save while developing are real rows, and a migration you push changes the live database straight away.

| You want to… | You need | Ask for |
|---|---|---|
| Run the studio with accounts, projects and uploads | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` | the values (not secret) |
| Change tables (`db/schema.js`) and push migrations | the above, plus membership of the Supabase organisation for `npx supabase login` / `link` | an invite to the Supabase project |
| Browse data with `npm run db:studio` | `DATABASE_URL` (Supabase → Connect → Session pooler) | the database password |
| Add built-in 3D models (`catalog:sync`) or make admins (`npm run admin`) | `SUPABASE_SECRET_KEY` | the secret key, only for people who need it |

Rules: the secret key and `DATABASE_URL` never get a `NEXT_PUBLIC_` or `VITE_` prefix (those reach the browser) and never go in git. Only `.env.example` is committed. Before `npm run db:push`, read the generated SQL and tell the team, since it hits the live database. Pull before generating a migration, so two people don't write migrations from different schemas.

### Accounts and admins
Visitors start as anonymous Supabase users, which is enough to design and save rooms. **Sign in** (top bar) with email and password to upload your own 3D models; they're private to your account. **Admins** can also upload to the built-in catalog that everyone sees ("Who sees it" in the upload dialog).

- Make someone an admin after they've created an account: `npm run admin -- grant you@studio.com` (`revoke`, `list` too). Users can't change their own role.
- Supabase → Authentication → Sign In / Providers → Email: with **Confirm email** on, new accounts get a confirmation link first. Supabase's built-in email service only delivers to your project's team members and a few emails an hour; set up custom SMTP (Authentication → Emails) before real designers sign up.
- Add your site's URL (and `http://localhost:5173/studio.html`) under Authentication → URL Configuration so confirmation links come back to the studio.

### Adding a built-in 3D model
1. Put the model in `models-src/<folder>/` (a `.glb`, or a `.gltf` with its files) with a `CREDITS.md` saying where it's from and its licence.
2. `npm run catalog:sync`

That compresses it into `public/models/`, uploads it to the `catalog` bucket under `builtin/`, and adds its `catalog_items` row with the size measured from the model. Needs `SUPABASE_SECRET_KEY` in `.env.local` (Supabase → Project Settings → API keys); never give that key a `NEXT_PUBLIC_` or `VITE_` prefix. Rows already in Supabase are left alone, so prices or names edited in the dashboard stay; `--update` overwrites them from code, `--dry-run` shows what would happen.

### Adding a photo texture (walls, floors, rugs, doors)
Finishes and rugs can use a real photo texture instead of the drawn ones:
1. Pick a texture on <https://polyhaven.com/textures> (all CC0) and note its id from the URL, e.g. `herringbone_parquet`, and its real size (shown on the page, e.g. 3.4 m).
2. In [`src/studio/catalog.js`](src/studio/catalog.js), add an entry with `tex:"herringbone_parquet", tile:3.4` (`turn:true` turns it a quarter, e.g. for vertical wood grain). Door leaves use `OPENING_TEX`.
3. `npm run catalog:sync` downloads it into `public/textures/<id>/` (1024 px WebP colour, normal and roughness maps, plus `CREDITS.md`), uploads it to the `catalog` bucket and adds the row.

### Database (Supabase + Drizzle)
Tables and their RLS policies are defined in [`db/schema.js`](db/schema.js). Never edit a migration by hand that drizzle-kit wrote; change the schema and generate a new one:
1. Edit `db/schema.js`.
2. `npm run db:generate -- --name=add_client_name` and read the SQL it wrote.
3. Once per machine: `npx supabase login`, then `npx supabase link --project-ref <ref>`.
4. `npm run db:push`.

If a migration was run by pasting it into the Supabase SQL Editor, tell the CLI it's done so `db:push` skips it: `npx supabase migration repair --status applied <timestamp>`.

### Deploying (push to main)
Every push to `main` deploys to Vercel production through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml); other branches never deploy. Once, a repo admin adds three secrets under GitHub → Settings → Secrets and variables → Actions:

| Secret | Where to find it |
|---|---|
| `VERCEL_TOKEN` | <https://vercel.com/account/tokens> → Create |
| `VERCEL_ORG_ID` | Vercel → Team Settings → General → Team ID (or `orgId` in `.vercel/project.json` after `npx vercel link`) |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → General → Project ID (or `projectId` in the same file) |

Then GitHub → Actions → **Deploy to Vercel** → **Run workflow** deploys `main` without a new push. The site's environment variables (AI keys, `ACCESS_CODE`, the two `NEXT_PUBLIC_SUPABASE_*` values) live in Vercel → Project → Settings → Environment Variables, not in GitHub; the Supabase integration fills the Supabase ones. The secret key and `DATABASE_URL` are never needed on Vercel.

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

أول ما تفتح الاستوديو بتظهر شاشة **"أوضة جديدة"** فيها طريقين:
- **"هبني الأوضة بنفسي":** تختار مستطيل أو حرف L، وتكتب المقاسات **بالسنتيمتر**، وتضيف أبواب وشبابيك بالعدد اللي عايزه (وتسحبهم على الحيطة في المعاينة). البرنامج بيمنعك تكمّل لو فيه باب أطول من الحيطة أو فتحتين فوق بعض.
- **"معايا صور للأوضة":** نفس اللي فوق، بس ترفع صورة لكل حيطة (لحد 8 صور) وتحدد كل صورة لأنهي حيطة، وتدوس **"حدد الأبواب والشبابيك"**: موديل Cloudflare بيدوّر عليهم في الصور، والنتيجة بتظهر في الفورم متعلّمة "حدده الـ AI" عشان تراجعها. الموديل بيتغير من `CF_VISION_MODEL` في `.env`.

بعد "ابدأ التصميم" بتدخل الاستوديو: المصمم يسحب الخامات والأثاث على المسقط أو الـ 3D، والحيطان مترقّمة، والميزانية بتتحسب لوحدها. زرار **"إعدادات الأوضة"** بيرجّعك للشاشة الأولى من غير ما يضيع الأثاث. الأوضة بتتحفظ في المتصفح، ولما تفتح تاني هتلاقي **"أكمل آخر غرفة"**. زرار **ريندر واقعي** بيبعت لقطة الـ 3D للـ AI (Cloudflare) ويرجع صورة واقعية.

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

**Room Studio first screen:** "New room" — build a rectangle or L-shape in centimetres with any number of doors and windows, or upload up to 8 photos (one per wall), tag each with its wall and let a Cloudflare vision model (`CF_VISION_MODEL`, default `@cf/meta/llama-4-scout-17b-16e-instruct`, via `api/analyze.js`) place the doors and windows for review. The room is saved in the browser (photos in IndexedDB). `npm test` runs the Node tests in `tests/`.

**Lighting:** a **Lighting** picker in the 3D panel offers moods — *Daylight*, *Warm interior* and *Studio (even)*. Each sets an HDRI from Poly Haven (`public/hdri/`, CC0) for ambient light and reflections, the sun's colour and strength (shadows), the fill light and exposure, and how the light is described to the AI renderer. The choice is remembered per browser; `studio.html?lighting=warm` opens with a given mood. Add a mood in `src/studio/three/lighting.js`.

**Windows & doors:** the *Windows & doors* library tab has a window, wide window, glass/balcony door and door. Drop one on any wall (plan or 3D), drag it along a wall or onto another wall in the plan, and set width, height and sill height in the inspector. These are the same openings as on the New room screen.

**Furniture height & stacking:** pieces rest automatically on the floor or on the surface below them — tables, cabinets, the bed, table-height 3D models (a vase on the coffee table, a lamp on a desk). Moving a table carries what is on it; deleting it lets things fall. Dropping a small piece on a surface stacks it instead of replacing it (rugs are never replaced). To pin a height by hand (e.g. a wall-mounted TV): **Shift + drag** in 3D, the *From floor* field, or PageUp / PageDown; **Rest on surface** in the inspector turns automatic stacking back on. Raised pieces show a dashed outline and ↑height in the plan. Rules: `src/studio/stacking.js`.

**Sun:** walls are solid (12 cm) with real openings and, with a hidden ceiling, cast shadows, so sunlight only enters through windows and glass doors. The **Sun** bar under the 3D header sets the time of day, which way the top of the plan faces, and the season; the sun follows a real solar path for Cairo's latitude (`src/studio/three/sun.js`) and the plan shows a north arrow. Walls between the camera and the room are hidden dollhouse-style but still cast shadows. The lighting mood tints the sun, and the AI prompt says where the sun is and which windows it shines through.

**Studio code:** `src/studio/` — one module per concern (catalog, state, library, inspector, plan, estimate, `three/` scene/room/items/models/interaction, AI render). The map is at the top of `src/studio/main.js`.

**Real AI (free to try):** set `CF_ACCOUNT_ID` + `CF_API_TOKEN` in `.env` to use Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`, roughly 100 free renders/day). Input photos are downscaled below 512px (a Workers AI limit) and brush edits are composited into the painted area in the browser.

**Real AI (paid, best quality):** set `FAL_KEY`. Restyle uses `fal-ai/nano-banana/edit`; brush edits use `fal-ai/flux-pro/v1/fill` (override with `FAL_RESTYLE_MODEL` / `FAL_INPAINT_MODEL`). If both are set, Cloudflare is used unless `AI_PROVIDER=fal`.

**Deploy:** push to GitHub → import on Vercel → add the AI keys and (strongly recommended) `ACCESS_CODE` env vars → redeploy. Vercel detects Vite, runs `npm run build` and serves `dist/`; the files in `api/` run as serverless functions (`api/generate.js` has 60s max).

**MVP limits:** settings live in the browser (localStorage); renders aren't saved; no accounts, payments or floor-plan parsing yet; PDF goes through the browser's print dialog.
