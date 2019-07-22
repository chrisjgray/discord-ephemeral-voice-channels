var express = require( "express" );
var http = require('http');
const Discord = require('discord.js');
const client = new Discord.Client();
const period = process.env.PERIOD;
const port = process.env.PORT || 8080;


//user added to server
client.on("guildMemberAdd", member => {
    try {
        console.log("New Member: " + member.name);
        member.addRole(member.roles.find(role => role.name ==="Trial Member"))
    }
    catch(err) {
        console.log("Error adding member to role" + err);
    }
})

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
    } else { //Still a user in the channel
        setTimeout(function() {
            someaction(channel);
        }, 1000 * period);
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
                    console.log("Adding " + chan2.name);
                    schedule(chan2, guild);
                }
            ).catch(console.error);
        }
    ).catch(console.error);
    return '```Added```';
}

keepalive();
