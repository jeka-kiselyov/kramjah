const { Program, Command } = require('lovacli');

const path = require('path');
const TradingApi = require('../classes/TradingApi.js');
const RealMarketData = require('../classes/RealMarketData.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Push cancel order over the order with specific id, so bot will not recognize it anymore');
        progCommand.argument('[clientOrderId]', 'clientOrderId of the bid you want to hide');
    }

    async handle(args, options, logger) {
    }
};

module.exports = Handler;