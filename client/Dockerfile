# Step 1: build the React app into plain HTML, CSS and JavaScript files
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# Vite writes these addresses into the built files
ARG VITE_API_URL=http://localhost:8080
ARG VITE_SOCKET_URL=http://localhost:4004
RUN npm run build

# Step 2: serve those files with nginx, a small web server. Node isn't needed any more.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
