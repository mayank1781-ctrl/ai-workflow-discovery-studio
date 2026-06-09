FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
