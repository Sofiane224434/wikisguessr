CREATE DATABASE IF NOT EXISTS `wikisguessr`;
USE `wikisguessr`;

CREATE TABLE IF NOT EXISTS `users` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`username` VARCHAR(255) NOT NULL,
	`email` VARCHAR(255) NOT NULL,
	`email_verified` TINYINT(1) NOT NULL DEFAULT 0,
	`email_verification_token` VARCHAR(255) DEFAULT NULL,
	`email_verification_expires_at` DATETIME DEFAULT NULL,
	`password_reset_token` VARCHAR(255) DEFAULT NULL,
	`password_reset_expires_at` DATETIME DEFAULT NULL,
	`role` ENUM('user','admin') NOT NULL DEFAULT 'user',
	`password` VARCHAR(255) NOT NULL,
	`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uniq_users_username` (`username`),
	UNIQUE KEY `uniq_users_email` (`email`)
);