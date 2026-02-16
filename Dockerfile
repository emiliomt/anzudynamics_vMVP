FROM node:20-alpine

WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/

# Install ALL dependencies including dev (need tsx to run TypeScript directly)
RUN npm install --legacy-peer-deps

# Copy source files
COPY shared/ ./shared/
COPY server/ ./server/
COPY drizzle.config.ts ./
COPY tsconfig.json ./

EXPOSE 3000

# Run TypeScript directly with tsx - no build step needed
CMD ["npx", "tsx", "server/src/index.ts"]
