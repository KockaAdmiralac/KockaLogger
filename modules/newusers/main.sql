CREATE TABLE `newusers` (
    `id` int(11) NOT NULL PRIMARY KEY AUTO_INCREMENT,
    `name` varchar(50) NOT NULL,
    `wiki` varchar(50) NOT NULL,
    `language` varchar(16) NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
