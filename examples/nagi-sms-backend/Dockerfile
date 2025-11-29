FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN if [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm install --frozen-lockfile; elif [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
EXPOSE 4000
