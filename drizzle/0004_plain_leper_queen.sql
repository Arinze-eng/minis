CREATE TABLE `atlas_travel_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`destination` varchar(160) NOT NULL,
	`startDate` varchar(32) NOT NULL,
	`endDate` varchar(32) NOT NULL,
	`notes` text,
	`status` enum('planned','completed') NOT NULL DEFAULT 'planned',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atlas_travel_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `atlas_travel_owner_idx` ON `atlas_travel_plans` (`ownerOpenId`);