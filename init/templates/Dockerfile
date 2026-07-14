FROM denoland/deno:debian-2.9.2 AS build
WORKDIR /app
COPY deno.json deno.lock ./
RUN deno install --allow-scripts
COPY . .
RUN deno task build

FROM denoland/deno:distroless-2.9.2
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/deno.json /app/deno.lock ./
COPY server.prod.ts ./
EXPOSE 8000
CMD ["serve", "-A", "--host", "0.0.0.0", "--port", "8000", "server.prod.ts"]
