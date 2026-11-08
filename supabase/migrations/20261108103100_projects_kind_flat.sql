ALTER TABLE "projects" DROP CONSTRAINT "projects_kind_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_kind_check" CHECK ("projects"."kind" in ('studio', 'restyle', 'flat'));
