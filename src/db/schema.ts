import { relations } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// pgEnum(型名, 許可する値の配列)
export const agentRoleEnum = pgEnum("agent_role", ["agent", "admin"]);
export const propertyTypeEnum = pgEnum("property_type", ["rent", "sale"]);
export const propertyStatusEnum = pgEnum("property_status", [
  "draft",
  "published",
  "contracted",
  "closed",
]);
export const inquiryStatusEnum = pgEnum("inquiry_status", ["new", "in_progress", "done"]);
export const viewingStatusEnum = pgEnum("viewing_status", ["scheduled", "completed", "cancelled"]);

// agentsテーブル
export const agents = pgTable(
  "agents",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: agentRoleEnum("role").notNull().default("agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("agents_email_unique").on(table.email)],
);

// propertiesテーブル
export const properties = pgTable(
  "properties",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id),
    type: propertyTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    price: integer("price").notNull(),
    layout: text("layout"),
    area: numeric("area", { precision: 8, scale: 2 }),
    imageUrl: text("image_url"),
    address: text("address").notNull(),
    status: propertyStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("properties_status_idx").on(table.status),
    index("properties_type_idx").on(table.type),
    index("properties_price_idx").on(table.price),
  ],
);

// customersテーブル
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("customers_email_unique").on(table.email)],
);

// inquiriesテーブル
export const inquiries = pgTable("inquiries", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => properties.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  message: text("message").notNull(),
  status: inquiryStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// viewingsテーブル
export const viewings = pgTable(
  "viewings",
  {
    id: serial("id").primaryKey(),
    inquiryId: integer("inquiry_id")
      .notNull()
      .references(() => inquiries.id),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: viewingStatusEnum("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("viewings_scheduled_at_idx").on(table.scheduledAt)],
);

// refresh_tokensテーブル
export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentsRelations = relations(agents, ({ many }) => ({
  properties: many(properties),
  refreshTokens: many(refreshTokens),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  agent: one(agents, {
    fields: [properties.agentId],
    references: [agents.id],
  }),
  inquiries: many(inquiries),
  viewings: many(viewings),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  inquiries: many(inquiries),
}));

export const inquiriesRelations = relations(inquiries, ({ one, many }) => ({
  property: one(properties, {
    fields: [inquiries.propertyId],
    references: [properties.id],
  }),
  customer: one(customers, {
    fields: [inquiries.customerId],
    references: [customers.id],
  }),
  viewings: many(viewings),
}));

export const viewingsRelations = relations(viewings, ({ one }) => ({
  inquiry: one(inquiries, {
    fields: [viewings.inquiryId],
    references: [inquiries.id],
  }),
  property: one(properties, {
    fields: [viewings.propertyId],
    references: [properties.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  agent: one(agents, {
    fields: [refreshTokens.agentId],
    references: [agents.id],
  }),
}));
