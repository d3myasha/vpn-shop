export const formatPrice = (kopeks: number) => `${(kopeks / 100).toFixed(0)} ₽`;

export const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(parsed);
};

export const daysLeft = (endDate: string | null | undefined) => {
  if (!endDate) {
    return null;
  }

  const parsed = new Date(endDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const diff = parsed.getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
};
