export function normalizeCommunityTrend(row) {
  const mentions = Number(row.community_mention_count);
  const score = Number(row.community_score);
  return {
    status: row.community_freshness || 'missing',
    mentions: Number.isFinite(mentions) ? mentions : 0,
    score: Number.isFinite(score) ? score : 0,
    upvotes: Number(row.community_upvotes) || 0,
    comments: Number(row.community_comments) || 0,
    source: row.community_source || null,
    snapshotTs: row.community_snapshot_ts || null,
    windowHours: Number(row.community_window_hours) || null,
  };
}

export function communityHeatLabel(community) {
  if (!community || community.status === 'missing') return '未采集';
  if (community.mentions >= 5 || community.score >= 20) return '高';
  if (community.mentions >= 2 || community.score >= 8) return '中';
  return '低';
}
