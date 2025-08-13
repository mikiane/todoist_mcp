# Node 20 slim
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
# Port standard pour Cloud Run
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]

