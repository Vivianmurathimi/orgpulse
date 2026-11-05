FROM node:22-alpine

# Prisma's database engine needs OpenSSL, which Alpine leaves out
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first, so Docker can reuse this layer when only code changes
COPY package.json ./
RUN npm install

# Copy the code, generate the Prisma client (once the service has one), compile TypeScript
COPY . .
RUN if [ -d prisma ]; then npx prisma generate; fi
RUN npm run build

EXPOSE 4003

# On start: apply database migrations (if any), then run the service.
# set -e stops the container if a migration fails.
CMD ["sh", "-c", "set -e; if [ -d prisma ]; then npx prisma migrate deploy; fi; exec node dist/index.js"]
