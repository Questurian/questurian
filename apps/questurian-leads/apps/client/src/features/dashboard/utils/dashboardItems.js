import { parseDateValue } from './dashboardFormatters';

export function getItemDate(item) {
  const { type, data } = item;
  const dateFields = [];

  switch (type) {
    case 'lead':
      dateFields.push(data.published, data.collected_at);
      break;
    case 'instagram':
      dateFields.push(data.posted_at, data.collected_at);
      break;
    case 'el_comercio':
    case 'diario_correo':
    case 'youtube':
    case 'scrape':
      dateFields.push(data.published_at, data.collected_at);
      break;
    default:
      dateFields.push(
        data.published,
        data.published_at,
        data.posted_at,
        data.collected_at,
      );
  }

  for (const dateField of dateFields) {
    if (!dateField) continue;

    const parsed = parseDateValue(dateField);
    if (parsed) return parsed;
  }

  return null;
}

export function getDashboardItemKey(item) {
  if (item.type === 'scrape') {
    return `${item.data.content_type}-${item.data.content_id}`;
  }

  return `${item.type}-${item.data.id}`;
}
