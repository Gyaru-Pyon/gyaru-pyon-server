FROM node:12

ENV PORT 3000
EXPOSE 3000
ADD . /gyaru-pyon-server

WORKDIR /gyaru-pyon-server
RUN yarn && yarn build

CMD ["node", "dist"]