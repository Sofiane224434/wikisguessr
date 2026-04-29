# syntax=docker/dockerfile:1

# --- Stage 1 : build Vite ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# API exposee via le reverse proxy interne (nginx du conteneur frontend)
ENV VITE_API_URL=/api

RUN npm run build

# --- Stage 2 : nginx pour servir le build et proxy /api -> backend ---
FROM nginx:alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
