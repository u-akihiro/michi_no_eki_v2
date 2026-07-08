ALTER TABLE `stations` ADD `source_station_id` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `stations_source_station_id_unique` ON `stations` (`source_station_id`);