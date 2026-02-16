FROM node:20-alpine

WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/

# Install ALL dependencies (including dev) so all package files are present
RUN npm install --legacy-peer-deps --include=dev

# Copy source files
COPY shared/ ./shared/
COPY server/ ./server/
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Build server only
RUN npm run build --workspace=server

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=server"]
