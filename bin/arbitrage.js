const CoinbasePro = require('coinbase-pro');
const fs = require('fs');
const { get } = require('http');
const { log, error } = console;
const got = require('got');
const events = require('events');
const Websocket = require('ws');
const { sort } = require('fast-sort');
const { exit } = require('process');

var raw_params = fs.readFileSync('bin/params.json');
var params = JSON.parse(raw_params);
var auth = params.auth;
const authedClient = new CoinbasePro.AuthenticatedClient(auth.apiKey, auth.apiSecret, auth.passphrase, auth.apiURI);

const eventEmitter = new events();

let pairs = [],
  symValJ = {};

authedClient.getProducts()
.then(data => {
  // work with data
  //console.log(data[0]);

  const eInfo = data;
  const symbols = [
    ...new Set(
      eInfo
        .filter((d) => d.status === 'online')
        .map((d) => [d.base_currency, d.quote_currency])
        .flat()
    ),
  ];

  const validPairs = eInfo
    .filter((d) => d.status === 'online' && d.product_id === 'ADA-EUR' || 'BTC-EUR' || 'ETH-EUR')
    .map((d) => d.id);
  validPairs.forEach((symbol) => {
    symValJ[symbol] = { bidPrice: 0, askPrice: 0 };
  });

  let s1 = symbols,
    s2 = symbols,
    s3 = symbols;
  s1.forEach((d1) => {
    s2.forEach((d2) => {
      s3.forEach((d3) => {
        if (!(d1 == d2 || d2 == d3 || d3 == d1)) {
          let lv1 = [],
            lv2 = [],
            lv3 = [],
            l1 = '',
            l2 = '',
            l3 = '';
          if (symValJ[d1 + '-' + d2]) {
            lv1.push(d1 + '-' + d2);
            l1 = 'num';
          }
          if (symValJ[d2 + '-' + d1]) {
            lv1.push(d2 + '-' + d1);
            l1 = 'den';
          }

          if (symValJ[d2 + '-' + d3]) {
            lv2.push(d2 + '-' + d3);
            l2 = 'num';
          }
          if (symValJ[d3 + '-' + d2]) {
            lv2.push(d3 + '-' + d2);
            l2 = 'den';
          }

          if (symValJ[d3 + '-' + d1]) {
            lv3.push(d3 + '-' + d1);
            l3 = 'num';
          }
          if (symValJ[d1 + '-' + d3]) {
            lv3.push(d1 + '-' + d3);
            l3 = 'den';
          }

          if (lv1.length && lv2.length && lv3.length) {
            pairs.push({
              l1: l1,
              l2: l2,
              l3: l3,
              d1: d1,
              d2: d2,
              d3: d3,
              lv1: lv1[0],
              lv2: lv2[0],
              lv3: lv3[0],
              value: -100,
              tpath: '',
            });
          }
        }
      });
    });
  });
  console.log(`Finished identifying Arbitrage Paths. Total paths = ${pairs.length}`);
  //console.log(pairs);
})
.catch(error => {
  // handle the error
});


const processData = (data) => {
  try {
//    data = JSON.parse(data);
    if (data['result'] === null) return;
    
    if(data.type == 'ticker' && data.product_id) {
      console.log(data.product_id, symValJ[data.product_id]);
      symValJ[data.product_id].bidPrice = parseFloat(data.best_bid) * 1;
      symValJ[data.product_id].askPrice = parseFloat(data.best_ask) * 1;
      
      //Perform calculation and send alerts
      pairs.forEach((d) => {
        //continue if price is not updated for any symbol
        if (
          symValJ[d.lv1]['bidPrice'] &&
          symValJ[d.lv2]['bidPrice'] &&
          symValJ[d.lv3]['bidPrice']
        ) {
          //Level 1 calculation
          let lv_calc, lv_str;
          if (d.l1 === 'num') {
            lv_calc = symValJ[d.lv1]['bidPrice'];
            lv_str =
              d.d1 +
              '->' +
              d.lv1 +
              "['bidP']['" +
              symValJ[d.lv1]['bidPrice'] +
              "']" +
              '->' +
              d.d2 +
              '<br/>';
          } else {
            lv_calc = 1 / symValJ[d.lv1]['askPrice'];
            lv_str =
              d.d1 +
              '->' +
              d.lv1 +
              "['askP']['" +
              symValJ[d.lv1]['askPrice'] +
              "']" +
              '->' +
              d.d2 +
              '<br/>';
          }

          //Level 2 calculation
          if (d.l2 === 'num') {
            lv_calc *= symValJ[d.lv2]['bidPrice'];
            lv_str +=
              d.d2 +
              '->' +
              d.lv2 +
              "['bidP']['" +
              symValJ[d.lv2]['bidPrice'] +
              "']" +
              '->' +
              d.d3 +
              '<br/>';
          } else {
            lv_calc *= 1 / symValJ[d.lv2]['askPrice'];
            lv_str +=
              d.d2 +
              '->' +
              d.lv2 +
              "['askP']['" +
              symValJ[d.lv2]['askPrice'] +
              "']" +
              '->' +
              d.d3 +
              '<br/>';
          }

          //Level 3 calculation
          if (d.l3 === 'num') {
            lv_calc *= symValJ[d.lv3]['bidPrice'];
            lv_str +=
              d.d3 +
              '->' +
              d.lv3 +
              "['bidP']['" +
              symValJ[d.lv3]['bidPrice'] +
              "']" +
              '->' +
              d.d1;
          } else {
            lv_calc *= 1 / symValJ[d.lv3]['askPrice'];
            lv_str +=
              d.d3 +
              '->' +
              d.lv3 +
              "['askP']['" +
              symValJ[d.lv3]['askPrice'] +
              "']" +
              '->' +
              d.d1;
          }

          d.tpath = lv_str;
          d.value = parseFloat(parseFloat((lv_calc - 1) * 100).toFixed(3));
        }
      });
    }

    //Send Socket
    eventEmitter.emit(
      'ARBITRAGE',
      sort(pairs.filter((d) => d.value > 0)).desc((u) => u.value)
    );
  } catch (err) {
    error(err);
  }
};

const websocket = new CoinbasePro.WebsocketClient(['ADA-EUR', 'ETH-EUR', 'BTC-EUR'],'wss://ws-feed.pro.coinbase.com',null, {channels: ["ticker"]});

websocket.on('message', processData);
websocket.on('error', err => {
  /* handle error */
});
websocket.on('close', () => {
  /* ... */
});

// let ws = '';
// const wsconnect = () => {
//   ws = new Websocket(`wss://stream.binance.com:9443/ws`); //!ticker@arr
//   ws.on('open', () => {
//     ws.send(
//       JSON.stringify({
//         method: 'SUBSCRIBE',
//         params: ['!ticker@arr'],
//         id: 121212131,
//       })
//     );
//   });
//   ws.on('error', log);
//   ws.on('message', processData);
// };

//module.exports = { getPairs, wsconnect, eventEmitter };
// module.exports = { getPairs };