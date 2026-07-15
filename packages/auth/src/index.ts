import NextAuth from "next-auth";
import { authConfig } from "./config";
import "./types";

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);

export type { Session } from "next-auth";
