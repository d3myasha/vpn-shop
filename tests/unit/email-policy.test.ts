import { afterEach, describe, expect, it } from "vitest";
import { getAllowedEmailDomains, isEmailDomainAllowed } from "@/lib/email-policy";

const ORIGINAL_DOMAINS = process.env.ALLOWED_EMAIL_DOMAINS;

afterEach(() => {
  if (ORIGINAL_DOMAINS === undefined) {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    return;
  }

  process.env.ALLOWED_EMAIL_DOMAINS = ORIGINAL_DOMAINS;
});

describe("email policy", () => {
  it("allows default popular domains", () => {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    expect(isEmailDomainAllowed("user@gmail.com")).toBe(true);
    expect(isEmailDomainAllowed("user@yandex.ru")).toBe(true);
    expect(isEmailDomainAllowed("user@example.com")).toBe(false);
  });

  it("uses custom domain list from env", () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "example.com, custom.org";
    expect(getAllowedEmailDomains()).toEqual(["example.com", "custom.org"]);
    expect(isEmailDomainAllowed("user@example.com")).toBe(true);
    expect(isEmailDomainAllowed("user@gmail.com")).toBe(false);
  });
});
