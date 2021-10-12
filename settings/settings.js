if (typeof __webpack_require__ === 'function') {
	throw new Error("You'd better not include this little piece for frontend scripts, honey");
}

const path = require('path');
const pjson = require(path.join(__dirname, '../package.json'));

const config = {
	"name": pjson.description || pjson.name,
	"version": pjson.version,
	"debug": true,
	"paths": {
		"commands": path.join(__dirname, "../commands"),
		"log": path.join(__dirname, "../data/application.log"),
	},
	"apiTimeout": 10000,
	"traders": [
		{
			"dat": "data/btcusd2021.dat",
			"strategyName": "Simple",
			"symbol": "btcusd",
		},
		{
			"dat": "data/ethbtc.dat",
			"strategyName": "Simple",
			"symbol": "ethbtc",
		},
		// Overload this array with user.js file in this folder (.gitignored, so it's private on your installation and will not be overwrote by updates)
		// It should return very simple of:
		//
		// module.exports = [
		// {
		//  Very simple trading over XLMUSDT pair with basic settings for 1000 USD available on Spot balance
		//  - Place buy orders, by ladder lower than current price, each one for 5.00 USDT
		//  - When buy orders filled:
		//    - place sell order for each with price of (buy order price * 1.02) - see strategies/Simple.js -> getMinimumProfitForASale() for 0.02 target
		//  - When sell order filled:
		//    - Move profit from Spot balance to Account balance (will get 0.02 of 5 USDT = near 0.10 USD)
		//    - Place another Buy order with original price target
		//
		// 	"dat": "data/xlmusd.dat",
		// 	"strategyName": "Simple",
		// 	"symbol": "xlmusd",
		// 	"operatingBalance": 1000,
		//  "maxBid": 5,
		// },
		// {
		// Another option - takeOutQuantity, goal is to get some coin (ETH in this case), not baseCurrency (not USD)
		//  - Place buy orders, by ladder lower than current price, each one for 15.00 USDT
		//    - snapPriceTo is ladder interval. Means, if current price is 5000 USD per ETH, it will place orders of:
		//       4975
		//       4950
		//       4925
		//       ... etc
		//  - When buy orders filled:
		//    - Take 0.0001 ETH from bought amount and send it to Account balance to store
		//    - Place sell order with price higher enough to go even (get same amount of USDT spent for buy order)
		//  - When sell order filled:
		//    - Place another Buy order with original price target
		//    		//
		// 	"dat": "data/ethusd2021.dat",
		// 	"strategyName": "Simple",
		// 	"symbol": "ethusd",
		// 	"takeOutQuantity": 0.0001, // take out this value in coin before placing sell bid
		// 	"operatingBalance": 2150,
		// 	"snapPriceTo": 25,
		// 	"maxBid": 15,
		// },];
	]
};

try {
	let userTraders = require(path.join(__dirname, 'user.js'));
	if (userTraders && userTraders.length) {
		config.traders = userTraders;
	}
} catch(e) {
	console.log('No user trader settings defined. Create user.js file in /settings folder and export traders array from it');
	//
	// Create user.js in this folder with content of:
	//
	// module.exports = [
	// {
	// 	"dat": "data/xlmusd.dat",
	// 	"strategyName": "Simple",
	// 	"symbol": "xlmusd",
	// },
	// {
	// 	"dat": "data/ltcusd2021.dat",
	// 	"strategyName": "Simple",
	// 	"symbol": "ltcusd",
	// },];
}

module.exports = config;