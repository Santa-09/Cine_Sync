FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY server/package*.json server/
COPY client/package*.json client/

RUN npm ci --ignore-scripts
RUN cd server && npm ci
RUN cd client && npm ci

COPY . .

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY server/package*.json server/
RUN cd server && npm ci --omit=dev

COPY --from=build /app/server/src server/src
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/movies/.gitkeep movies/.gitkeep

RUN mkdir -p /data/movies

CMD ["node", "server/src/index.js"]
