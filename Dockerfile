FROM node:12
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
#RUN npm install discord.js @discordjs/opus

COPY . .

CMD [ "node", "bot.js" ]