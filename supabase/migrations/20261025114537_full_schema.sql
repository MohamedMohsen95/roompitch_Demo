-- projects.room becomes projects.data (it now holds restyle projects too). Merged by hand: drizzle-kit asks about renames interactively.
ALTER TABLE "projects" RENAME COLUMN "room" TO "data";--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"catalog_id" uuid NOT NULL,
	"owner" uuid DEFAULT auth.uid(),
	"kind" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"ai_description" text,
	"category" text,
	"w" real,
	"d" real,
	"h" real,
	"surface" boolean DEFAULT false NOT NULL,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"color" text,
	"material" text,
	"model_path" text,
	"source_path" text,
	"thumbnail_path" text,
	"textures" jsonb,
	"license" text,
	"credits" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_kind_check" CHECK ("catalog_items"."kind" in ('furniture', 'wall_finish', 'floor_finish')),
	CONSTRAINT "catalog_items_unit_check" CHECK ("catalog_items"."unit" in ('each', 'm2', 'lm')),
	CONSTRAINT "catalog_items_status_check" CHECK ("catalog_items"."status" in ('processing', 'ready', 'failed')),
	CONSTRAINT "catalog_items_price_check" CHECK ("catalog_items"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid DEFAULT auth.uid(),
	"name" text NOT NULL,
	"description" text,
	"supplier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prices" (
	"owner" uuid DEFAULT auth.uid() NOT NULL,
	"item_id" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prices_pkey" PRIMARY KEY("owner","item_id"),
	CONSTRAINT "prices_price_check" CHECK ("prices"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT auth.uid() NOT NULL,
	"studio_name" text,
	"designer_name" text,
	"phone" text,
	"email" text,
	"logo_path" text,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"fee_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"vat_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid DEFAULT auth.uid() NOT NULL,
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"wall" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid DEFAULT auth.uid() NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid,
	"snapshot" jsonb NOT NULL,
	"pdf_path" text,
	"share_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_share_token_key" UNIQUE("share_token")
);
--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid DEFAULT auth.uid() NOT NULL,
	"project_id" uuid,
	"path" text,
	"source" text NOT NULL,
	"style_id" text,
	"prompt" text,
	"provider" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renders_source_check" CHECK ("renders"."source" in ('studio', 'restyle', 'edit'))
);
--> statement-breakpoint
ALTER TABLE "renders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" text DEFAULT 'studio' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "thumbnail_path" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_items_catalog" ON "catalog_items" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "catalog_items_owner" ON "catalog_items" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "catalogs_owner" ON "catalogs" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "clients_owner_name" ON "clients" USING btree ("owner","name");--> statement-breakpoint
CREATE INDEX "project_photos_project" ON "project_photos" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "proposals_project" ON "proposals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "renders_owner_created" ON "renders" USING btree ("owner","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "renders_project" ON "renders" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_kind_check" CHECK ("projects"."kind" in ('studio', 'restyle'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('draft', 'sent', 'won', 'lost'));--> statement-breakpoint
CREATE POLICY "read built-in and own catalog items" ON "catalog_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("catalog_items"."owner" is null or "catalog_items"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own catalog items" ON "catalog_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("catalog_items"."owner" = (select auth.uid()) and exists (select 1 from catalogs c where c.id = "catalog_items"."catalog_id" and c.owner = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "change own catalog items" ON "catalog_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("catalog_items"."owner" = (select auth.uid())) WITH CHECK ("catalog_items"."owner" = (select auth.uid()) and exists (select 1 from catalogs c where c.id = "catalog_items"."catalog_id" and c.owner = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "delete own catalog items" ON "catalog_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("catalog_items"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "read built-in and own catalogs" ON "catalogs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("catalogs"."owner" is null or "catalogs"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own catalogs" ON "catalogs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("catalogs"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "change own catalogs" ON "catalogs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("catalogs"."owner" = (select auth.uid())) WITH CHECK ("catalogs"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "delete own catalogs" ON "catalogs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("catalogs"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "read own clients" ON "clients" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("clients"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own clients" ON "clients" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("clients"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "change own clients" ON "clients" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("clients"."owner" = (select auth.uid())) WITH CHECK ("clients"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "delete own clients" ON "clients" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("clients"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "read own prices" ON "prices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("prices"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own prices" ON "prices" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("prices"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "change own prices" ON "prices" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("prices"."owner" = (select auth.uid())) WITH CHECK ("prices"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "delete own prices" ON "prices" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("prices"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "read own profile" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own profile" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "change own profile" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("profiles"."id" = (select auth.uid())) WITH CHECK ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "read own project photos" ON "project_photos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("project_photos"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own project photos" ON "project_photos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("project_photos"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "change own project photos" ON "project_photos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("project_photos"."owner" = (select auth.uid())) WITH CHECK ("project_photos"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "delete own project photos" ON "project_photos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("project_photos"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "read own proposals" ON "proposals" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("proposals"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own proposals" ON "proposals" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("proposals"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "change own proposals" ON "proposals" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("proposals"."owner" = (select auth.uid())) WITH CHECK ("proposals"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "delete own proposals" ON "proposals" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("proposals"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "read own renders" ON "renders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("renders"."owner" = (select auth.uid()));--> statement-breakpoint