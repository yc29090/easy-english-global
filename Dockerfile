FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY db ./db
COPY data ./data
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
