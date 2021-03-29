const { Program, Command } = require('lovacli');

const path = require('path');
const Notificator = require('../classes/Notificator.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Awaits for your message to telegram bot and display your telegram user id to use in settings');
    }

    async handle(args, options, logger) {
        logger.info('Open the bot you have token name of TELEGRAM_BOT_TOKEN in .env file in telegram and send some message to it');
        let message = await Notificator.waitForMessage();

        if (message && message.from && message.from.id) {
            logger.info('Got a message. User id is: '+message.from.id);
            logger.info('Add a line to .env file:');
            logger.info('TELEGRAM_NOTIFY_USER_ID='+message.from.id);
        } else {
            logger.info('Can not connect to telegram bot. Check TELEGRAM_BOT_TOKEN .env variable');
        }

        await Notificator.stop();

        // console.log(message);
        //
        // await Notificator.log('💰 test');

        // console.log(1);
    }
};

module.exports = Handler;