CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid DEFAULT auth.uid() NOT NULL,
	"name" text DEFAULT 'Untitled room' NOT NULL,
	"room" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_updated" ON "projects" USING btree ("owner","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "read own projects" ON "projects" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("projects"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "add own projects" ON "projects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("projects"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "change own projects" ON "projects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("projects"."owner" = (select auth.uid())) WITH CHECK ("projects"."owner" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "delete own projects" ON "projects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("projects"."owner" = (select auth.uid()));