var express = require( "express" );
var http = require('http');
var redis = require('redis');
let commands = require('./commands')
const Discord = require('discord.js');
const client = new Discord.Client();
const port = process.env.PORT || 8080;
const {promisify} = require('util');
const redis_client = redis.createClient(process.env.REDIS_URL);
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
        try{
            http.get("http://sg-voice-bot.herokuapp.com/status");
            keepalive();
        } catch(err) {
            console.log("Error in keepalive" + err);
        }
    }, 300000); // every 5 minutes (300000)
}

client.login(process.env.BOT_TOKEN);


client.on('message', msg => {
    // Prevent bot from responding to its own messages
    if (msg.author == client.user) {
        return
    }
    
    // Run process for commands that start with !
    if (msg.content.startsWith("!")) {
        commands.processCommand(msg)
    }

    // Run the Create Channel from Text function for voice-comms🔊
    if (msg.channel.name === process.env.CHANNEL && msg.author.bot != true) {
        createChannelsFromText(msg, msg.content);
        msg.reply('I have created your channel: ' + msg.content);
    }
})

try{
    keepalive();
} catch(err) {
    console.log("Error in keepalive" + err);
}



// Events when someone joins or leaves a voice channel
client.on('voiceStateUpdate', async (oldMember, newMember) => {
    // Ignore when a user is testing their mike
    if(newMember.selfMute === true || oldMember.selfMute === true) {
        return true;
    }
    
    // User has joined a voice channel
    if (newMember.voiceChannel !== undefined) {
        // Types of Voice channels today
        // 1. Generator. Generator == a channel that creates a new voice channel based on a pattern
        // 2. voiceChannel - text driven voice channel
        let generator = await generatorCheck(newMember.voiceChannel.id)
        if (generator) {
            console.log("Creating a new generator channel for: newMember.voiceChannel")
            createGenChannels(newMember, newMember.voiceChannel, generator)
        } else {
            // Try to rename if there is a pattern
            renameVoiceChannel(newMember.voiceChannel);
            // Check if there are at least 2 members in the channel 
            let voiceChannel = await newMember.guild.channels.get(newMember.voiceChannelID)
            if(Array.from(voiceChannel.members.keys()).length >= 2) {
                await createTextChannel(voiceChannel);
                // Let people know someone joined the channel
                await echoChannelJoined(newMember);
            }
        }
    }

    // User has left a channel
    if (oldMember.voiceChannel !== undefined) {
        let generator = await generatorCheck(oldMember.voiceChannel.id)
        if (!generator) {
            renameVoiceChannel(oldMember.voiceChannel);
            let channelRemoved = await removeChannel(oldMember.voiceChannel);
            // If the channel was removed, no need to echo
            if (!channelRemoved) {
                echoChannelLeft(oldMember);
            }
        }
    }
})

async function generatorCheck(voiceChannelID) {
    const gen = await hgetallAsync(voiceChannelID)
    if (gen && gen.generator === 'true') {
        return gen
    } else {
        return false;
    }
}


async function echoChannelJoined (member) {
    const channelInfo = await hgetallAsync(member.voiceChannelID)
    if (!channelInfo) return;
    const channel = member.guild.channels.find(ch => ch.id === channelInfo.textChannel);
    // Do nothing if the channel wasn't found on this server
    if (!channel) return;
    // Send the message, mentioning the member
    channel.overwritePermissions(member, {
        VIEW_CHANNEL: true,
        SEND_MESSAGES: true,
        ATTACH_FILES: true,
        READ_MESSAGE_HISTORY: true,
        EMBED_LINKS: true
    })
    let username = member.nickname === null ? member.user.username : member.nickname
    channel.send(`${username} has joined the channel`);
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
    let username = member.nickname === null ? member.user.username : member.nickname
    channel.send(`${username} has left the channel`);
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
            return true;
        } else{
            return false;
        }
    }
}

// Give a Voice Channel
async function createTextChannel(voiceChannel) {
    let textChan = await hgetallAsync(voiceChannel.id);
    if(textChan !== null) {
        if(textChan.textChannel !== null) {
            return;
        }
    }
    // Prepend the voice symbol🔊
    channelName = "🔊" + voiceChannel.name

    // Create permissions block
    const allow = ['MANAGE_CHANNELS', 'READ_MESSAGE_HISTORY', 'VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES'];
    let keys = await Array.from(voiceChannel.members.keys())
    const role_everyone = await voiceChannel.guild.roles.get(voiceChannel.guild.id)
    let permissionOverwriteArray = []
    for (var i=0; i< keys.length; i++) {
        let tempPerm = new Object();
        tempPerm.allow = allow;
        tempPerm.id = keys[i];
        permissionOverwriteArray.push(tempPerm);
    }
    permissionOverwriteArray.push({
        id: role_everyone,
        deny: ['VIEW_CHANNEL']
    })
    // Add the corresponding text channel and prevent everyone else from viewing unless they are members of the voice channel
    let textChannel = await voiceChannel.guild.createChannel(channelName, { 
        type: 'text',
        parent: voiceChannel.parentID, //channel.parentID,
        permissionOverwrites: permissionOverwriteArray
    })
    textChan.textChannel = textChannel.id
    await redis_client.hmset(voiceChannel.id, textChan)
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

async function createChannelsFromText (message,channelName) {
    try {
        const guild = message.guild;
        const role_everyone = guild.roles.get(guild.id)
        let voiceChannel = await guild.createChannel(channelName, { 
            type: 'voice',
            parent: message.channel.parentID,
            permissionOverwrites: [{
                id: message.author,
                allow: ['MANAGE_CHANNELS']
            }]
        })
        await redis_client.hmset(voiceChannel.id, {
            'name': voiceChannel.name,
            'ownedbybot': true
        })
        let channame = "🔉" + channelName
        return voiceChannel
    } catch (error) {
        console.error(error)
    }
}

async function createGenChannels (member, channel, generator) { // guildid, categoryid
    try {
        if (generator.pattern === undefined) {
            return;
        }
        const guild = channel.guild
        const role_everyone = guild.roles.get(channel.guild.id)
        let channame = generator.pattern + " " + generator.next
        generator.next = (Number(generator.next)%9)+1
        generator.ownedbybot = true
        await redis_client.hmset(channel.id, generator)

        // First create the voice channel
        let voiceChannel = await guild.createChannel(channame, { 
            type: 'voice',
            parent: channel.parentID,
        })
        await redis_client.hmset(voiceChannel.id, {
            'name': voiceChannel.name,
            'ownedbybot': true
        })
        member.setVoiceChannel(voiceChannel)
        return voiceChannel
    } catch (error) {
        console.error(error)
    }
}

async function removeChannels(channel) {
    try {
        let x = await hgetallAsync(channel.id)
        console.log('GET result ->', x)
        if (x === null) {
            console.log(channel.name, ': was not made by bot')
        } else if (x.ownedbybot !== true) {
            console.log(channel.name, ': was not made by bot')
            if(x.textChannel !== null) {
                console.log("removing text channel");
                tchannel = await client.channels.get(x.textChannel);
                if(tchannel !== undefined) {
                    console.log("Deleting text channel")
                    await tchannel.delete();
                }
                console.log("Removing from redis: ", x)
                await redis_client.del(channel.id,function(err) {
                    if(err) {
                        throw err;
                    }
                })
            }
        }else {
            console.log('channel was made by bot')
            await redis_client.del(channel.id,function(err) {
                if(err) {
                    throw err;
                }
            })
            await channel.delete();
            console.log("deleted voice channel")
            tchannel = await client.channels.get(x.textChannel);
            if(tchannel !== undefined) {
                console.log("Deleting text channel")
                await tchannel.delete();
            }
            
        }
    } catch (error) {
        console.error(error)
    }
}