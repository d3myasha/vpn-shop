import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "OWNER" | "ADMIN" | "CUSTOMER";
    } & DefaultSession["user"];
  }

  interface User {
    role: "OWNER" | "ADMIN" | "CUSTOMER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "OWNER" | "ADMIN" | "CUSTOMER";
  }
}
