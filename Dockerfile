FROM node:20-alpine

WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/

# Install ALL dependencies
RUN npm install --legacy-peer-deps

# Copy source files
COPY shared/ ./shared/
COPY server/ ./server/
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Build server - bundle everything EXCEPT native modules that can't be bundled
RUN cd server && npx esbuild src/index.ts \
    --platform=node \
    --bundle \
    --format=esm \
    --outdir=../dist/server \
    --external:sharp \
    --external:pg-native \
    --external:fsevents

EXPOSE 3000

CMD ["node", "/app/dist/server/index.js"]
