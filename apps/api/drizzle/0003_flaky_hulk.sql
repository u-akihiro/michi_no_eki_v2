CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`station_id` text NOT NULL,
	`visited_at` integer NOT NULL,
	`memo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `checkins_user_station_idx` ON `checkins` (`user_id`,`station_id`);--> statement-breakpoint
CREATE INDEX `checkins_user_visited_at_idx` ON `checkins` (`user_id`,`visited_at`);