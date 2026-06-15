# Build the TypeScript relay with development dependencies available.
FROM node:20.10.0-bookworm AS build

WORKDIR /project

# Install dependencies before copying source to improve Docker layer reuse.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY resources ./resources
RUN npm run build

# Run with production dependencies and the compiled relay code.
FROM node:20.10.0-bookworm AS runtime

ENV NODE_ENV=production

WORKDIR /project

# Install only runtime packages; sqlite3 needs its native install step.
COPY package.json package-lock.json ./
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& npm ci --omit=dev --ignore-scripts \
	&& npm rebuild sqlite3 --build-from-source \
	&& apt-get purge -y --auto-remove make g++ \
	&& rm -rf /var/lib/apt/lists/* \
	&& npm cache clean --force

COPY --from=build /project/dist ./dist
COPY --from=build /project/resources ./resources

# Compose mounts config.json and data.db for the production instance.
RUN mkdir -p data && touch config.json data.db

CMD ["node", "dist/src/WebSocket.js"]
