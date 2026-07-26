// Human-readable label for IB's provider codes. Falls back to the raw code
// for any provider not in this list (deliberately not exhaustive -- this is
// display polish, not a compliance requirement; the raw code alone already
// satisfies "disclose the source").
const PROVIDER_LABELS = {
  'DJ-N': 'Dow Jones',
  'DJ-RT': 'Dow Jones (实时)',
  'DJ-RTG': 'Dow Jones (全球)',
  'DJ-RTE': 'Dow Jones (欧洲)',
  BRFG: 'Briefing.com',
  BRFUPDN: 'Briefing.com (分析师观点)',
  BZ: 'Benzinga',
  FLY: 'The Fly',
};

export function providerLabel(code) {
  return PROVIDER_LABELS[code] || code || '未知来源';
}

// IB broadcasts the same real story through several provider-code variants
// (e.g. DJ-N/DJ-RT/DJ-RTG) with an identical headline -- storage keeps every
// row (each is a distinct provider-attributed fact), but showing all of them
// to a user reads as spammy repetition, so the display list dedupes by
// headline text and keeps the first (newest, since the API already orders
// newest-first).
function dedupeByHeadline(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.headline)) return false;
    seen.add(item.headline);
    return true;
  });
}

export function applyNews(data, newsData) {
  if (!data) return data;
  if (!newsData) return { ...data, recentNews: null };
  const items = dedupeByHeadline((newsData.items || []).map(item => ({
    publishedAt: item.published_at,
    providerCode: item.provider_code,
    articleId: item.article_id,
    headline: item.headline,
    source: item.source,
  })));
  return {
    ...data,
    recentNews: {
      windowHours: newsData.window_hours,
      count: newsData.count,
      latestPublishedAt: newsData.latest_published_at,
      items,
    },
  };
}
