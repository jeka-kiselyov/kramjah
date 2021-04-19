# Kramjah

Node.js trading bot application. Simple trading strategy included. Works over HitBTC exchange with any trading pair, but feel free to fork it and change to any exchange, should be relatively simple to. 


![Kramjah in action](https://user-images.githubusercontent.com/1434612/110217873-3a7c2580-7ebf-11eb-862c-da91c15d548e.gif)  | ![photo_2021-03-20_15-22-24](https://user-images.githubusercontent.com/1434612/112845420-83ce2800-90ad-11eb-9356-b11c2f549bdf.jpg)
------------- | -------------




### Installation

- Install node.js [download](https://nodejs.org/en/download/)
- Download **Kramjah** and extract to new foler
    - Or do `git clone https://github.com/jeka-kiselyov/kramjah.git`
- cd to folder and run `npm install`

### Simulation or trade with real money?

First, you'd better spend some time optimizing the trading strategy for your needs and vision. Then run "flashback" command to check how successful your strategy would be on historical data. When you are ok with it, run real trading with `dotrade` or `trade` commands.

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

### Trade over few pairs based on settings.

No need to remember all symbol-strategies you are trading over. Edit `traders` array in `settings/settings.js` and run trading over them running `node app.js trade`. Use [up] and [down] keys for navigation between traders. Press [p] to pause traders loop for 30 seconds.

### Trading Window Hotkeys

- [1] - 5 minutes interval price chart
- [2] - 15 minutes interval price chart
- [3] - 1 hour interval price chart
- [4] - 5 minutes volatility chart
- [5] - 15 minutes volatility chart
- [6] - 1 hour volatility chart
- [up] - next trader (if trading over settings/setting.js file)
- [down] - prev trader (if trading over settings/setting.js file)
- [p] - pause next trader loop for 30 seconds (if trading over settings/setting.js file)
- [l] - show/hide debug dialog
- [q][ctrl+c] - quit

#### Important notes

- Be sure there's only one running instance trading on specific TradingSymbol/Strategy. App doesn't catch parallel instances and can't produce too much orders in this case.

### Write your own trading strategy

- Extend Base class with other one and use its name instead of Simple when running the app.
- #todo: docs about getting statistics features from HistoricalMarketPriceCombined

### Want to try other pairs?

- Donwload .csv file with historical prices from Kaggle [here](https://www.kaggle.com/tencars/392-crypto-currency-pairs-at-minute-resolution).
- Compress .csv file to binary format for faster reading: `node app.js cachecsv path/to/file.csv`
- Or compress part of .csv file for faster reading of final .dat file: `node app.js cachecsv path/to/file.csv maxWeeksCount startTimestamp`
- Check compressed .dat file: `node app.js testdat path/to/file.dat`
- Be sure this trading pair is available on HitBTC, check pairs [here](https://api.hitbtc.com/api/2/public/symbol). Use symbol as pairsymbol when running the app.
- Try running trading simulation over it: `node app.js flashback path/to/file.dat Simple pairsymbol 1`

### Refresh .dat file with real market data

For faster initialization, refresh .dat file, run `node app.js refreshdat path/to/file.dat pairsymbol`, result file will be saved at path/to/file_updated.dat

### Let Kramjah notify you of profits in Telegram?

- Create new telegram bot, [how](https://core.telegram.org/bots#3-how-do-i-create-a-bot)
- Add line `TELEGRAM_BOT_TOKEN=xxxxx:xxxx-xxx-xx` with bot token to .env file
- Add the bot you created to your telegram contacts (send any message to it).
- Run `node app.js checktelegram` and send another message to the bot while command is running
- Command will show you your telegram user id, add it to .env file as line of `TELEGRAM_NOTIFY_USER_ID=xxxxx`
- Bot will send you telegram notification on any successful sale with profit.
- If trading over few pairs with `node app.js trade` command, you can ask bot to check your profits balance. Send `/balance` command to it.

### Want to simulate trading on different time interval?

There's an option:
`node app.js flashback path/to/file.dat Simple pairsymbol 1 fromTime toTime` where fromTime and toTime are timestamps. Use something like [this](https://www.unixtimestamp.com/index.php) to generate needed timestamps.

### Want to simulate with different starting balance?

`node app.js flashback path/to/file.dat Simple pairsymbol 1 fromTime toTime startBalance`

### Get statistic on available trading pairs to decide what to trade on

Run `node app.js checkpair` or `node app.js checkpair >> report.csv` to write to the file. It will take few hours, but will generate you a report for some statistics over the last 7 days on all available symbols on the marketplace.
