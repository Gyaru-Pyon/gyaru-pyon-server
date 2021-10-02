FROM node:12

ENV PORT 3000
EXPOSE 3000
ADD . /gyaru-pyon-server

WORKDIR /gyaru-pyon-server
RUN npm i && npm run build

CMD ["node", "dist"]