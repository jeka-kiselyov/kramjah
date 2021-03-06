# Kramjah

Node.js trading bot application. Simple trading strategy included. Works over HitBTC exchange with any trading pair, but feel free to fork it and change to any exchange, should be relatively simple to.

![Kramjah in action](https://user-images.githubusercontent.com/1434612/110217873-3a7c2580-7ebf-11eb-862c-da91c15d548e.gif)


### Installation

- Install node.js [download](https://nodejs.org/en/download/)
    - Download **Kramjah** and extract to new foler
    - Or do `git clone https://github.com/jeka-kiselyov/kramjah.git`
- cd to folder and run `npm install`

### Try it in action

Run `node app.js flashback data/btcusd2021.dat Simple btcusd 1` to simulate trading over btc/usd pair with Simple trading strategy over historical data.

### Do real trading

- Get your account on [HitBTC](https://hitbtc.com/). 
- Create api keys with `Order book, History, Trading balance` and `Place/cancel orders` access rights.
- Pop it up with some usd
- Add `.env` file to the application root with content of:
```
HITBTC_API_KEY=xxxxx
HITBTC_SECRET_KEY=yyyyyy
```
- Run `node app.js dotrade data/btcusd2021.dat Simple btcusd 1` to run trading.

#### Important notes

- Be sure there's only one running instance trading on specific TradingSymbol/Strategy. App doesn't catch parallel instances and can't produce too much orders in this case.

### Write your own trading strategy

- Extend Base class with other one and use its name instead of Simple when running the app.
- #todo: docs about getting statistics features from HistoricalMarketPriceCombined

### Want to try other pairs?

- Donwload .csv file with historical prices from Kaggle [here](https://www.kaggle.com/tencars/392-crypto-currency-pairs-at-minute-resolution).
- Compress .csv file to binary format for faster reading: `node app.js cachecsv path/to/file.csv`
- Check compressed .dat file: `node app.js testdat path/to/file.dat`
- Be sure this trading pair is available on HitBTC, check pairs [here](https://api.hitbtc.com/api/2/public/symbol). Use symbol as pairsymbol when running the app.
- Try running trading simulation over it: `node app.js flashback path/to/file.dat Simple pairsymbol 1`
 
### Want to simulate trading on different time interval?

There's an option:
`node app.js flashback path/to/file.dat Simple pairsymbol 1 fromTime toTime` where fromTime and toTime are timestamps. Use something like [this](https://www.unixtimestamp.com/index.php) to generate needed timestamps.
