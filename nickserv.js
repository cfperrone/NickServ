var irc = require('irc'),
    path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    Sequelize = require('sequelize');

var config = getConfig(),
    commands = [];

// Set up the server
var client = new irc.Client(config.server, config.nick, config);

// Set up emailing client
var sendmail = require('sendmail')();

// Set up the database
var db = new Sequelize('nickserv', 'nickuser', 'nickpass', {
    dialect: 'sqlite',
    storage: 'data/db.sql'
});
var RegisteredNick = db.define('registered_nicks', {
    username: {
        type: Sequelize.STRING
    },
    nick: {
        type: Sequelize.STRING,
        primaryKey: true
    },
    password: {
        type: Sequelize.STRING
    },
    state: {
        type: Sequelize.ENUM('pending', 'active'),
        defaultValue: 'pending'
    },
    create_date: {
        type: Sequelize.INTEGER
    },
    active_date: {
        type: Sequelize.INTEGER,
        defaultValue: 0
    }
}, {
    timestamps: false,
    freezeTableName: true,
    instanceMethods: {
        getAuthToken : function() {
            return crypto.createHash('sha1').update(this.create_date + this.username + this.password).digest('hex');
        },
        isExpired : function() {
            var now = Math.floor(Date.now() / 1000);
            return this.state == 'active' && (this.active_date + (config.nickTimeout * 60 * 60 * 24)) < now;
        },
        isPending : function() {
            var now = Math.floor(Date.now() / 1000);
            return this.state == 'pending' && (this.create_date + (config.nickTimeout * 60 * 60)) >= now;
        },
        isDeletable : function() {
            return this.isExpired() && !this.isPending();
        },
        touchActive : function() {
            // Always zero-out the active_date field if we're not in active state
            if (this.state != 'active') {
                this.active_date = 0;
                return;
            }

            var now = Math.floor(Date.now() / 1000);
            this.active_date = now;
        }
    }
});
db.sync();

// -- Server-specific event functions
client.connect(function() {
    console.log("Connected!");
});

client.addListener('error', function(message) {
    console.log('error: ', message);
});

client.addListener('pm', function(nick, text, message) {
    console.log(nick + " : " + text);

    handleRequest(nick, text, message);
});

// -- Command functions
function doCmdHelp(from, args, message) {
    client.say(from, "YOU ARE REALLY " + message.user);
}
function doCmdRegister(from, args, message) {
    var all_args = args.split(' ');
    if (all_args.length != 2) {
        client.say(from, "Usage: REGISTER [password] [email]");
        return;
    }

    var nick = from.toLowerCase(),
        password = all_args[0],
        email = all_args[1];

    RegisteredNick.find({ where: { nick: nick }}).then(function(found) {
        if (found && found.isDeletable()) {
            // Nick exists but is expired, delete it and create a new one
            found.destroy().then(function() {
                createNewNick(from, message.user, nick, password, email);
            });
        } else if (found) {
            // Nick exists and is active
            client.say(from, "Sorry, but that nick is already registered. Please select another one");
        } else {
            // Nick does not exist, create a new one
            createNewNick(from, message.user, nick, password, email);
        }
    });
}
function doCmdAuth(from, args, message) {
    var all_args = args.split(' ');
    if (all_args.length != 1) {
        client.say(from, "Usage: AUTH [code]");
        return;
    }

    var token = all_args[0];

    RegisteredNick.find({ where: {nick: from}}).then(function(found) {
        if (!found) {
            return;
        }

        authenticateNick(from, found, token);
    });
}
function doCmdIdentify(from, args, message) {
    var all_args = args.split(' ');
    if (all_args.length != 1) {
        client.say(from, "Usage: IDENTIFY [password]");
        return;
    }

    var password = all_args[0];

    RegisteredNick.find({ where: {nick: from}}).then(function(found) {
        if (!found) {
            client.say(from, "Nick is not registered. Use the REGISTER command to do so.");
            return;
        }

        if (found.password != password) {
            client.say(from, "Sorry, but that's not right...");
            return;
        }

        // TODO: How do we tell the server that this nick is valid?
    });
}

// -- Helper functions
function handleRequest(from, text, message) {
    // Split up the message, the first part is the command
    var parts = text.split(' '),
        command = parts[0].toUpperCase(),
        args = parts.slice(1).join(' ');

    // Execute the command-specific function
    switch (command) {
        case 'HELP':
            doCmdHelp(from, args, message); break;
        case 'REGISTER':
            doCmdRegister(from, args, message); break;
        case 'AUTH':
            doCmdAuth(from, args, message); break;
        case 'IDENTIFY':
            doCmdIdentify(from, args, message); break;
        default:
            client.say(from, 'Command ' + command + ' is unknown');
            break;
    }
}

process.on('SIGINT', cleanup);
process.on('SIGUSR2', cleanup);

// Disconnects the bot on process kill
function cleanup() {
    if (typeof client != 'undefined') {
        client.disconnect(function() {
            console.log("Disconnected");
        });
    }
}

function getConfig() {
    // Default configuration
    var config = {
        nick: 'NickServ',
        dataDir: __dirname + '/data',

        // IRC module options
        userName: 'NickServ',
        realName: 'A nickname control bot',
        port: 6667,
        autoConnect: false,
        channels: [ ]
    };

    // Override default config with user-specified
    var user_config = require('./config.js').config;
    for (var attr in user_config) {
        config[attr] = user_config[attr];
    }

    return config;
}

function createNewNick(from, user, nick, password, email) {
    var create_date = Math.floor(Date.now() / 1000);

    RegisteredNick.create({
        username: user,
        nick: nick,
        password: password,
        state: 'pending',
        create_date: create_date,
        active_date: 0,
    }).then(function(nick_object) {
        // Generate an auth token
        var token = nick_object.getAuthToken();

        console.log("Will send email to " + email + " with token " + token);

        // Send an email
        sendmail({
            from: 'noreply@nano.li',
            to: email,
            subject: 'NickServ Confirmation Email',
            content: 'Thanks for registering your nick "' + nick + '". Your authentication code is: ' + token + '. Reply to NickServ with "AUTH [code]" to finish your registration.'
        }, function(err, reply) {
            if (err) {
                console.log("SENDMAIL ERROR: " + err);
            }
        });

        // Reply saying to check your email
        client.say(from, "Your nick is now pending. Please check your email for the auth code and reply with `AUTH [code]`. You must authenticate within 24 hours or your nick will be relinquished.");
    });
}

function authenticateNick(from, found, token) {
    // Make sure Nick is eligible to be auth'd
    if (!found.isPending()) {
        return;
    }

    // Actually do authentication
    if (token != found.getAuthToken()) {
        client.say(from, "Sorry, but that token is incorrect");
        return;
    }

    // Mark nick as active
    found.state = 'active';
    found.touchActive();
    found.save();

    client.say(from, "Your nick is now active!");
}
