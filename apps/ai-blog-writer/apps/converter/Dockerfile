FROM node:20-slim

WORKDIR /app/apps/converter

# Copy package files
COPY apps/converter/package.json ./

# Install dependencies
RUN npm install

# Copy source
COPY apps/converter/src ./src
COPY apps/converter/tsconfig.json ./

# Run with tsx for development (hot reload)
CMD ["npx", "tsx", "watch", "src/index.ts"]
