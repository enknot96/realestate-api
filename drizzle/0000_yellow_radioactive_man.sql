CREATE TYPE "public"."agent_role" AS ENUM('agent', 'admin');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('new', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('draft', 'published', 'contracted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('rent', 'sale');--> statement-breakpoint
CREATE TYPE "public"."viewing_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "agent_role" DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"message" text NOT NULL,
	"status" "inquiry_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"type" "property_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"layout" text,
	"area" numeric(8, 2),
	"address" text NOT NULL,
	"status" "property_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viewings" (
	"id" serial PRIMARY KEY NOT NULL,
	"inquiry_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "viewing_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "properties_type_idx" ON "properties" USING btree ("type");--> statement-breakpoint
CREATE INDEX "properties_price_idx" ON "properties" USING btree ("price");--> statement-breakpoint
CREATE INDEX "viewings_scheduled_at_idx" ON "viewings" USING btree ("scheduled_at");