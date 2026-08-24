CREATE DATABASE IF NOT EXISTS `wikisguessr`;
USE `wikisguessr`;

CREATE TABLE IF NOT EXISTS `users` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`username` VARCHAR(255) NOT NULL,
	`username_changed_at` TIMESTAMP NULL DEFAULT NULL,
	`email` VARCHAR(255) NOT NULL,
	`email_verified` TINYINT(1) NOT NULL DEFAULT 0,
	`email_verification_token` VARCHAR(255) DEFAULT NULL,
	`email_verification_expires_at` DATETIME DEFAULT NULL,
	`password_reset_token` VARCHAR(255) DEFAULT NULL,
	`password_reset_expires_at` DATETIME DEFAULT NULL,
	`role` ENUM('user','moderator','admin') NOT NULL DEFAULT 'user',
	`subscription_tier` ENUM('free','silver','gold') NOT NULL DEFAULT 'free',
	`subscription_expires_at` DATETIME DEFAULT NULL,
	`stripe_customer_id` VARCHAR(255) DEFAULT NULL,
	`stripe_subscription_id` VARCHAR(255) DEFAULT NULL,
	`stripe_subscription_status` VARCHAR(50) DEFAULT NULL,
	`avatar_url` VARCHAR(500) DEFAULT NULL,
	`password` VARCHAR(255) NOT NULL,
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`last_seen` TIMESTAMP NULL DEFAULT NULL,
	`banned_at` TIMESTAMP NULL DEFAULT NULL,
	`elo` INT NOT NULL DEFAULT 1500,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uniq_users_username` (`username`),
	UNIQUE KEY `uniq_users_email` (`email`),
	UNIQUE KEY `uniq_users_stripe_customer` (`stripe_customer_id`),
	UNIQUE KEY `uniq_users_stripe_subscription` (`stripe_subscription_id`)
);

CREATE TABLE IF NOT EXISTS `games` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`code` VARCHAR(12) NOT NULL,
	`title` VARCHAR(255) NOT NULL,
	`start_article` VARCHAR(255) NOT NULL,
	`target_article` VARCHAR(255) NOT NULL,
	`mode` ENUM('normal','knowledge','chrono') NOT NULL DEFAULT 'normal',
	`status` ENUM('waiting','running','finished') NOT NULL DEFAULT 'waiting',
	`is_ranked` TINYINT(1) NOT NULL DEFAULT 1,
	`player_count` INT NOT NULL DEFAULT 1,
	`room_id` INT DEFAULT NULL,
	`created_by` INT NOT NULL,
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uniq_games_code` (`code`),
	KEY `idx_games_created_by` (`created_by`),
	CONSTRAINT `fk_games_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `game_rooms` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`code` VARCHAR(12) NOT NULL,
	`owner_id` INT NOT NULL,
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uniq_game_rooms_owner` (`owner_id`),
	UNIQUE KEY `uniq_game_rooms_code` (`code`),
	KEY `idx_game_rooms_owner` (`owner_id`),
	CONSTRAINT `fk_game_rooms_owner` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `game_room_members` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`room_id` INT NOT NULL,
	`user_id` INT NOT NULL,
	`joined_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uniq_game_room_members` (`room_id`, `user_id`),
	KEY `idx_game_room_members_room` (`room_id`),
	KEY `idx_game_room_members_user` (`user_id`),
	CONSTRAINT `fk_game_room_members_room` FOREIGN KEY (`room_id`) REFERENCES `game_rooms`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_game_room_members_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `friendships` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`user_id` INT NOT NULL,
	`friend_id` INT NOT NULL,
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uniq_friendships` (`user_id`, `friend_id`),
	KEY `idx_friendships_user` (`user_id`),
	KEY `idx_friendships_friend` (`friend_id`),
	CONSTRAINT `fk_friendships_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_friendships_friend` FOREIGN KEY (`friend_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `chk_friendships_different` CHECK (`user_id` != `friend_id`)
);

CREATE TABLE IF NOT EXISTS `room_messages` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`room_id` INT NOT NULL,
	`user_id` INT NOT NULL,
	`message` VARCHAR(500) NOT NULL,
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	KEY `idx_room_messages_room` (`room_id`),
	KEY `idx_room_messages_user` (`user_id`),
	KEY `idx_room_messages_created` (`created_at`),
	CONSTRAINT `fk_room_messages_room` FOREIGN KEY (`room_id`) REFERENCES `game_rooms`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_room_messages_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `reports` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`reporter_id` INT NOT NULL,
	`reported_user_id` INT NOT NULL,
	`message` VARCHAR(1000) NOT NULL,
	`image_data` MEDIUMTEXT NULL,
	`status` ENUM('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
	`admin_note` VARCHAR(500) NULL,
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`reviewed_at` TIMESTAMP NULL,
	PRIMARY KEY (`id`),
	KEY `idx_reports_reporter` (`reporter_id`),
	KEY `idx_reports_reported` (`reported_user_id`),
	KEY `idx_reports_status` (`status`),
	CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_reports_reported` FOREIGN KEY (`reported_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `chk_reports_different` CHECK (`reporter_id` != `reported_user_id`)
);

CREATE TABLE IF NOT EXISTS `user_daily_game_usage` (
	`user_id` INT NOT NULL,
	`usage_date` DATE NOT NULL,
	`total_games` INT NOT NULL DEFAULT 0,
	`knowledge_games` INT NOT NULL DEFAULT 0,
	PRIMARY KEY (`user_id`, `usage_date`),
	CONSTRAINT `fk_daily_game_usage_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `friend_requests` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`sender_id` INT NOT NULL,
	`recipient_id` INT NOT NULL,
	`status` ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`responded_at` TIMESTAMP NULL DEFAULT NULL,
	PRIMARY KEY (`id`),
	KEY `idx_friend_requests_recipient_status` (`recipient_id`, `status`),
	KEY `idx_friend_requests_sender_status` (`sender_id`, `status`),
	CONSTRAINT `fk_friend_requests_sender` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_friend_requests_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `chk_friend_requests_different` CHECK (`sender_id` != `recipient_id`)
);

CREATE TABLE IF NOT EXISTS `game_players` (
	`game_id` INT NOT NULL,
	`user_id` INT NOT NULL,
	`joined_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`game_id`, `user_id`),
	KEY `idx_game_players_user` (`user_id`),
	CONSTRAINT `fk_game_players_game` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_game_players_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `game_room_invitations` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`room_id` INT NOT NULL,
	`inviter_id` INT NOT NULL,
	`invitee_id` INT NOT NULL,
	`status` ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`responded_at` TIMESTAMP NULL DEFAULT NULL,
	PRIMARY KEY (`id`),
	KEY `idx_room_invitations_invitee_status` (`invitee_id`, `status`),
	CONSTRAINT `fk_room_invitations_room` FOREIGN KEY (`room_id`) REFERENCES `game_rooms`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_room_invitations_inviter` FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_room_invitations_invitee` FOREIGN KEY (`invitee_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);