#!/usr/bin/env node

const CoinbasePro = require('coinbase-pro');
const fs = require('fs');
const { totalmem } = require('os');

var raw_params = fs.readFileSync('bin/params.json');
var params = JSON.parse(raw_params);
var auth = params.auth;
const authedClient = new CoinbasePro.AuthenticatedClient(auth.apiKey, auth.apiSecret, auth.passphrase, auth.apiURI);

var minutes = 0.5, the_interval = minutes * 60 * 1000;

var curAssetIndex = 0;
const asset = params.assets[curAssetIndex];

setInterval(async function() {
    
    console.log(`Analizando ${asset}...`);
    const raw_market = fs.readFileSync('bin/' + asset + '.market.json');
    const market = JSON.parse(raw_market);

    const balances = await authedClient.getAccounts();
    const baseBalance = parseFloat(balances.filter(el => { return el.currency == 'EUR' })[0].balance);
    const assetBalance = parseFloat(balances.filter(el => { return el.currency == asset })[0].balance);

    var raw_trans = fs.readFileSync('bin/' + asset + '.transactions.json');
    var trans = JSON.parse(raw_trans);

    const history = await authedClient.getProductHistoricRates(market.crypto, { granularity: 60 });
    const fills = await authedClient.getFills({product_id: market.crypto});

    authedClient.getProductTicker(market.crypto, (error, response, data) => {
        if (error) {
            console.log(error);
        } else {
            if(fills[0].side == "buy") {
                // we sell
                sell(fills[0], asset, data, market, trans);
            } else if(fills[0].side == "sell") {
                // we buy
                buy(fills[0], asset, data, market, trans);
            }        
        }
    });
}, the_interval);

async function buy(lastFill, asset, data, market, trans) {
    let currentPrice = parseFloat(data.price);
    let lastPrice = parseFloat(lastFill.price);
    let allocation = parseFloat(market.allocation);
    let spread = parseFloat(market.spread);

    const buyPrice = lastPrice * (1 - spread);

    const balances = await authedClient.getAccounts();
    const baseBalance = parseFloat(balances.filter(el => { return el.currency == 'EUR' })[0].balance);
    const buyVolume = (baseBalance * allocation) / currentPrice;
    
    console.log("COMPRA", {"Precio de compra": buyPrice, "Precio Actual": currentPrice});
    console.log("Cantidad a utilizar:", baseBalance + "???");
    
    if(buyPrice >= currentPrice) {
        console.log("COMPRAR!", {"Precio Actual": currentPrice });
        const params = {
            side: 'buy',
            size: baseBalance,
            product_id: market.crypto,
            type : 'market'
        };
        authedClient.placeOrder(params, (error, response, order) => {
            if (error) {
                console.log("ERROR", error.body);
            } else {
                order['price'] = currentPrice;
                console.log("COMPRA HECHA", order);
                trans.push(order);
                fs.writeFileSync('bin/transactions.json', JSON.stringify(trans));
            }
        });
    }
    console.log("---");
}

async function sell(lastFill, asset, data, market, trans) {
    let currentPrice = parseFloat(data.price);
    let lastPrice = parseFloat(lastFill.price);
    let allocation = parseFloat(market.allocation);
    let spread = parseFloat(market.spread);

    const sellPrice = lastPrice * (1 + spread);

    const balances = await authedClient.getAccounts();
    const assetBalance = parseFloat(balances.filter(el => { return el.currency == asset })[0].balance);
    const sellVolume = assetBalance * allocation;
    
    console.log("VENTA", {"Precio de venta": sellPrice, "Precio Actual": currentPrice});
    console.log("Cantidad a utilizar:", assetBalance + " " + asset);
    
    if(sellPrice < currentPrice) {
        console.log("VENDER!", {"Precio Actual": currentPrice });

        const params = {
            side: 'sell',
            size: assetBalance,
            product_id: market.crypto,
            type : 'market'
        };
        authedClient.placeOrder(params, (error, response, order) => {
            if (error) {
                console.log("ERROR", error.body);
            } else {
                order['price'] = currentPrice;
                console.log("VENTA HECHA", order);
                trans.push(order);
                fs.writeFileSync('bin/' + asset + '.transactions.json', JSON.stringify(trans));
            }
        });
    }
    console.log("---");
}

function getPercentageChange(last_price, new_price){
    return (new_price - last_price) / 100;    
}

function historyGetHighestSellPrice(){
    var raw_trans = fs.readFileSync('bin/transactions.json');
    var trans = JSON.parse(raw_trans);
    if(trans.length > 0) {
        var sale_list = trans.filter(function(e){
            return e.side = 'sell';
        });

        sale_list.sort(function(a, b){
            return parseFloat(a.price) - parseFloat(b.price)
        });

        return sale_list[sale_list.length - 1].price;
    } else {
        return 0;
    }
}

function historyGetLowestBuyPrice(){
    var raw_trans = fs.readFileSync('bin/transactions.json');
    var trans = JSON.parse(raw_trans);

    if(trans.length > 0) {
        var buy_list = trans.filter(function(e){
            return e.side = 'sell';
        });

        buy_list.sort(function(a, b){
            return parseFloat(a.price) - parseFloat(b.price)
        });

        return buy_list[0].price;
    } else {
        return 0;
    }
}