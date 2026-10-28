import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// This system's own database (migrations/). Users live on the main site:
// they appear here only as ids, plus the name and masked email a draw saved.
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  coverImageUrl: text('cover_image_url'),
  organizerId: text('organizer_id').notNull(),
  // The main site's region, upper-case (TW, HK).
  regionCode: text('region_code').notNull().default('TW'),
  maxDrawsPerUser: integer('max_draws_per_user').notNull().default(1),
  requireEduVerification: integer('require_edu_verification').notNull().default(1),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type EventItem = InferSelectModel<typeof events>;
export type InsertEvent = InferInsertModel<typeof events>;

export const eventPrizes = sqliteTable(
  'event_prizes',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    imageUrl: text('image_url'),
    // Relative weight among the prizes still in stock.
    probabilityWeight: integer('probability_weight').notNull().default(1),
    // -1 = unlimited.
    totalQuantity: integer('total_quantity').notNull().default(-1),
    remainingQuantity: integer('remaining_quantity').notNull().default(-1),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_event_prizes_event_id').on(table.eventId)],
);

export type EventPrize = InferSelectModel<typeof eventPrizes>;
export type InsertEventPrize = InferInsertModel<typeof eventPrizes>;

export const eventLotteryEntries = sqliteTable(
  'event_lottery_entries',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull(),
    userId: text('user_id').notNull(),
    prizeId: text('prize_id'),
    isWinner: integer('is_winner').notNull().default(0),
    operatorId: text('operator_id').notNull(),
    // As the main site gave them at the draw, for the records list.
    userName: text('user_name').notNull().default(''),
    userEmailMasked: text('user_email_masked').notNull().default(''),
    // The member-token time step that was scanned: one draw per code, so a
    // camera that keeps seeing the same QR cannot draw twice.
    tokenStep: integer('token_step').notNull(),
    // 1 = added by staff by member ID: a participant without a draw (migration 0002).
    isManual: integer('is_manual').notNull().default(0),
    scannedAt: text('scanned_at').notNull(),
  },
  (table) => [
    index('idx_lottery_entries_event_user').on(table.eventId, table.userId),
    uniqueIndex('uq_lottery_entries_event_user_step').on(table.eventId, table.userId, table.tokenStep),
  ],
);

export type EventLotteryEntry = InferSelectModel<typeof eventLotteryEntries>;
export type InsertEventLotteryEntry = InferInsertModel<typeof eventLotteryEntries>;
