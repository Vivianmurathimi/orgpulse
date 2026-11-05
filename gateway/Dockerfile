FROM node:22-alpine
WORKDIR /app

# Install dependencies first, so Docker can reuse this layer when only code changes
COPY package.json ./
RUN npm install

# Copy the code and compile TypeScript into dist/
COPY . .
RUN npm run build

EXPOSE 8080
CMD ["node", "dist/index.js"]
