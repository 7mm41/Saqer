import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const site = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/b/', '/account', '/book/return', '/api/'] }], sitemap: `${site}/sitemap.xml` };
}
