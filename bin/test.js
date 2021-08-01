#!/usr/bin/env node

const CoinbasePro = require('coinbase-pro');
const fs = require('fs');
const { get } = require('http');

var raw_params = fs.readFileSync('bin/params.json');
var params = JSON.parse(raw_params);
var auth = params.auth;
const authedClient = new CoinbasePro.AuthenticatedClient(auth.apiKey, auth.apiSecret, auth.passphrase, auth.apiURI);

var raw_market = fs.readFileSync('bin/market.json');
var market = JSON.parse(raw_market);

var getProduct24Hr = function(){
    authedClient.getProduct24HrStats(market.crypto)
    .then(data => {
        return getProduct24Hr = data;
    }
    ).catch((e) => {
            console.log(e);
        }
    );
}
console.log(getProduct24Hr());

