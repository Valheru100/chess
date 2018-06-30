//Written by Valh using discord.js: https://discord.js.org/#/docs/main/stable/general/welcome, chess.js: https://github.com/jhlywa/chess.js/blob/master/README.md , node-uci: https://github.com/ebemunk/node-uci
//Inspiration taken from: https://github.com/daniel-lawrence-lu/discord-woofbot (seriously though, there is some real furry shit going on with this one)

const Discord = require("discord.js");
const Chess = require("chess.js").Chess;
const Engine = require("node-uci").Engine;
const config = require("./config");

var engine = new Engine(config.stockfishLocationv8);
engine.init();
engine.setoption("MultiPV", "1");

var authorized = config.authIds;
var SODChess = new Discord.Client({ autoReconnect: true });
var gamesInPlay = {};
var thinking = {};
var sidenames = { b: "white", w: "black" };

SODChess.on("ready", () => {
    console.log("Ready!")
});

//When message comes in strip prefix and get command, then call relevent function depending on command

SODChess.on("message", message => {
try{
    if (message.content.startsWith(config.prefix)) {
        var commands = message.content.substring(1, message.content.length).split(/\n| /); //split on a new line and spaces
        var id = message.author.id + "!?#" + message.channel.id;
        for (cmd in commands) {
            commands[cmd].replace(" ", ""); //replace whitespace with nothing
        }
        console.log(commands);

        switch (commands[0].toLowerCase()) {
            case "enginelevel":
                init(message, commands);
                break;
            case "help":
                help(message);
                break;
            case "resign":
                endGame(message, id, true, false);
                break;
            case "move":
                move(message, id, commands);
                break;
            case "info":
                info(message);
                break;
            case "startgame":
                startGame(message, id);
                break;
            default:
                break;
        }
    }
} catch(exception) 
{
	message.reply("something went wrong!");
}
});

//Help function returns descriptions and usages of each command

function help(message) {
    message.channel.send({
        embed: {
            color: 3447003,
            author: {
                name: message.client.user.username,
                icon_url: message.client.user.avatarURL
            },
            fields: [{
                name: config.prefix + "help",
                value: "Shows this message\nUsage: " + config.prefix + "help"
            },
            {
                name: config.prefix + "info",
                value: "Shows details about the bot\nUsage: " + config.prefix  + "info"
            },
            {
                name: config.prefix + "startgame",
                value: "Starts a new game, only one game can run per person\nUsage: " + config.prefix + "startgame"
            },
            {
                name: config.prefix + "resign",
                value: "Resign from the game\nUsage: " + config.prefix + "resign"
            },
            {
                name: config.prefix + "move",
                value: "Make a move!\nMove Syntax: for all pawns just use the square to move to, far all others use the designation of the piece\nUsage: " + config.prefix + "move Ne3 - moves Knight to e3"
            },
            {
                name: config.prefix + "enginelevel",
                value: "Admin Command\nInitialises the engine AI from levels 1 to 8\nUsage: " + config.prefix + "enginelevel level\n"
            }]
        }
    });
};

//responds with info about the bot

function info(message) {
    message.reply("SODChess 1.0 written by Valh\nHosted on AWS\nFind any bugs? Ping Valh")
}

//Initialises the engine engine to whichever level you"d like

function init(message, commands) {
try 
{
    if (authorized.indexOf(message.author.id) > -1) {
        if (commands[1] != null && (commands[1] >= 1 && commands[1] <= 8)) {
            try {
                engine.quit();
                engine.init();
                engine.setoption("MultiPV", commands[1]);
            } catch (error) {
                message.reply("Something went wrong!");
            }
        }
        else {
            message.reply("Incorrect Syntax! Please refer to $help");
        }
    }
    else {
        message.reply("Only an authorised user can change the engine level")
    }
} catch(exception)
{
	message.reply("something went wrong!");
}
};

//Starts a game, each user can run 1 game at a time but no more

function startGame(message, id) {
    try {
        if (gamesInPlay[id] === undefined) {
            gamesInPlay[id] = new Chess();
            message.reply("Chess game: " + message.author.username, message.channel.name);
            thinking[id] = false;
        }
        else {
            message.reply("You already have a game running!");
        }
    } catch (error) {
        message.reply("Something went wrong!");
    }
}

//Called upon the end of the game, either by resignation or other issues

function endGame(message, id, resign, quiet) {
    if (gamesInPlay[id] === undefined) {
        message.reply("You have no active games running!");
        return;
    }
    if (!quiet) {
        var winner;
        if (resign) {
            winner = sidenames[gamesInPlay[id].turn()] + " wins by resignation!";
        } else if (gamesInPlay[id].in_checkmate()) {
            winner = sidenames[gamesInPlay[id].turn()] + " wins by checkmate!";
        } else if (gamesInPlay[id].in_stalemate()) {
            winner = "Draw by stalemate!";
        } else if (gamesInPlay[id].in_threefold_repetition()) {
            winner = "Draw by threefold repetition!";
        } else if (gamesInPlay[id].insufficient_material()) {
            winner = "Draw by insufficient material!";
        } else if (gamesInPlay[id].in_draw()) {
            winner = "Draw!";
        }
        message.reply("Game over: " + winner +
            "\n" + gamesInPlay[id].pgn({ newline_char: "\n" }));
    }
    console.log("Chess game end: ", message.author.username, message.channel.name);
    delete gamesInPlay[id];
    delete thinking[id];
}

//Function to control the user's move and the response move from stockfish

function move(message, id, commands) {
try
{
    var move = commands[1]

    if (thinking[id] === true) {
        message.reply(message, "I\"m still thinking...");
        return;
    }
    if (move !== "skip" && gamesInPlay[id].move(move, { sloppy: true }) === null) {
        message.reply("Illegal move! Valid moves are: " + gamesInPlay[id].moves().join(", ") +
            "\n" + getFenImage(id));
        return;
    }

    const chain = engine.chain()
        .position(gamesInPlay[id].fen())
        .go({ depth: 5 })
        .then(function (result) {
            var match = result.bestmove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?/);
            if (match) {
                var m = gamesInPlay[id].move({ from: match[1], to: match[2], promotion: match[3] });
                message.reply(m.san + "\n" + getFenImage(id));
                thinking[id] = false;
                if (gamesInPlay[id].game_over()) {
                    endGame(message, id, false, false);
                }
            }
        });
    thinking[id] = true;
    if (gamesInPlay[id].game_over()) {
        endGame(message, id, false, false);
    }
}
catch(exception)
{
	message.reply("something went wrong!");
}
}

//Returns a link to an image generator using fen

function getFenImage(id) {
    return "http://www.fen-to-image.com/image/20/single/coords/" + gamesInPlay[id].fen().split(" ")[0];
}

//Logs in the bot using the token from config

SODChess.login(config.token);
console.log("SODChess");
