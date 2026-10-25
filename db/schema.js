// The Supabase database, described for Drizzle. Change a table here, then run `npm run db:generate`:
// drizzle-kit writes the SQL migration into supabase/migrations, and `npm run db:push` applies it.
// Drizzle doesn't model triggers, functions, storage buckets or seed rows; those live in hand-written
// migrations (`npm run db:custom -- --name=<what>`), e.g. *_triggers_and_storage.sql.
//
// The browser never uses Drizzle: it talks to Supabase with supabase-js, and these RLS policies decide
// which rows each signed-in user (anonymous ones too) may see and change.
// Files (photos, renders, logos, PDFs, models) live in Storage; tables keep only their paths:
//   bucket "files"   (private)  <user id>/...                      the designer's own files
//   bucket "catalog" (public)   builtin/<folder>/<model>.glb       RoomPitch's built-in models
import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, jsonb, timestamp, integer, real, numeric, boolean,
  index, foreignKey, primaryKey, check, pgPolicy
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

const tz = {withTimezone:true};
const createdAt = () => timestamp("created_at", tz).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", tz).notNull().defaultNow();   // kept current by a touch_* trigger
// Rows belong to whoever inserts them. Not authUid: a DEFAULT can't hold its (select ...).
const owner = () => uuid("owner").notNull().default(sql`auth.uid()`);
const ownerFk = (t, table) => foreignKey({name:`${table}_owner_fkey`, columns:[t.owner], foreignColumns:[authUsers.id]}).onDelete("cascade");
const oneOf = (name, col, values) => check(name, sql`${col} in (${sql.raw(values.map(v => `'${v}'`).join(", "))})`);

// The four policies every private table has: a signed-in user reads and changes only their own rows.
const own = (t) => sql`${t.owner} = ${authUid}`;
const ownRows = (t, what) => [
  pgPolicy(`read own ${what}`,   {for:"select", to:authenticatedRole, using:own(t)}),
  pgPolicy(`add own ${what}`,    {for:"insert", to:authenticatedRole, withCheck:own(t)}),
  pgPolicy(`change own ${what}`, {for:"update", to:authenticatedRole, using:own(t), withCheck:own(t)}),
  pgPolicy(`delete own ${what}`, {for:"delete", to:authenticatedRole, using:own(t)})
];

/* ── The designer ── */

// One row per user, made by the on_auth_user_created trigger. Replaces the studio part of the settings.
export const profiles = pgTable("profiles", {
  id:           uuid("id").primaryKey().default(sql`auth.uid()`),
  studioName:   text("studio_name"),
  designerName: text("designer_name"),
  phone:        text("phone"),
  email:        text("email"),
  logoPath:     text("logo_path"),                          // files: <user id>/logo.png
  currency:     text("currency").notNull().default("EGP"),
  feePct:       numeric("fee_pct", {precision:5, scale:2}).notNull().default("0"),
  vatPct:       numeric("vat_pct", {precision:5, scale:2}).notNull().default("0"),
  // "admin" manages the built-in catalog. Users can't change it themselves (profiles_guard_role trigger);
  // grant it with `npm run admin -- grant <email>`.
  role:         text("role").notNull().default("designer"),
  createdAt:    createdAt(),
  updatedAt:    updatedAt()
}, (t) => [
  foreignKey({name:"profiles_id_fkey", columns:[t.id], foreignColumns:[authUsers.id]}).onDelete("cascade"),
  oneOf("profiles_role_check", t.role, ["designer", "admin"]),
  pgPolicy("read own profile",   {for:"select", to:authenticatedRole, using:sql`${t.id} = ${authUid}`}),
  pgPolicy("add own profile",    {for:"insert", to:authenticatedRole, withCheck:sql`${t.id} = ${authUid}`}),
  pgPolicy("change own profile", {for:"update", to:authenticatedRole, using:sql`${t.id} = ${authUid}`, withCheck:sql`${t.id} = ${authUid}`})
]);

// The designer's own price for a catalog item (missing = the item's default price).
// item_id has no foreign key: the photo-restyle app prices its own line ids (lighting, curtains, ...).
export const prices = pgTable("prices", {
  owner:     owner(),
  itemId:    text("item_id").notNull(),
  price:     numeric("price", {precision:12, scale:2}).notNull(),
  updatedAt: updatedAt()
}, (t) => [
  primaryKey({name:"prices_pkey", columns:[t.owner, t.itemId]}),
  ownerFk(t, "prices"),
  check("prices_price_check", sql`${t.price} >= 0`),
  ...ownRows(t, "prices")
]);

export const clients = pgTable("clients", {
  id:        uuid("id").primaryKey().defaultRandom(),
  owner:     owner(),
  name:      text("name").notNull(),
  phone:     text("phone"),
  email:     text("email"),
  notes:     text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  ownerFk(t, "clients"),
  index("clients_owner_name").on(t.owner, t.name),
  ...ownRows(t, "clients")
]);

/* ── Work ── */

// A studio room (kind "studio": data is what room-store.js saves) or a photo restyle (kind "restyle").
export const projects = pgTable("projects", {
  id:            uuid("id").primaryKey().defaultRandom(),
  owner:         owner(),
  clientId:      uuid("client_id").references(() => clients.id, {onDelete:"set null"}),
  kind:          text("kind").notNull().default("studio"),
  name:          text("name").notNull().default("Untitled room"),
  status:        text("status").notNull().default("draft"),
  data:          jsonb("data").notNull(),
  thumbnailPath: text("thumbnail_path"),
  createdAt:     createdAt(),
  updatedAt:     updatedAt()
}, (t) => [
  ownerFk(t, "projects"),
  oneOf("projects_kind_check", t.kind, ["studio", "restyle"]),
  oneOf("projects_status_check", t.status, ["draft", "sent", "won", "lost"]),
  index("projects_owner_updated").on(t.owner, t.updatedAt.desc()),
  ...ownRows(t, "projects")
]);

// Room photos (studio: one per wall) and the original photo of a restyle.
export const projectPhotos = pgTable("project_photos", {
  id:        uuid("id").primaryKey().defaultRandom(),
  owner:     owner(),
  projectId: uuid("project_id").notNull().references(() => projects.id, {onDelete:"cascade"}),
  path:      text("path").notNull(),                        // files: <user id>/<project id>/photos/...
  wall:      integer("wall"),                               // which wall it shows; null = not assigned
  position:  integer("position").notNull().default(0),
  createdAt: createdAt()
}, (t) => [
  ownerFk(t, "project_photos"),
  index("project_photos_project").on(t.projectId, t.position),
  ...ownRows(t, "project photos")
]);

// Every AI render. Also the AI usage log, so a row stays when its project is deleted, and only the
// server (api/generate.js, with the secret key) writes rows: users could otherwise delete their usage.
export const renders = pgTable("renders", {
  id:        uuid("id").primaryKey().defaultRandom(),
  owner:     owner(),
  projectId: uuid("project_id").references(() => projects.id, {onDelete:"set null"}),
  path:      text("path"),                                  // files: <user id>/<project id>/renders/...
  source:    text("source").notNull(),
  styleId:   text("style_id"),
  prompt:    text("prompt"),
  provider:  text("provider"),                              // cloudflare | fal | demo
  model:     text("model"),
  createdAt: createdAt()
}, (t) => [
  ownerFk(t, "renders"),
  oneOf("renders_source_check", t.source, ["studio", "restyle", "edit"]),
  index("renders_owner_created").on(t.owner, t.createdAt.desc()),
  index("renders_project").on(t.projectId),
  pgPolicy("read own renders", {for:"select", to:authenticatedRole, using:own(t)})
]);

// A proposal as sent: the estimate is frozen in snapshot, so later price changes don't rewrite it.
// Clients open it without signing in through an api/ function that looks up share_token.
export const proposals = pgTable("proposals", {
  id:         uuid("id").primaryKey().defaultRandom(),
  owner:      owner(),
  projectId:  uuid("project_id").notNull().references(() => projects.id, {onDelete:"cascade"}),
  clientId:   uuid("client_id").references(() => clients.id, {onDelete:"set null"}),
  snapshot:   jsonb("snapshot").notNull(),                  // lines, totals, currency, render paths, studio details
  pdfPath:    text("pdf_path"),                             // files: <user id>/<project id>/proposals/...
  shareToken: text("share_token").notNull().unique("proposals_share_token_key").default(sql`replace(gen_random_uuid()::text, '-', '')`),
  sentAt:     timestamp("sent_at", tz),
  createdAt:  createdAt()
}, (t) => [
  ownerFk(t, "proposals"),
  index("proposals_project").on(t.projectId),
  ...ownRows(t, "proposals")
]);

/* ── Catalog ── */

// A group of items. owner null = built in: everyone sees it, admins (profiles.role) and the server key
// change it. A designer's own catalog needs a real account: anonymous browser sessions can't upload.
// is_admin() and has_account() are defined in *_is_admin_function.sql.
const ownOrBuiltIn = (t) => sql`${t.owner} is null or ${t.owner} = ${authUid}`;
const isAdmin = sql`(select public.is_admin())`, hasAccount = sql`(select public.has_account())`;
const catalogPolicies = (t, what, ownCheck, builtInCheck) => [
  pgPolicy(`read built-in and own ${what}`, {for:"select", to:authenticatedRole, using:ownOrBuiltIn(t)}),
  pgPolicy(`add own ${what}`,    {for:"insert", to:authenticatedRole, withCheck:sql`${ownCheck} and ${hasAccount}`}),
  pgPolicy(`change own ${what}`, {for:"update", to:authenticatedRole, using:own(t), withCheck:sql`${ownCheck} and ${hasAccount}`}),
  pgPolicy(`delete own ${what}`, {for:"delete", to:authenticatedRole, using:own(t)}),
  pgPolicy(`admins add built-in ${what}`,    {for:"insert", to:authenticatedRole, withCheck:sql`${builtInCheck} and ${isAdmin}`}),
  pgPolicy(`admins change built-in ${what}`, {for:"update", to:authenticatedRole, using:sql`${t.owner} is null and ${isAdmin}`, withCheck:sql`${builtInCheck} and ${isAdmin}`}),
  pgPolicy(`admins delete built-in ${what}`, {for:"delete", to:authenticatedRole, using:sql`${t.owner} is null and ${isAdmin}`})
];

export const catalogs = pgTable("catalogs", {
  id:          uuid("id").primaryKey().defaultRandom(),
  owner:       uuid("owner").default(sql`auth.uid()`),
  name:        text("name").notNull(),
  description: text("description"),
  supplier:    text("supplier"),
  createdAt:   createdAt(),
  updatedAt:   updatedAt()
}, (t) => [
  ownerFk(t, "catalogs"),
  index("catalogs_owner").on(t.owner),
  ...catalogPolicies(t, "catalogs", own(t), sql`${t.owner} is null`)
]);

// A piece of furniture or a wall/floor finish. id is text so built-ins keep the ids saved rooms use
// (sofa, oak, m-chair-...); uploads get a generated one. owner is copied from the catalog.
export const catalogItems = pgTable("catalog_items", {
  id:            text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  catalogId:     uuid("catalog_id").notNull().references(() => catalogs.id, {onDelete:"cascade"}),
  owner:         uuid("owner").default(sql`auth.uid()`),
  kind:          text("kind").notNull(),
  nameEn:        text("name_en").notNull(),
  nameAr:        text("name_ar"),
  aiDescription: text("ai_description"),                    // how the AI render prompt names it
  category:      text("category"),
  w:             real("w"),                                 // size in metres (furniture)
  d:             real("d"),
  h:             real("h"),
  surface:       boolean("surface").notNull().default(false),   // other pieces can stand on it
  price:         numeric("price", {precision:12, scale:2}).notNull().default("0"),
  unit:          text("unit").notNull().default("each"),
  currency:      text("currency").notNull().default("EGP"),
  color:         text("color"),                             // shown while the model loads, or for box pieces
  material:      text("material"),                          // finishes: how the 3D view draws it (paint, marble, ...)
  modelPath:     text("model_path"),                        // the optimised .glb
  sourcePath:    text("source_path"),                       // the original upload, kept for re-processing
  thumbnailPath: text("thumbnail_path"),
  textures:      jsonb("textures"),                         // finishes: {base, normal, arm, tile}
  license:       text("license"),
  credits:       text("credits"),
  status:        text("status").notNull().default("ready"),
  createdAt:     createdAt(),
  updatedAt:     updatedAt()
}, (t) => [
  ownerFk(t, "catalog_items"),
  oneOf("catalog_items_kind_check", t.kind, ["furniture", "wall_finish", "floor_finish"]),
  oneOf("catalog_items_unit_check", t.unit, ["each", "m2", "lm"]),
  oneOf("catalog_items_status_check", t.status, ["processing", "ready", "failed"]),
  check("catalog_items_price_check", sql`${t.price} >= 0`),
  index("catalog_items_catalog").on(t.catalogId),
  index("catalog_items_owner").on(t.owner),
  // A designer's items go in their own catalog; built-in items (admins) in a built-in catalog.
  ...catalogPolicies(t, "catalog items",
    sql`${t.owner} = ${authUid} and exists (select 1 from catalogs c where c.id = ${t.catalogId} and c.owner = ${authUid})`,
    sql`${t.owner} is null and exists (select 1 from catalogs c where c.id = ${t.catalogId} and c.owner is null)`)
]);
