CREATE TABLE `atlas_try_ons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`wardrobeId` int NOT NULL,
	`personImageRef` varchar(512) NOT NULL,
	`resultImageRef` varchar(512),
	`status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atlas_try_ons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `atlas_try_ons_owner_idx` ON `atlas_try_ons` (`ownerOpenId`);