CREATE TABLE `outfit_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL DEFAULT 0,
	`outfitId` int NOT NULL,
	`decision` varchar(20) NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outfit_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL DEFAULT 0,
	`requestText` text NOT NULL,
	`title` varchar(240) NOT NULL,
	`note` text NOT NULL,
	`itemIds` text NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`provider` varchar(20) NOT NULL DEFAULT 'demo',
	`previewUrl` text,
	`previewStatus` varchar(20) NOT NULL DEFAULT 'none',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outfit_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wardrobe_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL DEFAULT 0,
	`name` varchar(200) NOT NULL,
	`category` varchar(40) NOT NULL,
	`colors` text NOT NULL,
	`pattern` varchar(80),
	`material` varchar(80),
	`warmth` int NOT NULL DEFAULT 1,
	`formality` int NOT NULL DEFAULT 1,
	`imageUrl` text,
	`imageKey` text,
	`analysisProvider` varchar(20) NOT NULL DEFAULT 'demo',
	`status` varchar(20) NOT NULL DEFAULT 'confirmed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wardrobe_items_id` PRIMARY KEY(`id`)
);
