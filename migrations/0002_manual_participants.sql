-- Participants staff added by hand (by member ID): an entry with no draw.
-- They are participants but do not use up a member's draws.
ALTER TABLE `event_lottery_entries` ADD COLUMN `is_manual` integer NOT NULL DEFAULT 0;
