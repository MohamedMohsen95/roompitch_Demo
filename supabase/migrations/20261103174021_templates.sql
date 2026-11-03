CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"data" jsonb NOT NULL,
	"cover_path" text,
	"published" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "templates_published_sort" ON "templates" USING btree ("published","sort");--> statement-breakpoint
CREATE POLICY "read published templates" ON "templates" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ("templates"."published" or (select public.is_admin()));--> statement-breakpoint
CREATE POLICY "admins add templates" ON "templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select public.is_admin()));--> statement-breakpoint
CREATE POLICY "admins change templates" ON "templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));--> statement-breakpoint
CREATE POLICY "admins delete templates" ON "templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select public.is_admin()));