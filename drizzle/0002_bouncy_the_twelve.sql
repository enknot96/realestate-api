CREATE TYPE "public"."sale_kind" AS ENUM('land', 'new_house', 'used_house', 'used_mansion');--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "sale_kind" "sale_kind";--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "land_area" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "private_road_area" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "building_area" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "built_year_month" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "nearest_station" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "walk_minutes" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "access_note" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "floor_count" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "floor_number" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "balcony_area" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "management_fee" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "repair_reserve_fee" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "management_type" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
CREATE INDEX "properties_sale_kind_idx" ON "properties" USING btree ("sale_kind");