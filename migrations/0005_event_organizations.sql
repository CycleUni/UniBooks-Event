-- A draw hosted by a student organization (the main site's organizations.id),
-- whose admins run it; null for one UniBooks staff run.
ALTER TABLE `events` ADD COLUMN `organization_id` text;
