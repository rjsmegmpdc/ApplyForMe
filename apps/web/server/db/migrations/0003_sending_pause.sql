ALTER TABLE `users` ADD `sends_paused_at` integer;--> statement-breakpoint
-- Matt asked for sending to be paused (2026-10-12): pause the default user on apply.
UPDATE `users` SET `sends_paused_at` = unixepoch() WHERE `id` = 1;
