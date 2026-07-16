import assert from 'node:assert/strict';
import test from 'node:test';

import { communityHeatLabel, normalizeCommunityTrend } from './communityTrend.js';

test('normalizes persisted community fields without inventing missing heat', () => {
  const missing = normalizeCommunityTrend({});
  assert.equal(missing.status, 'missing');
  assert.equal(missing.mentions, 0);
  assert.equal(communityHeatLabel(missing), '未采集');
});

test('labels heat from bounded mention and engagement score', () => {
  const trend = normalizeCommunityTrend({
    community_freshness: 'fresh', community_mention_count: '5', community_score: '12.5',
    community_upvotes: '120', community_comments: '30', community_window_hours: '24',
  });
  assert.equal(trend.mentions, 5);
  assert.equal(trend.windowHours, 24);
  assert.equal(communityHeatLabel(trend), '高');
});
