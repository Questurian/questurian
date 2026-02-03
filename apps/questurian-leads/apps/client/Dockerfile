FROM node:20-alpine

WORKDIR /repo

EXPOSE 5317

CMD ["pnpm", "--dir", "apps/client", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5317"]
