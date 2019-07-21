var express = require( "express" );
var http = require('http');
const Discord = require('discord.js');
const client = new Discord.Client();
const period = process.env.PERIOD;

var app = express();

app.get( "/", function( request, response ) {
    // we program the server to respond with an HTML string
    response.send( "Ok" ); 
  } );

setInterval(function() {
    http.get("http://sg-voice-bot.herokuapp.com");
}, 300000); // every 5 minutes (300000)

http.createServer(function (request, response) {
    response.send("Ok");
}).listen(process.env.PORT || 5000);

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
    var numUsers = updated.members.map(g => g.user).length;
    if ( numUsers == 0 ) {
        console.log("Removing " + channel.name);
        channel.delete();
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
