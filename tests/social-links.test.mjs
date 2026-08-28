import test from 'node:test';
import assert from 'node:assert/strict';
import { iconForPlatform, safeSocialHref, validateSocialLinkInput } from '../public/social-links.js';

test('known social platforms receive automatic local icons', () => {
  for (const platform of ['instagram', 'tiktok', '2gis']) {
    const icon = iconForPlatform(platform);
    assert.match(icon, /aria-hidden="true"/);
    assert.doesNotMatch(icon, /https?:\/\//);
  }
});

test('current social platforms accept only HTTPS URLs', () => {
  assert.equal(validateSocialLinkInput({ platform: 'instagram', url: 'https://instagram.com/icefresh', label: 'Instagram', enabled: true }).valid, true);
  assert.equal(validateSocialLinkInput({ platform: 'tiktok', url: 'http://tiktok.com/@icefresh', label: 'TikTok', enabled: true }).valid, false);
  assert.equal(validateSocialLinkInput({ platform: '2gis', url: 'javascript:alert(1)', label: '2GIS', enabled: true }).valid, false);
  assert.equal(validateSocialLinkInput({ platform: 'instagram', url: '', label: 'Instagram', enabled: false }).valid, true);
  assert.equal(validateSocialLinkInput({ platform: 'instagram', url: '', label: 'Instagram', enabled: true }).valid, false);
});

test('non-HTTPS and non-public-host URLs are rejected for every platform', () => {
  assert.equal(validateSocialLinkInput({ platform: 'email', url: 'mailto:hello@icefresh.kz', label: 'Email', enabled: true }).valid, false);
  assert.equal(validateSocialLinkInput({ platform: 'phone', url: 'tel:+77000000000', label: 'Телефон', enabled: true }).valid, false);
  assert.equal(validateSocialLinkInput({ platform: 'custom', url: 'data:text/html,unsafe', label: 'Custom', enabled: true }).valid, false);
  assert.equal(validateSocialLinkInput({ platform: 'custom', url: 'https://localhost/internal', label: 'Custom', enabled: true }).valid, false);
  assert.equal(safeSocialHref('javascript:alert(1)', 'custom'), '');
});

test('external HTTPS links are rendered with opener protection', () => {
  const result = safeSocialHref('https://2gis.kz/almaty', '2gis');
  assert.equal(result, 'https://2gis.kz/almaty');
});
