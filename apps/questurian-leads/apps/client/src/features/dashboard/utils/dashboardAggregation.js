import { getItemDate } from './dashboardItems';

export function buildDashboardCombinedItems({
  diarioCorreoPosts,
  elComercioPosts,
  instagramPosts,
  leads,
  scrapes,
  youtubePosts,
}) {
  return [
    ...leads.map((lead) => ({ data: lead, type: 'lead' })),
    ...instagramPosts.map((post) => ({ data: post, type: 'instagram' })),
    ...elComercioPosts.map((post) => ({ data: post, type: 'el_comercio' })),
    ...diarioCorreoPosts.map((post) => ({ data: post, type: 'diario_correo' })),
    ...youtubePosts.map((post) => ({ data: post, type: 'youtube' })),
    ...scrapes.map((scrape) => ({ data: scrape, type: 'scrape' })),
  ];
}

export function sortDashboardItems(items) {
  return [...items].sort((left, right) => {
    const leftDate = getItemDate(left);
    const rightDate = getItemDate(right);
    const leftTimestamp = leftDate ? leftDate.getTime() : 0;
    const rightTimestamp = rightDate ? rightDate.getTime() : 0;

    return rightTimestamp - leftTimestamp;
  });
}
