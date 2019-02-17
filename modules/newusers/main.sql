CREATE TABLE `newusers` (
    `id` int(11) NOT NULL PRIMARY KEY AUTO_INCREMENT,
    `name` varchar(50) NOT NULL,
    `wiki` varchar(50) NOT NULL,
    `language` varchar(16) NOT NULL,
    `domain` ENUM('wikia.com', 'fandom.com', 'wikia.org') NOT NULL DEFAULT 'wikia.com'
) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Migration to KockaLogger v1.1.0:
-- ALTER TABLE `newusers` ADD COLUMN `domain` ENUM('wikia.com', 'fandom.com', 'wikia.org') NOT NULL DEFAULT 'wikia.com'
