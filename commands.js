const {promisify} = require('util');
var redis = require('redis');
const redis_client = redis.createClient(process.env.REDIS_URL);
const getAsync = promisify(redis_client.get).bind(redis_client);

// Code originally created by NanoDano https://www.devdungeon.com/content/javascript-discord-bot-tutorial
module.exports.processCommand = async function (msg) {
    let fullCommand = msg.content.substr(1) // Remove the leading exclamation mark
    let splitCommand = fullCommand.match(/\w+|"[^"]+"/g); // Split the message up in to pieces for each space
    let primaryCommand = splitCommand[0]; // The first word directly after the exclamation is the command
    let arguments = splitCommand.slice(1); // All other words are arguments/parameters/options for the command

    console.log("Command received: " + primaryCommand);
    console.log("Arguments: " + arguments); // There may not be any arguments

    // check if it's an authorized channel or not to use the bot
    if (!authorizedChannel(msg.member.guild.id, msg.channel.id)) {
        return false;
    }

    switch(primaryCommand) {
        case "sgVoiceSetup":
            await sgVoiceSetup(msg);
            break;
        case "sgVoiceRenamer":
            await sgVoiceRenamer(arguments, msg);
            break;
        case "sgRemoveVoiceRenamer":
            await sgRemoveVoiceRenamer(arguments, msg);
            break;
        case "sgVoiceChannel":
            await sgVoiceChannel(arguments, msg);
            break;
    }
}

// Takes a guild id and a channel id
// Queries redis to see if that channel is registered for that guild
async function authorizedChannel(guildID, channelID) {
    let result = await getAsync(guildID);
    if(result === channelID) {
        return true;
    } else {
        return false;
    }
}

// Takes the message from the user and registers this channel to be where the bot listens for commands for this guild
async function sgVoiceSetup(msg) {
    msg.channel.send("Voice command available: !sgVoiceRenamer MemberCount \"category\" \"Current Channel Pattern\" \"NewChannelPattern\"")
    console.log("Guild ID: ", msg.member.guild.id, ", Registered Channel ID: ", msg.channel.id);
     
    await redis_client.set(msg.member.guild.id, msg.channel.id,function(err) {
        if(err) {
            console.log("Error in redis_client within sgVoiceSetup:", err)
            throw err;
        }
    }) 
}

// This function Registers the channel category ID in redis with a pattern.
// The renamer requires 4 arguments in order
// MemberCount \"category\" \"Current Channel Pattern\" \"NewChannelPattern\"")
// Example: 5 "World of Warcraft" "WoW Group" "WoW Raid"
// This example would rename WoW Group to WoW Raid when the 6th member has joined, and revert when the group is back to 5 or lower
async function sgVoiceRenamer(arguments, msg) {
    if(arguments.length === 4) {
        var channel = await msg.guild.channels.find(channel => channel.type === "category" && channel.name === arguments[1].replace(/['"]+/g, ''))
        await redis_client.hmset(channel.id, 'numOfMembers', arguments[0], 'currentPattern', arguments[2].replace(/['"]+/g, ''), 'newPattern', arguments[3].replace(/['"]+/g, ''))
    }
}

// This function removes the registered channel category ID from redis
// The parameter required is the Category Name for removing the renamer
async function sgRemoveVoiceRenamer(arguments, msg) {
    if(arguments.length === 1) {
        var channel = msg.guild.channels.find(channel => channel.type === "category" && channel.name === arguments[0].replace(/['"]+/g, ''))
        await redis_client.del(channel.id);
    }
}

// This function creates a Generator Voice Channel in the root of the discord server that is registered to a pattern
async function sgVoiceChannel(arguments, msg) {
    if(arguments.length === 2) {
        let voiceChannel = await msg.member.guild.createChannel(arguments[0].replace(/['"]+/g, '') + "🔊", { 
            type: 'voice'
        })
        await redis_client.hmset(voiceChannel.id, 'generator', true, 'pattern', arguments[1].replace(/['"]+/g, ''), 'next', 1)
    }
}