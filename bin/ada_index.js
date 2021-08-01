#!/usr/bin/env node
const axios = require("axios");
const CoinbasePro = require('coinbase-pro');
const fs = require('fs');

const tick = async() => {
    const config = {
        asset: 'BTC',
        base: 'EUR',
        allocation: 0.1,
        spread: 0.2,
        tickInterval : 2000,
    };

    var raw_params = fs.readFileSync('bin/params.json');
    var params = JSON.parse(raw_params);
    var auth = params.auth;
    const authedClient = new CoinbasePro.AuthenticatedClient(auth.apiKey, auth.apiSecret, auth.passphrase, auth.apiURI);

    const {asset, base, spread, allocation} = config;
    const market = 'ADA/EUR';

    const results = await Promise.all([
        axios.get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur"),
        axios.get("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=eur"),
    ]);

    const marketPrice = results[0].data.bitcoin.eur / results[1].data.tether.eur;
    const sellPrice = marketPrice * (1 + spread);
    const buyPrice = marketPrice * (1 - spread);

    const balances = await authedClient.getAccounts();
    const assetBalance = balances.filter(el => { return el.currency == 'BTC' })[0].balance;
    const baseBalance = balances.filter(el => { return el.currency == 'EUR' })[0].balance;
    const sellVolume = assetBalance * allocation;
    const buyVolume = (baseBalance * allocation) / marketPrice;
    console.log(`
        New tick for ${market}...
    `);
    if (sellVolume > 0) {
        console.log(`
            Created limit sell order for ${sellVolume} @ ${sellPrice}
        `);
    } else {
        console.log(`
            Created limit buy order for ${buyVolume} @ ${buyPrice}
        `);
    }

}

setInterval(tick, 10000);