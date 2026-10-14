FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 build-essential libvips-dev ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY . .
RUN mkdir -p sessions data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--max-old-space-size=1536", "server.js"]
