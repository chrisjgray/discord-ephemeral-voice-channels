var express = require( "express" );
var http = require('http');
var redis = require('redis');
const Discord = require('discord.js');
const client = new Discord.Client();
const period = process.env.PERIOD;
const port = process.env.PORT || 8080;
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


client.on('message', msg => {
  if (msg.channel.name === process.env.CHANNEL && msg.author.bot != true) {
    addChannel(msg, msg.content, msg.content);
    msg.reply('I have created your channel: ' + msg.content);
  }
})

client.login(process.env.BOT_TOKEN);

function someaction(channel) {
    var updated = client.channels.get(channel.id);
    //console.log(updated.members.map(g => g.user).length);
    var numUsers = 0
    try{ 
        var numUsers = updated.members.map(g => g.user).length;
    }
    catch(err) {
        console.log("Error getting members map" + err);
    }
    if ( numUsers == 0 ) {
        console.log("Removing " + channel.name);
        try {
            channel.delete();
        }
        catch(err) {
            console.log(err);
        }
    }
}

function schedule(channel) {
  setTimeout(function() {
      someaction(channel);
  }, 1000 * period);
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
                    redis_client.set(chan2.id, 'created',function(err) {
                        if(err) {
                            throw err;
                        }
                    })
                    console.log("Adding " + chan2.name);
                    schedule(chan2, guild);
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
    if(newUserChannel === undefined) { // User left the channel
        var updated = client.channels.get(oldUserChannel.id);
        var numUsers = 0;
        try{ 
            var numUsers = updated.members.map(g => g.user).length;
        }
        catch(err) {
            console.log("Error getting members map" + err);
        }
        if ( numUsers == 0 ) {
            try {
                redis_client.get(oldUserChannel.id, function(error, result) {
                    if (error) throw error;
                    console.log('GET result ->', result)
                    if (result === null) {
                        console.log('channel was not made by bot')
                    } else {
                        console.log('channel was made by bot')
                        redis_client.del(oldUserChannel.id,function(err) {
                            if(err) {
                                throw err;
                            }
                        })
                        oldUserChannel.delete();
                    }
                  });
            }
            catch(err) {
                console.log(err);
            }
        }
    }
})