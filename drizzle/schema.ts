import { boolean, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const atlasTasks = mysqlTable("atlas_tasks", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  source: varchar("source", { length: 80 }).notNull().default("Drip Advice"),
  meta: text("meta"),
  status: mysqlEnum("status", ["open", "completed", "snoozed"]).notNull().default("open"),
  dueAt: timestamp("dueAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_tasks_owner_idx").on(table.ownerOpenId) }));

export const atlasSignals = mysqlTable("atlas_signals", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  implication: text("implication").notNull(),
  urgency: mysqlEnum("urgency", ["urgent", "review", "info"]).notNull().default("review"),
  state: mysqlEnum("state", ["active", "dismissed", "completed"]).notNull().default("active"),
  domains: text("domains"),
  actionLabel: varchar("actionLabel", { length: 120 }),
  actionHref: varchar("actionHref", { length: 255 }),
  evidence: text("evidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_signals_owner_idx").on(table.ownerOpenId) }));

export const atlasWardrobe = mysqlTable("atlas_wardrobe", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  colors: text("colors"),
  status: mysqlEnum("status", ["pending", "confirmed", "rejected"]).notNull().default("pending"),
  wearCount: int("wearCount").notNull().default(0),
  price: decimal("price", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  imageRef: varchar("imageRef", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_wardrobe_owner_idx").on(table.ownerOpenId) }));

export const atlasMoneyFindings = mysqlTable("atlas_money_findings", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  merchant: varchar("merchant", { length: 160 }).notNull(),
  productName: varchar("productName", { length: 255 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  cadence: varchar("cadence", { length: 40 }).notNull().default("monthly"),
  annualized: decimal("annualized", { precision: 12, scale: 2 }),
  nextRenewal: timestamp("nextRenewal"),
  state: mysqlEnum("state", ["open", "reviewed", "dismissed"]).notNull().default("open"),
  confidence: int("confidence").notNull().default(80),
  evidence: text("evidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_money_owner_idx").on(table.ownerOpenId) }));

export const atlasSources = mysqlTable("atlas_sources", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["connected", "disconnected", "safe_mode", "error"]).notNull().default("disconnected"),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_sources_owner_idx").on(table.ownerOpenId) }));

export const atlasPreferences = mysqlTable("atlas_preferences", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull().unique(),
  quietHoursEnabled: boolean("quietHoursEnabled").notNull().default(true),
  quietStart: varchar("quietStart", { length: 5 }).notNull().default("22:00"),
  quietEnd: varchar("quietEnd", { length: 5 }).notNull().default("07:30"),
  webuiNotifications: boolean("webuiNotifications").notNull().default(true),
  telegramDelivery: boolean("telegramDelivery").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const atlasChatMessages = mysqlTable("atlas_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_chat_owner_idx").on(table.ownerOpenId) }));

export const atlasTryOns = mysqlTable("atlas_try_ons", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  wardrobeId: int("wardrobeId").notNull(),
  personImageRef: varchar("personImageRef", { length: 512 }).notNull(),
  resultImageRef: varchar("resultImageRef", { length: 512 }),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).notNull().default("processing"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_try_ons_owner_idx").on(table.ownerOpenId) }));

export const atlasLooks = mysqlTable("atlas_looks", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  vibe: varchar("vibe", { length: 160 }).notNull().default("Generated look"),
  garmentId: int("garmentId").notNull(),
  personImageRef: varchar("personImageRef", { length: 512 }).notNull(),
  resultImageRef: varchar("resultImageRef", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerIndex: index("atlas_looks_owner_idx").on(table.ownerOpenId) }));
