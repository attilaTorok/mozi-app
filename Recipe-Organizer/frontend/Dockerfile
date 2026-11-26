FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173
# Vite dev server: hot reload for ./src and the /api/scrape dev proxy (see vite.config.ts)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

