-- Table for logging which wiki was an account created on.
CREATE TABLE `newusers` (
    -- Table's primary key (unrelated to the user's account ID).
    `id` int(11) NOT NULL PRIMARY KEY AUTO_INCREMENT,
    -- User's username.
    `name` varchar(50) NOT NULL,
    -- Subdomain of the wiki where the account was created.
    `wiki` varchar(50) NOT NULL,
    -- Language of the wiki where the account was created.
    `language` varchar(16) NOT NULL,
    -- Domain of the wiki where the account was created.
    `domain` ENUM('wikia.com', 'fandom.com', 'wikia.org', 'gamepedia.com', 'gamepedia.io') NOT NULL DEFAULT 'wikia.com'
) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Table for logging accounts with profile information 30 minutes after their
-- creation, and their spam review status.
-- Since KockaLogger v1.4.0.
CREATE TABLE `profiles` (
    -- User's Fandom account ID.
    `id` int(11) NOT NULL PRIMARY KEY,
    -- User's Fandom username.
    `name` varchar(50) NOT NULL,
    -- User's website.
    -- Design decision: although websites on Fandom can contain up to 65536
    -- characters, we limit ourselves to 255 as we do not usually need to
    -- handle the extreme cases.
    `website` varchar(255),
    -- User's "aka" part of the profile section.
    `aka` varchar(64),
    -- User's Facebook link.
    -- Same note as for the website.
    `facebook` varchar(255),
    -- User's Twitter handle.
    -- Same note as for the website, except that it can be even longer.
    `twitter` varchar(255),
    -- User's Discord handle.
    `discord` varchar(64),
    -- User's biography.
    `bio` text,
    -- Whether the profile has been classified as spam (true), as not spam
    -- (false) or not classified at all (NULL).
    `is_spam` boolean
) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Migration to KockaLogger v1.1.10:
-- ALTER TABLE `newusers` MODIFY COLUMN `domain` ENUM('wikia.com', 'fandom.com', 'wikia.org', 'gamepedia.com', 'gamepedia.io') NOT NULL DEFAULT 'wikia.com';
