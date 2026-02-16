FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/

# Install dependencies (npm workspaces handles all at once)
RUN npm install --legacy-peer-deps

# Copy source files
COPY shared/ ./shared/
COPY server/ ./server/
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Build server only (shared has no build script - used directly as TypeScript)
RUN npm run build --workspace=server

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=server"]
