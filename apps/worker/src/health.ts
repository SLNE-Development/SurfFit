import http from "node:http";
import type { Db } from "@surffit/db";
import type { ChannelModel } from "amqplib";
import { sql } from "drizzle-orm";

export function startHealthServer(opts: { db: Db; connection: ChannelModel; port: number }) {
  let amqpOpen = true;
  opts.connection.on("close", () => {
    amqpOpen = false;
  });
  opts.connection.on("error", () => {
    amqpOpen = false;
  });

  const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.url === "/readyz") {
      try {
        await opts.db.execute(sql`select 1`);
        if (!amqpOpen) throw new Error("amqp connection not open");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } catch {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "unavailable" }));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(opts.port);

  return server;
}
