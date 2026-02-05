FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
# Install dependencies with pnpm
RUN corepack enable && pnpm install

COPY . /app

EXPOSE 3003
CMD ["pnpm", "nx", "serve", "@questurian/abw-client", "--host", "0.0.0.0", "--port", "3003"]
