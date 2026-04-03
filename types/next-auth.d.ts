import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "OWNER" | "ADMIN" | "CUSTOMER";
      botUserId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: "OWNER" | "ADMIN" | "CUSTOMER";
    botUserId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "OWNER" | "ADMIN" | "CUSTOMER";
    botUserId?: string;
  }
}
