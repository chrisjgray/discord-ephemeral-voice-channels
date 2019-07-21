const Discord = require('discord.js')
const client = new Discord.Client()
const period = process.env.PERIOD

client.on('message', msg => {
  if (msg.channel.name === process.env.CHANNEL && msg.author.bot != true) {
    console.log(msg.author)
    console.log(msg.channel.name)
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
        channel.delete();
    } else {
        //console.log("Still a user in the channel")
        setTimeout(function() {
            someaction(channel);
        }, 1000 * period);
    }
}

function schedule(channel) {
  console.log('Checking who is in the channel: ' + channel);
  console.log('Process finished, waiting 5 minutes');
  setTimeout(function() {
      console.log('Going to restart');
      someaction(channel);
  }, 1000 * period);
}

function addChannel(message,args,eventName){
    var server = message.guild;
    server.createChannel(eventName, 'voice').then( // Create the actual voice channel.
        (chan) => {
            //console.log(message.channel);
            var textChan = message.channel
            chan.setParent(textChan.parentID).then( // Move the voice channel to the current message's parent category.
                (chan2) => {
                    chan2.overwritePermissions(message.author, {
                       'CONNECT': true,
                       'VIEW_CHANNEL': true,
                       'SPEAK': true,
                       'CREATE_INSTANT_INVITE': true,
                       'MANAGE_CHANNELS': true

                      });
                    console.log(chan2);
                    schedule(chan2, server);
                }
            ).catch(console.error);
        }
    ).catch(console.error);
    return '```Added```';
}

