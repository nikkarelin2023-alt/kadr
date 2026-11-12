FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups
USER node
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DATABASE_PATH=/app/data/kadr.sqlite
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.cjs"]
