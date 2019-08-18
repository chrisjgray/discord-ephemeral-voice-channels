var express = require( "express" );
var http = require('http');
var redis = require('redis');
const Discord = require('discord.js');
const client = new Discord.Client();
const period = process.env.PERIOD;
const port = process.env.PORT || 8080;
const {promisify} = require('util');
const redis_client = redis.createClient(process.env.REDIS_URL);
const getAsync = promisify(redis_client.get).bind(redis_client);
const hgetallAsync = promisify(redis_client.hgetall).bind(redis_client);

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
        createChannels(msg, msg.content);
        msg.reply('I have created your channel: ' + msg.content);
    }
})

async function echoChannelJoined (member) {
    const channelInfo = await hgetallAsync(member.voiceChannelID)
    if (!channelInfo) return;
    const channel = member.guild.channels.find(ch => ch.id === channelInfo.textChannel);
    // Do nothing if the channel wasn't found on this server
    if (!channel) return;
    // Send the message, mentioning the member
    channel.overwritePermissions(member, {
        id: member,
        allow: ['VIEW_CHANNEL']
    })
    channel.send(`${member} has joined the channel`);
}

async function echoChannelLeft (member) {
    const channelInfo = await hgetallAsync(member.voiceChannelID)
    if (!channelInfo) return;
    const channel = member.guild.channels.find(ch => ch.id === channelInfo.textChannel);
    // Do nothing if the channel wasn't found on this server
    if (!channel) return;
    channel.overwritePermissions(member, {
        id: member
    })
    // Send the message, mentioning the member
    channel.send(`${member} has left the channel`);
}


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
            removeChannels(cur_channel);
        }
    }
}

keepalive();

client.on('voiceStateUpdate', (oldMember, newMember) => {
    let newUserChannel = newMember.voiceChannel;
    let oldUserChannel = oldMember.voiceChannel;
    if (newUserChannel !== undefined) {
        const generator = hgetallAsync(voiceChannel.id)
        if (generator && generator.generator) {
            createGenChannels(newMember, newMember.voiceChannel, generator)
        } else {
            renameVoiceChannel(newUserChannel);
            echoChannelJoined(newMember);
        }        
    }
    if (oldUserChannel !== undefined) {
        renameVoiceChannel(oldUserChannel);
        removeChannel(oldUserChannel);
        echoChannelLeft(oldMember);
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
    }else if(primaryCommand == "sgVoiceChannel") {
        sgVoiceChannel(arguments, msg)
    }
}

function sgVoiceSetup(arguments, msg) {
    msg.channel.send("Voice command available: !sgVoiceRenamer MemberCount \"category\" \"Current Channel Pattern\" \"NewChannelPattern\"")
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

async function sgVoiceChannel(arguments, msg) {
    let result = await getAsync(msg.member.guild.id);
    if(result === msg.channel.id) {
        if(arguments.length === 2) {
            let voiceChannel = await msg.member.guild.createChannel(arguments[0] + "🔊", { 
                type: 'voice'
            })
            await redis_client.hmset(voiceChannel.id, 'generator', true, 'pattern', arguments[1].replace(/['"]+/g, ''), 'next', 1)
        }
    }
}

async function renameVoiceChannel(channel) {
    try{
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
    } catch (error){
        console.error(error)
    }
    
}

async function createChannels (message,eventName) {
    try {
        const guild = message.guild;
        const role_everyone = guild.roles.get(guild.id)
        let voiceChannel = await guild.createChannel(eventName, { 
            type: 'voice',
            parent: message.channel.parentID,
            permissionOverwrites: [{
                id: message.author,
                allow: ['MANAGE_CHANNELS']
            }]
        })
        let channame = "🔉" + eventName
        let textChannel = await guild.createChannel(channame, { 
            type: 'text',
            parent: message.channel.parentID,
            permissionOverwrites: [{
                id: message.author,
                allow: ['MANAGE_CHANNELS', 'READ_MESSAGE_HISTORY', 'VIEW_CHANNEL']
            },
            {
                id: role_everyone,
                deny: ['VIEW_CHANNEL']
            }
            ]
        })
        await redis_client.hmset(voiceChannel.id, 'textChannel', textChannel.id)
        return voiceChannel
    } catch (error) {
        console.error(error)
    }
}

async function createGenChannels (member, channel, generator) { // guildid, categoryid
    try {
        const guild = channel.guild
        const role_everyone = guild.roles.get(channel.guild.id)
        let channame = generator.pattern + " " + generator.next 

        // First create the voice channel
        let voiceChannel = await guild.createChannel(channame, { 
            type: 'voice',
            parent: channel.parentID,
        })
        // Prepend the voice symbol🔊
        channame = "🔊" + channame
        // Add the corresponding text channel and prevent everyone else from viewing unless they are members of the voice channel
        let textChannel = await guild.createChannel(channame, { 
            type: 'text',
            parent: channel.parentID,
            permissionOverwrites: [{
                id: member.user.id,
                allow: ['MANAGE_CHANNELS', 'READ_MESSAGE_HISTORY', 'VIEW_CHANNEL']
            },
            {
                id: role_everyone,
                deny: ['VIEW_CHANNEL']
            }
        ]
        })
        await redis_client.hmset(voiceChannel.id, 'textChannel', textChannel.id)
        return voiceChannel
    } catch (error) {
        console.error(error)
    }
}

async function removeChannels(channel) {
    try {
        x = await hgetallAsync(channel.id)
        console.log('GET result ->', x)
        if (x === null) {
            console.log('channel was not made by bot')
        } else {
            console.log('channel was made by bot')
            redis_client.del(channel.id,function(err) {
                if(err) {
                    throw err;
                }
            })
            channel.delete();
            channel = client.channels.get(x.textChannel);
            if(channel !== undefined) {
                channel.delete();
            }
            
        }
    } catch (error) {
        console.error(error)
    }
}