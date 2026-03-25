import { expect, test } from "@playwright/test";

test("home page renders pricing cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "VPN подписки" })).toBeVisible();
  await expect(page.getByText("Простая подписка")).toBeVisible();
});

test("health endpoint responds with ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as { ok?: boolean };
  expect(data.ok).toBe(true);
});
