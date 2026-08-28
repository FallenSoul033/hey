const PLATFORM_ALIASES = Object.freeze({
  instagram: 'instagram',
  tiktok: 'tiktok',
  'tik-tok': 'tiktok',
  '2gis': '2gis',
  '2-gis': '2gis',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  youtube: 'youtube',
  email: 'email',
  phone: 'phone',
});

export const PLATFORM_LABELS = Object.freeze({
  instagram: 'Instagram',
  tiktok: 'TikTok',
  '2gis': '2GIS',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  youtube: 'YouTube',
  email: 'Email',
  phone: 'Телефон',
});

export function normalizePlatform(value) {
  const slug = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  return PLATFORM_ALIASES[slug] || slug;
}

export function safeSocialHref(value, platformValue = '') {
  const url = String(value || '').trim();
  void platformValue;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.includes('.') ? parsed.href : '';
  } catch {
    return '';
  }
}

export function validateSocialLinkInput(input) {
  const platform = normalizePlatform(input?.platform);
  const label = String(input?.label || '').trim();
  const url = String(input?.url || '').trim();
  const enabled = Boolean(input?.enabled);
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(platform)) return { valid: false, reason: 'platform' };
  if (label.length < 1 || label.length > 80) return { valid: false, reason: 'label' };
  if (!url && !enabled) return { valid: true, reason: '', value: { platform, label, url: '', enabled } };
  const safeUrl = safeSocialHref(url, platform);
  if (!safeUrl) return { valid: false, reason: 'url' };
  return { valid: true, reason: '', value: { platform, label, url: safeUrl, enabled } };
}

export function labelForPlatform(platformValue) {
  const platform = normalizePlatform(platformValue);
  return PLATFORM_LABELS[platform] || platform;
}

export function iconForPlatform(platformValue) {
  const platform = normalizePlatform(platformValue);
  if (platform === 'instagram') {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle class="social-icon-dot" cx="17.5" cy="6.5" r="1"></circle></svg>';
  }
  if (platform === 'tiktok') {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 3v11.2a4.6 4.6 0 1 1-4-4.55v3.1a1.65 1.65 0 1 0 1 1.52V3h3Zm0 2.2c1.25 1.8 2.75 2.75 5 2.9v3.1c-2-.1-3.65-.75-5-1.9V5.2Z"></path></svg>';
  }
  if (platform === '2gis') {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2.5a7.2 7.2 0 0 0-7.2 7.2c0 5.2 7.2 11.8 7.2 11.8s7.2-6.6 7.2-11.8A7.2 7.2 0 0 0 12 2.5Zm0 3.5a3.7 3.7 0 1 1 0 7.4A3.7 3.7 0 0 1 12 6Z"></path></svg>';
  }
  if (platform === 'email') return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 5h18v14H3V5Zm2 2v.4l7 5 7-5V7H5Zm14 10V9.9l-7 5-7-5V17h14Z"></path></svg>';
  if (platform === 'phone') return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6.7 3 3 3-2 2.4c1.1 2.3 2.9 4.1 5.2 5.2l2.4-2 3 3-1.5 4c-.3.8-1.1 1.3-2 1.2C8.9 19 4.9 15.1 4.2 9.2c-.1-.9.4-1.7 1.2-2L6.7 3Z"></path></svg>';
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9.5 14.5 14.5 9m-7.8 8.3-1 1a3.5 3.5 0 0 0 5 5l3-3a3.5 3.5 0 0 0 0-5m3.6-8.6 1-1a3.5 3.5 0 0 0-5-5l-3 3a3.5 3.5 0 0 0 0 5"></path></svg>';
}
