FROM oven/bun:1.3.0

WORKDIR /repo

EXPOSE 5317

CMD ["bun", "--cwd", "apps/client", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5317"]
