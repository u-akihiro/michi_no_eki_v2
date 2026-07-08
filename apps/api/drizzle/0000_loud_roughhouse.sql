CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`prefecture_code` integer NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`homepage_url` text,
	`latitude` real,
	`longitude` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
