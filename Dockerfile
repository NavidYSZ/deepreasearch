# Simple Dockerfile to run the Node MCP server
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (faster layer caching)
COPY package.json package-lock.json* ./ 
RUN npm install --production

# Copy only what the server needs
COPY node ./node

# Default envs (can be overridden by Coolify)
ENV MCP_SERVER_PORT=8000 \
    MCP_SERVER_HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
