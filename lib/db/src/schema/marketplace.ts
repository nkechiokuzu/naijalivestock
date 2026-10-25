import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const marketplaceProfiles = pgTable("marketplace_profiles", {
  userId: varchar("user_id", { length: 255 }).primaryKey(),
  role: varchar("role", { length: 20 }).notNull().default("buyer"),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  phone: varchar("phone", { length: 24 }).notNull(),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  state: varchar("state", { length: 40 }).notNull().default(""),
  city: varchar("city", { length: 60 }).notNull().default(""),
  sellerVerification: varchar("seller_verification", { length: 20 })
    .notNull()
    .default("not_started"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const listings = pgTable(
  "marketplace_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: varchar("seller_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    category: varchar("category", { length: 24 }).notNull(),
    breed: varchar("breed", { length: 80 }).notNull(),
    ageMonths: integer("age_months").notNull(),
    weightKg: real("weight_kg").notNull(),
    healthStatus: varchar("health_status", { length: 24 }).notNull(),
    priceNaira: integer("price_naira").notNull(),
    quantity: integer("quantity").notNull().default(1),
    state: varchar("state", { length: 40 }).notNull(),
    city: varchar("city", { length: 60 }).notNull(),
    fulfillment: varchar("fulfillment", { length: 16 }).notNull(),
    photos: text("photos")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    featured: boolean("featured").notNull().default(false),
    isSample: boolean("is_sample").notNull().default(false),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("marketplace_listings_category_status_idx").on(
      table.category,
      table.status,
    ),
    index("marketplace_listings_location_idx").on(table.state, table.city),
    index("marketplace_listings_seller_idx").on(table.sellerId),
  ],
);

export const sellerVerifications = pgTable(
  "seller_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    legalName: varchar("legal_name", { length: 100 }).notNull(),
    state: varchar("state", { length: 40 }).notNull(),
    city: varchar("city", { length: 60 }).notNull(),
    idType: varchar("id_type", { length: 24 }).notNull(),
    documentPath: text("document_path").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewNote: text("review_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("seller_verifications_user_idx").on(table.userId),
    index("seller_verifications_status_idx").on(table.status),
  ],
);

export const conversations = pgTable(
  "marketplace_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    buyerId: varchar("buyer_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    sellerId: varchar("seller_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("marketplace_conversations_buyer_listing_idx").on(
      table.buyerId,
      table.listingId,
    ),
    index("marketplace_conversations_seller_idx").on(table.sellerId),
  ],
);

export const messages = pgTable(
  "marketplace_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderId: varchar("sender_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("marketplace_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const offers = pgTable(
  "marketplace_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    buyerId: varchar("buyer_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    sellerId: varchar("seller_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    amountNaira: integer("amount_naira").notNull(),
    quantity: integer("quantity").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("marketplace_offers_conversation_idx").on(table.conversationId),
  ],
);

export const transactions = pgTable(
  "marketplace_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id),
    buyerId: varchar("buyer_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    sellerId: varchar("seller_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    amountNaira: integer("amount_naira").notNull(),
    feeNaira: integer("fee_naira").notNull(),
    status: varchar("status", { length: 28 })
      .notNull()
      .default("payment_setup_required"),
    paymentProvider: varchar("payment_provider", { length: 20 })
      .notNull()
      .default("unconfigured"),
    receiptDeadline: timestamp("receipt_deadline", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("marketplace_transactions_offer_idx").on(table.offerId),
    index("marketplace_transactions_buyer_idx").on(table.buyerId),
    index("marketplace_transactions_seller_idx").on(table.sellerId),
  ],
);

export const disputes = pgTable(
  "marketplace_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    buyerId: varchar("buyer_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    sellerId: varchar("seller_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    reason: text("reason").notNull(),
    evidencePaths: text("evidence_paths")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    sellerResponse: text("seller_response"),
    responseEvidencePaths: text("response_evidence_paths")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: varchar("status", { length: 28 }).notNull().default("open"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("marketplace_disputes_status_idx").on(table.status)],
);

export const fraudFlags = pgTable(
  "marketplace_fraud_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportedUserId: varchar("reported_user_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    reporterId: varchar("reporter_id", { length: 255 })
      .references(() => marketplaceProfiles.userId),
    listingId: uuid("listing_id").references(() => listings.id),
    reason: varchar("reason", { length: 32 }).notNull(),
    details: text("details").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("marketplace_fraud_flags_reported_user_idx").on(
      table.reportedUserId,
      table.status,
    ),
    index("marketplace_fraud_flags_status_idx").on(table.status),
  ],
);

export const uploadGrants = pgTable(
  "marketplace_upload_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => marketplaceProfiles.userId),
    objectPath: text("object_path").notNull().unique(),
    purpose: varchar("purpose", { length: 24 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    finalized: boolean("finalized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("marketplace_upload_grants_user_idx").on(table.userId, table.purpose),
  ],
);
