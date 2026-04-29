# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Installer les deps en mode prod
COPY package*.json ./
RUN npm ci --omit=dev

# Copier le code
COPY . .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]
