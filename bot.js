var http = require('http');
const Discord = require('discord.js')
const client = new Discord.Client()
const period = process.env.PERIOD

http.createServer(function (request, response) {
}).listen(process.env.PORT || 5000);

client.on('message', msg => {
  if (msg.channel.name === process.env.CHANNEL && msg.author.bot != true) {
    //console.log(msg.author)
    //console.log(msg.channel.name)
    addChannel(msg, msg.content, msg.content)
    msg.reply('I have created your channel: ' + msg.content)
  }
})

client.login(process.env.BOT_TOKEN)

function someaction(channel) {
     /** 
    console.log("2" + channel.members);
    console.log("3" + channel.name);
    console.log("4" + channel.id);
    //console.log("5" + client.channels.get(channel.id));
     */
    var updated = client.channels.get(channel.id);
    //console.log(updated.members.map(g => g.user).length);
    var numUsers = updated.members.map(g => g.user).length
    if ( numUsers == 0 ) {
        console.log("Removing " + channel.name)
        channel.delete();
    } else {
        //console.log("Still a user in the channel")
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
        id: guild.id,
        type: 'voice',
        permissionOverwrites: [{
            'CONNECT': true,
            'VIEW_CHANNEL': true,
            'SPEAK': true,
            'CREATE_INSTANT_INVITE': true,
            'MANAGE_CHANNELS': true
        }]
    }).then( // Create the actual voice channel.
        (chan) => {
            //console.log(message.channel);
            var textChan = message.channel
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

