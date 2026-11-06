-- Whether an event's public page shows each prize's remaining stock (shown
-- until now) and its draw weight (staff only until now).
ALTER TABLE `events` ADD COLUMN `show_remaining_quantity` integer NOT NULL DEFAULT 1;
ALTER TABLE `events` ADD COLUMN `show_probability_weight` integer NOT NULL DEFAULT 0;
