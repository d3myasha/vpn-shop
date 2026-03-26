const DEFAULT_ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yandex.ru",
  "ya.ru",
  "mail.ru",
  "inbox.ru",
  "list.ru",
  "bk.ru",
  "icloud.com",
  "me.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "proton.me",
  "protonmail.com",
];

function parseAllowedDomains(raw: string | undefined) {
  if (!raw) {
    return DEFAULT_ALLOWED_EMAIL_DOMAINS;
  }

  const domains = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return domains.length > 0 ? domains : DEFAULT_ALLOWED_EMAIL_DOMAINS;
}

export function getAllowedEmailDomains() {
  return parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS);
}

export function isEmailDomainAllowed(email: string) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) {
    return false;
  }

  const domain = email.slice(atIndex + 1).toLowerCase();
  return getAllowedEmailDomains().includes(domain);
}
