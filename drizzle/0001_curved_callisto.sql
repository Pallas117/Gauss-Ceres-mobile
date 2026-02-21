CREATE TABLE `feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`category` enum('BUG','FEATURE','DATA','OTHER') NOT NULL,
	`severity` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
	`message` text NOT NULL,
	`contextRef` varchar(128),
	`isResolved` boolean NOT NULL DEFAULT false,
	`resolvedAt` timestamp,
	`adminNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`nodeId` varchar(64) NOT NULL DEFAULT 'JUDITH-M1',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`eventsProcessed` int NOT NULL DEFAULT 0,
	`commandsSent` int NOT NULL DEFAULT 0,
	`dangerAcknowledged` int NOT NULL DEFAULT 0,
	`peakThreatPct` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operator_sessions_id` PRIMARY KEY(`id`)
);
