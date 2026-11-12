-- Event start and end dates (calendar dates YYYY-MM-DD). An event with an
-- end date becomes read-only once its region's calendar date passes it.
ALTER TABLE `events` ADD COLUMN `start_date` text;
ALTER TABLE `events` ADD COLUMN `end_date` text;
