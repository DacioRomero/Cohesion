// controller/app.js
const express = require('express');
const Promise = require('bluebird');
const intersection = require('array-intersection');
const apicalypse = require('@igdb/apicalypse').default;
const SteamAPI = require('../utils/steamapi');

const router = express.Router();
const steam = SteamAPI();
const igdb = apicalypse({
    baseURL: "https://endpoint-alpha.igdb.com",
    headers: {
        'Accept': 'application/json',
        'user-key': process.env.IGDB_API_KEY
    },
    responseType: 'json'
});

router.get('/:host', (req, res) => {
    const hostId = req.params.host;
    const friendIds = req.query.friends;

    const steamIds = [hostId];

    // TOOD: Suport CSV
    if (friendIds != null) {
        steamIds.push(...friendIds);
    }

    Promise.map(steamIds, steamId => steam.getOwnedGames(steamId))
        .then(userGames => {
            const sharedGames = intersection(...userGames);

            // Split into batches of 50 to comply with API limit.
            let batches = []
            for (let i = 0; i < sharedGames.length; i += 50) {
                batches.push(sharedGames.slice(i, i + 50));
            }

            return Promise.all([
                Promise.map(batches, batch => {
                    // external_games.uid returns incorrect results, using URLs
                    const urls = batch.map(id => `https://store.steampowered.com/app/${id}`);

                    const query = igdb
                        .fields([
                            'name',
                            'cover.image_id',
                        ])
                        .limit(50)
                        .filter([
                            'game_modes.slug = "multiplayer"',
                            `websites.url = ("${urls.join('","')}")`,
                            'game_modes.id = 2'
                        ]);

                    return query.request('/games');
                }),
                steam.getPlayerSummaries(steamIds)
            ]);
        })
        .then(([gameBatches, summaries]) => {
            const games = gameBatches.map(batch => batch.data).flat()
            // https://stackoverflow.com/a/45898081/10336544
            const { [hostId]: host, ...friends } = summaries;

            return res.render('app', {
                host,
                friends,
                games
            });
        })
        .catch(error => {
            res.status(500).json(error)
            console.error(error);
        })
})

module.exports = router;
