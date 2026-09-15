import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const wardrobeItems = mysqlTable("wardrobe_items", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  colors: text("colors").notNull(),
  pattern: varchar("pattern", { length: 80 }),
  material: varchar("material", { length: 80 }),
  warmth: int("warmth").notNull().default(1),
  formality: int("formality").notNull().default(1),
  imageUrl: text("imageUrl"),
  imageKey: text("imageKey"),
  analysisProvider: varchar("analysisProvider", { length: 20 }).notNull().default("demo"),
  status: varchar("status", { length: 20 }).notNull().default("confirmed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const outfitPlans = mysqlTable("outfit_plans", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull().default(0),
  requestText: text("requestText").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  note: text("note").notNull(),
  itemIds: text("itemIds").notNull(),
  score: int("score").notNull().default(0),
  provider: varchar("provider", { length: 20 }).notNull().default("demo"),
  previewUrl: text("previewUrl"),
  previewStatus: varchar("previewStatus", { length: 20 }).notNull().default("none"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const outfitFeedback = mysqlTable("outfit_feedback", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull().default(0),
  outfitId: int("outfitId").notNull(),
  decision: varchar("decision", { length: 20 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WardrobeItem = typeof wardrobeItems.$inferSelect;
export type InsertWardrobeItem = typeof wardrobeItems.$inferInsert;
export type OutfitPlan = typeof outfitPlans.$inferSelect;
export type InsertOutfitPlan = typeof outfitPlans.$inferInsert;
