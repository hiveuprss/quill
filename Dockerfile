FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 5188

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5188"]
