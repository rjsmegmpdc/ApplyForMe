ALTER TABLE `runs` ADD `submitted_at` integer;--> statement-breakpoint
-- Runs already marked "Applied" via feedback count as submitted.
UPDATE `runs` SET `submitted_at` = `updated_at` WHERE `status` = 'applied' AND `submitted_at` IS NULL;
