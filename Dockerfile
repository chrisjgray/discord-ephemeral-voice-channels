FROM node:10
WORKDIR /usr/src/app
COPY * ./
RUN npm install

COPY . .

CMD [ "node", "bot.js" ]