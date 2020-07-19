var express = require( "express" );
var http = require('http');
var redis = require('redis');
const dotenv = require('dotenv');
dotenv.config();
let commands = require('./commands')
const Discord = require('discord.js');
const client = new Discord.Client();
const port = process.env.PORT || 8080;
const {promisify} = require('util');
const redis_client = redis.createClient(process.env.REDIS_URL);
const hgetallAsync = promisify(redis_client.hgetall).bind(redis_client);
const getAsync = promisify(redis_client.get).bind(redis_client);

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
        // print(msg)
        createChannelsFromText(msg, msg.content);
    }
})

try{
    keepalive();
} catch(err) {
    console.log("Error in keepalive" + err);
}



// Events when someone joins or leaves a voice channel
client.on('voiceStateUpdate', async (oldState, newState) => {
    console.log("There was a voice state update")
    // console.log(newState)
    // Ignore when a user is testing their mike
    if(newState.selfMute === true || oldState.selfMute === true) {
        return true;
    }
    
    // User has joined a voice channel
    if (newState.channelID !== null) {
        console.log("User has joined a voice channel")
        // Types of Voice channels today
        // 1. Generator. Generator == a channel that creates a new voice channel based on a pattern
        // 2. voiceChannel - text driven voice channel
        let generator = await generatorCheck(newState.channelID)
        if (generator) {
            console.log("Creating a new generator channel for: ", generator.pattern)
            createGenChannels(newState, generator)
        } else {
            let voiceChannel = await newState.guild.channels.cache.get(newState.channelID)
            // Try to rename if there is a pattern
            renameVoiceChannel(voiceChannel);
            // Check if there are at least 2 members in the channel 
            console.log("Preparing to check if we need to add a text channel")
            if(Array.from(voiceChannel.members.keys()).length >= 2) {
                console.log("Yep need to make a text channel")
                await createTextChannel(voiceChannel);
                // Let people know someone joined the channel
                await echoChannelJoined(newState);
            }
        }
    }

    // User has left a channel
    if (oldState.channelID !== null && oldState.channelID !== undefined) {
        console.log("user has left a channel")
        // console.log(oldState.channelID)
        let generator = await generatorCheck(oldState.channelID)
        if (!generator) {
            let oldVoiceChannel = await oldState.guild.channels.cache.get(oldState.channelID)
            renameVoiceChannel(oldVoiceChannel);
            let channelRemoved = await removeChannel(oldVoiceChannel);
            // If the channel was removed, no need to echo
            if (!channelRemoved) {
                echoChannelLeft(oldState);
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


async function echoChannelJoined (voiceState) {
    console.log("echo Channel Joined")
    // console.log(voiceState)
    const channelInfo = await hgetallAsync(voiceState.channelID)
    if (!channelInfo) return;
    const channel = voiceState.guild.channels.cache.find(ch => ch.id === channelInfo.textChannel);
    // Do nothing if the channel wasn't found on this server
    if (!channel) return;
    // Send the message, mentioning the member
    channel.createOverwrite(voiceState.id, {
        VIEW_CHANNEL: true,
        SEND_MESSAGES: true,
        ATTACH_FILES: true,
        READ_MESSAGE_HISTORY: true,
        EMBED_LINKS: true
    })
    let user = voiceState.guild.members.cache.get(voiceState.id)
    // console.log(user)
    //let username = voiceState.nickname === null ? voiceState.user.username : voiceState.nickname
    let username = user.nickname === null ? user.user.username : user.nickname
    channel.send(`${username} has joined the channel`);
}

async function echoChannelLeft (voiceState) {
    console.log("Echo channel left")
    // console.log(voiceState)
    const channelInfo = await hgetallAsync(voiceState.channelID)
    if (!channelInfo) return;
    // console.log(channelInfo)
    const channel = voiceState.guild.channels.cache.find(ch => ch.id === channelInfo.textChannel);
    // Do nothing if the channel wasn't found on this server
    if (!channel) return;
    channel.createOverwrite(voiceState.id, {
        id: voiceState.id
    })
    let user = voiceState.guild.members.cache.get(voiceState.id)
    // console.log(user)
    let username = user.nickname === null ? user.user.username : user.nickname
    // Send the message, mentioning the member
    //let username = voiceState.nickname === null ? voiceState.user.username : voiceState.nickname
    channel.send(`${username} has left the channel`);
}


function removeChannel(cur_channel) {
    console.log("removeChannel")
    //var cur_channel = client.channels.cache.get(channel.id);
    // console.log(cur_channel)
    if (cur_channel !== undefined) {
        var numUsers = 0
        try{ 
            var numUsers = cur_channel.members.map(g => g.user).length;
            console.log(numUsers)
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
    console.log("Create text channel")
    let textChan = await hgetallAsync(voiceChannel.id);
    console.log("Creating a text channel for: ", voiceChannel.name)
    // Skip quiet time channel
    if(voiceChannel.name === 'Quiet Time/AFK') {
        return;
    }
    if(textChan !== null) {
        if(textChan.textChannel !== undefined) {
            console.log("Exiting create channel process as textChannel already exists")
            return;
        }
    } else {
        console.log("No voice channel owned by bot so making a new text channel redis object")
        textChan = new Object();
        textChan.ownedbybot = false;
        textChan.name = voiceChannel.name;
    }
    // Prepend the voice symbol🔊
    channelName = "🔊" + voiceChannel.name
    console.log("The new text channel name is: ", channelName)

    // Create permissions block
    const allow = ['MANAGE_CHANNELS', 'READ_MESSAGE_HISTORY', 'VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES'];
    let keys = await Array.from(voiceChannel.members.keys())
    const role_everyone = await voiceChannel.guild.roles.cache.get(voiceChannel.guild.id)
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
    let textChannel = await voiceChannel.guild.channels.create(channelName, { 
        type: 'text',
        parent: voiceChannel.parentID, //channel.parentID,
        permissionOverwrites: permissionOverwriteArray
    })
    textChan.textChannel = textChannel.id
    console.log("Created textChannel: ", textChan)
    await redis_client.hmset(voiceChannel.id, textChan)
}

async function renameVoiceChannel(channel) {
    try{
        console.log("rename voice channel start")
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
        // check for rate limit
        console.log("Checking user for rate limit: ", message.author.id)
        if (await rateLimitCheck(message.author.id)) {
            console.log("User hit rate limit")
            return;
        }
        // console.log(message)
        const guild = message.channel.guild;
        const role_everyone = guild.roles.cache.get(guild.id)
        let voiceChannel = await guild.channels.create(channelName, { 
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
        await redis_client.set(message.author.id, 'true', 'EX', 15);
        message.reply('I have created your channel: ' + message.content);
        return voiceChannel
    } catch (error) {
        console.error(error)
    }
}

async function rateLimitCheck(memberID) {
    let ratelimituser = await getAsync(memberID);
    console.log("MemberID: ", memberID, " Redis response: ", ratelimituser)
    if (ratelimituser !== null) {
        return true;
    } else {
        return false;
    }
}

async function createGenChannels (voiceState, generator) { // guildid, categoryid
    try {
        if (generator.pattern === undefined) {
            return;
        }

        // check for rate limit
        if (await rateLimitCheck(voiceState.id)) {
            console.log("User hit rate limit")
            return;
        }
        const currentChannel = voiceState.guild.channels.cache.get(voiceState.channelID)
        const role_everyone = voiceState.guild.roles.cache.get(voiceState.guild.id)
        let channame = generator.pattern + " " + generator.next
        generator.next = (Number(generator.next)%9)+1
        generator.ownedbybot = true
        await redis_client.hmset(voiceState.channelID, generator)

        // First create the voice channel
        let voiceChannel = await voiceState.guild.channels.create(channame, { 
            type: 'voice',
            parent: currentChannel.parentID,
        })
        await redis_client.hmset(voiceChannel.id, {
            'name': voiceChannel.name,
            'ownedbybot': true
        })
        voiceState.setChannel(voiceChannel)
        await redis_client.set(voiceState.id, 'true', 'EX', 15)
        return voiceChannel
    } catch (error) {
        console.error(error)
    }
}

async function removeChannels(channel) {
    try {
        console.log("Remove channel")
        // console.log(channel)
        let x = await hgetallAsync(channel.id)
        console.log('GET result ->', x)
        if (x === null) {
            console.log(channel.name, ': was not made by bot')
        } else if (x.ownedbybot !== 'true') {
            console.log(channel.name, ': was not made by bot')
            console.log(x)
            if(x.textChannel !== undefined) {
                console.log("removing text channel");
                tchannel = await client.channels.cache.get(x.textChannel);
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
            tchannel = await client.channels.cache.get(x.textChannel);
            if(tchannel !== undefined) {
                console.log("Deleting text channel")
                await tchannel.delete();
            }
            
        }
    } catch (error) {
        console.error(error)
    }
}