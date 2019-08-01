var express = require( "express" );
var http = require('http');
var redis = require('redis');
const Discord = require('discord.js');
const client = new Discord.Client();
const period = process.env.PERIOD;
const port = process.env.PORT || 8080;
const {promisify} = require('util');
const getAsync = promisify(redis_client.get).bind(redis_client);
const hgetallAsync = promisify(redis_client.hgetall).bind(redis_client);
const redis_client = redis.createClient(process.env.REDIS_URL);

var app = express();

app.get( "/", function( request, response ) {
    // we program the server to respond with an HTML string
    response.send( "Ok" ); 
  } );
app.get( "/status", function( request, response ) {
    // we program the server to respond with an HTML string
    response.send( "Ok" ); 
  } );

app.listen(port, function() {
    console.log('Our app is running on http://localhost:' + port)
})

function keepalive() {
    setInterval(function() {
        http.get("http://sg-voice-bot.herokuapp.com/status");
        keepalive();
    }, 300000); // every 5 minutes (300000)
}

client.login(process.env.BOT_TOKEN);


client.on('message', msg => {
    if (msg.author == client.user) { // Prevent bot from responding to its own messages
        return
    }
    
    if (msg.content.startsWith("!")) {
        processCommand(msg)
    }
    if (msg.channel.name === process.env.CHANNEL && msg.author.bot != true) {
        addChannel(msg, msg.content, msg.content);
        msg.reply('I have created your channel: ' + msg.content);
    }
})


function removeChannel(channel) {
    var cur_channel = client.channels.get(channel.id);
    if (cur_channel !== undefined) {
        var numUsers = 0
        try{ 
            var numUsers = cur_channel.members.map(g => g.user).length;
        }
        catch(err) {
            console.log("Error getting members map" + err);
        }
        if ( numUsers == 0 ) {
            console.log("Removing " + cur_channel.name);
            try {
                redis_client.get(cur_channel.id, function(error, result) {
                    if (error) throw error;
                    console.log('GET result ->', result)
                    if (result === null) {
                        console.log('channel was not made by bot')
                    } else {
                        console.log('channel was made by bot')
                        redis_client.del(cur_channel.id,function(err) {
                            if(err) {
                                throw err;
                            }
                        })
                        cur_channel.delete();
                    }
                });
            }
            catch(err) {
                console.log(err);
            }
        }
    }
}

function addChannel(message,args,eventName){
    var guild = message.guild;
    guild.createChannel(eventName, { 
        type: 'voice',
        permissionOverwrites: [{
            id: message.author,
            allow: ['CONNECT', 'VIEW_CHANNEL', 'SPEAK', 'CREATE_INSTANT_INVITE', 'MANAGE_CHANNELS']
        }]
    }).then(
        (chan) => {
            var textChan = message.channel;
            chan.setParent(textChan.parentID).then( // Move the voice channel to the current message's parent category.
                (chan2) => {
                    chan2.edit({ bitrate: 128000 }).catch(console.error);
                    redis_client.set(chan2.id, 'created',function(err) {
                        if(err) {
                            throw err;
                        }
                    })
                    console.log("Adding " + chan2.name);
                    setTimeout(function() {
                        removeChannel(chan2);
                    }, 1000 * period);
                }
            ).catch(console.error);
        }
    ).catch(console.error);
    return '```Added```';
}

keepalive();

client.on('voiceStateUpdate', (oldMember, newMember) => {
    let newUserChannel = newMember.voiceChannel;
    let oldUserChannel = oldMember.voiceChannel;
    if (newUserChannel !== undefined) {
        renameVoiceChannel(newUserChannel);
        removeChannel(oldUserChannel);
    }
    if (oldUserChannel !== undefined) {
        renameVoiceChannel(oldUserChannel);
        removeChannel(oldUserChannel);
    }
})

// Code originally created by NanoDano https://www.devdungeon.com/content/javascript-discord-bot-tutorial
function processCommand(msg) {
    let fullCommand = msg.content.substr(1) // Remove the leading exclamation mark
    let splitCommand = fullCommand.match(/\w+|"[^"]+"/g) // Split the message up in to pieces for each space
    let primaryCommand = splitCommand[0] // The first word directly after the exclamation is the command
    let arguments = splitCommand.slice(1) // All other words are arguments/parameters/options for the command

    console.log("Command received: " + primaryCommand)
    console.log("Arguments: " + arguments) // There may not be any arguments

    if (primaryCommand == "sgVoiceSetup") {
        sgVoiceSetup(arguments, msg)
    } else if(primaryCommand == "sgVoiceRenamer") {
        sgVoiceRenamer(arguments, msg)
    } else if(primaryCommand == "sgRemoveVoiceRenamer") {
        sgRemoveVoiceRenamer(arguments, msg)
    }
}

function sgVoiceSetup(arguments, msg) {
    msg.channel.send("Voice command available: !sgVoiceRenamer \"category\" \"Current Channel Pattern\" \"NewChannelPattern\"")
    console.log("Guild ID: ", msg.member.guild.id, ", Registered Channel ID: ", msg.channel.id);
     
    redis_client.set(msg.member.guild.id, msg.channel.id,function(err) {
        if(err) {
            throw err;
        }
    }) 
}

async function sgVoiceRenamer(arguments, msg) {
    let result = await getAsync(msg.member.guild.id);
    if(result === msg.channel.id) {
        var channel = msg.guild.channels.find(channel => channel.type === "category" && channel.name === arguments[1].replace(/['"]+/g, ''))
        if(arguments.length === 4) {
            redis_client.hmset(channel.id, 'numOfMembers', arguments[0], 'currentPattern', arguments[2].replace(/['"]+/g, ''), 'newPattern', arguments[3].replace(/['"]+/g, ''))
        }
    }
}

async function sgRemoveVoiceRenamer(arguments, msg) {
    let result = await getAsync(msg.member.guild.id);
    if(result === msg.channel.id) {
        if(arguments.length === 1) {
            var channel = msg.guild.channels.find(channel => channel.type === "category" && channel.name === arguments[0].replace(/['"]+/g, ''))
            redis_client.del(channel.id);
        }
    }
}

async function renameVoiceChannel(channel) {
    let x = await hgetallAsync(channel.parentID)
    if(x) {
        // First check if channel matches a pattern
        let currentPattern = new RegExp(x.currentPattern, "g");
        let newPattern = new RegExp(x.newPattern, "g");
        if(channel.name.match(currentPattern)) {
            if(channel.members.map(g => g.user).length > x.numOfMembers) {
                channel.setName(channel.name.replace(currentPattern, x.newPattern))
            }
        } else if(channel.name.match(newPattern)) {
            if(channel.members.map(g => g.user).length <= x.numOfMembers) {
                channel.setName(channel.name.replace(newPattern, x.currentPattern))
            }
        }        
    }
}
