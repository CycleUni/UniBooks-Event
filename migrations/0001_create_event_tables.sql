-- The event system's own D1 database. Users belong to the main site: they
-- appear here only as ids (organizer, member, operator), so no foreign keys
-- point at them.
CREATE TABLE IF NOT EXISTS `events` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `cover_image_url` text,
  `organizer_id` text NOT NULL,
  -- The main site's region (TW, HK): where the event is listed, and which
  -- school verification it asks for.
  `region_code` text NOT NULL DEFAULT 'TW',
  `max_draws_per_user` integer NOT NULL DEFAULT 1,
  `require_edu_verification` integer NOT NULL DEFAULT 1,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `event_prizes` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `image_url` text,
  `probability_weight` integer NOT NULL DEFAULT 1,
  `total_quantity` integer NOT NULL DEFAULT -1,
  `remaining_quantity` integer NOT NULL DEFAULT -1,
  `sort_order` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `event_lottery_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `user_id` text NOT NULL,
  `prize_id` text,
  `is_winner` integer NOT NULL DEFAULT 0,
  `operator_id` text NOT NULL,
  `user_name` text NOT NULL DEFAULT '',
  `user_email_masked` text NOT NULL DEFAULT '',
  `token_step` integer NOT NULL,
  `scanned_at` text NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`prize_id`) REFERENCES `event_prizes`(`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `idx_events_region_active` ON `events` (`region_code`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_event_prizes_event_id` ON `event_prizes` (`event_id`);
CREATE INDEX IF NOT EXISTS `idx_lottery_entries_event_user` ON `event_lottery_entries` (`event_id`, `user_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_lottery_entries_event_user_step` ON `event_lottery_entries` (`event_id`, `user_id`, `token_step`);
