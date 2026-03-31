# Use Node.js LTS version
FROM node:22-slim

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies with hoisting for native modules
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Rebuild better-sqlite3 native module using node-gyp
RUN npm install -g node-gyp && \
    (cd node_modules/better-sqlite3 2>/dev/null && node-gyp rebuild) || \
    (find .pnpm -name "better-sqlite3" -type d -path "*/node_modules/better-sqlite3" | head -1 | xargs -I {} sh -c 'cd "{}" && node-gyp rebuild')

# Copy TypeScript config
COPY tsconfig.json ./

# Copy source code
COPY src ./src
COPY scripts ./scripts

# Build TypeScript code
RUN pnpm build

# Copy environment variables (from .env.example as .env)
COPY .env.example .env

# Expose the port
EXPOSE 3001

# Start the backend server
CMD export $(cat .env | grep -v "^#" | xargs) && pnpm start
