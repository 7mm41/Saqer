import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
  const paths = ['', '/how-it-works', '/services', '/protection', '/areas', '/join', '/faq', '/about', '/contact', '/terms', '/privacy', '/cancellation', '/technician-agreement', '/book'];
  return paths.map((p) => ({ url: `${site}${p}`, changeFrequency: 'weekly', priority: p === '' ? 1 : 0.6 }));
}
