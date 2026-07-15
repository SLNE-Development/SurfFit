import { loadEnv } from "@surffit/core";
import { createDb } from "@surffit/db";

export const db = createDb(loadEnv().DATABASE_URL);
