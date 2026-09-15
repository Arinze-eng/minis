CREATE TABLE `atlas_looks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`title` varchar(160) NOT NULL,
	`vibe` varchar(160) NOT NULL DEFAULT 'Generated look',
	`garmentId` int NOT NULL,
	`personImageRef` varchar(512) NOT NULL,
	`resultImageRef` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atlas_looks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `atlas_looks_owner_idx` ON `atlas_looks` (`ownerOpenId`);