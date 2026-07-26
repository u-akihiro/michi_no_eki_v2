CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`checkin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`station_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`is_pin_photo` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`checkin_id`) REFERENCES `checkins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_r2_key_unique` ON `photos` (`r2_key`);--> statement-breakpoint
CREATE INDEX `photos_checkin_id_idx` ON `photos` (`checkin_id`);--> statement-breakpoint
CREATE INDEX `photos_user_station_idx` ON `photos` (`user_id`,`station_id`);