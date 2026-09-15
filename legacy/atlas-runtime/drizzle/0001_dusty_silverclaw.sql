CREATE TABLE `atlas_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atlas_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_money_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`merchant` varchar(160) NOT NULL,
	`productName` varchar(255),
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`cadence` varchar(40) NOT NULL DEFAULT 'monthly',
	`annualized` decimal(12,2),
	`nextRenewal` timestamp,
	`state` enum('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
	`confidence` int NOT NULL DEFAULT 80,
	`evidence` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atlas_money_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`quietHoursEnabled` boolean NOT NULL DEFAULT true,
	`quietStart` varchar(5) NOT NULL DEFAULT '22:00',
	`quietEnd` varchar(5) NOT NULL DEFAULT '07:30',
	`webuiNotifications` boolean NOT NULL DEFAULT true,
	`telegramDelivery` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atlas_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `atlas_preferences_ownerOpenId_unique` UNIQUE(`ownerOpenId`)
);
--> statement-breakpoint
CREATE TABLE `atlas_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`title` varchar(255) NOT NULL,
	`implication` text NOT NULL,
	`urgency` enum('urgent','review','info') NOT NULL DEFAULT 'review',
	`state` enum('active','dismissed','completed') NOT NULL DEFAULT 'active',
	`domains` text,
	`actionLabel` varchar(120),
	`actionHref` varchar(255),
	`evidence` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atlas_signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`name` varchar(120) NOT NULL,
	`provider` varchar(80) NOT NULL,
	`status` enum('connected','disconnected','safe_mode','error') NOT NULL DEFAULT 'disconnected',
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atlas_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`title` varchar(255) NOT NULL,
	`source` varchar(80) NOT NULL DEFAULT 'Drip Advice',
	`meta` text,
	`status` enum('open','completed','snoozed') NOT NULL DEFAULT 'open',
	`dueAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atlas_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_wardrobe` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128) NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` varchar(80) NOT NULL,
	`colors` text,
	`status` enum('pending','confirmed','rejected') NOT NULL DEFAULT 'pending',
	`wearCount` int NOT NULL DEFAULT 0,
	`price` decimal(12,2),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`imageRef` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atlas_wardrobe_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `atlas_chat_owner_idx` ON `atlas_chat_messages` (`ownerOpenId`);--> statement-breakpoint
CREATE INDEX `atlas_money_owner_idx` ON `atlas_money_findings` (`ownerOpenId`);--> statement-breakpoint
CREATE INDEX `atlas_signals_owner_idx` ON `atlas_signals` (`ownerOpenId`);--> statement-breakpoint
CREATE INDEX `atlas_sources_owner_idx` ON `atlas_sources` (`ownerOpenId`);--> statement-breakpoint
CREATE INDEX `atlas_tasks_owner_idx` ON `atlas_tasks` (`ownerOpenId`);--> statement-breakpoint
CREATE INDEX `atlas_wardrobe_owner_idx` ON `atlas_wardrobe` (`ownerOpenId`);