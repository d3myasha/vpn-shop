export function calculateDiscountRub(amountRub: number, promo: { discountPercent: number | null; discountRub: number | null } | null) {
  if (!promo) {
    return 0;
  }

  if (promo.discountRub && promo.discountRub > 0) {
    return Math.min(amountRub - 1, promo.discountRub);
  }

  const percent = Math.min(Math.max(promo.discountPercent ?? 0, 0), 99);
  const discountByPercent = Math.floor((amountRub * percent) / 100);
  return Math.min(amountRub - 1, discountByPercent);
}
