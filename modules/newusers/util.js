/**
 * util.js
 *
 * Utility functions shared by the entire newusers module.
 */
'use strict';

/**
 * Determines whether a user should be reported in the channel.
 * @param {object} userData User's profile information
 * @returns {boolean} Whether the user should be reported for review
 */
function isReportable(userData) {
    const {bio, discordHandle, fbPage, twitter, website} = userData;
    return bio || discordHandle || fbPage || twitter || website;
}

/**
 * Gets IDs of Fandom users with specified usernames.
 *
 * Can only get 50 users due to API restrictions.
 * @param {import('../../include/io.js')} io API client
 * @param {string[]} usernames Usernames whose data should be retrieved
 * @returns {Promise<number[]>} User IDs of requested users
 */
async function getIds(io, usernames) {
    const {query} = await io.query('community', 'en', 'fandom.com', {
        formatversion: 2,
        list: 'users',
        ususers: usernames.join('|')
    });
    return query.users.map(u => u.userid).filter(Boolean);
}

/**
 * Retrieves user data about users with specified usernames from the API.
 * @param {import('../../include/io.js')} io API client
 * @param {string[]} usernames Usernames whose data should be retrieved
 * @returns {Promise<object[]>} User data
 */
async function getUserData(io, usernames) {
    const usernamesLeft = Array.from(usernames);
    const finalUserData = [];
    while (usernamesLeft.length > 0) {
        const batch = usernamesLeft.splice(0, 50);
        try {
            const userIds = await getIds(io, batch);
            const {users} = await io.userInfo(userIds);
            finalUserData.push(...Object.entries(users)
                .map(([id, userData]) => ({
                    id,
                    ...userData
                })));
        } catch (error) {
            if (
                error.code === 'ERR_NON_2XX_3XX_RESPONSE' &&
                error.response.statusCode === 404
            ) {
                continue;
            }
            throw error;
        }
    }
    return finalUserData;
}

module.exports = {
    getUserData,
    isReportable
};
