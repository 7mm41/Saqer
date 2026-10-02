"use strict";
// تحويل صفوف قاعدة البيانات إلى ما يُرسل للواجهة (بدون بيانات خاصة).

const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
};

function distanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined || !Number.isFinite(Number(v)))) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

function createPresenter(db, hub) {
  const q = {
    providerStats: db.prepare(
      `SELECT (SELECT AVG(rating) FROM reviews WHERE provider_id = ?1) AS rating,
              (SELECT COUNT(*) FROM reviews WHERE provider_id = ?1) AS reviews_count,
              (SELECT COUNT(*) FROM orders WHERE provider_id = ?1 AND status = 'completed') AS completed_count`
    ),
    category: db.prepare("SELECT id, name, icon FROM categories WHERE id = ?"),
  };

  function user(u, stats = q.providerStats.get(u.id)) {
    const online = hub.isOnline(u);
    return {
      id: u.id,
      name: u.name,
      bio: u.bio,
      city: u.city,
      languages: parse(u.languages),
      available: !!u.available,
      online,
      last_seen_at: online ? null : u.last_seen_at || null,
      member_since: u.created_at,
      rating: stats.rating ? Math.round(stats.rating * 10) / 10 : null,
      reviews_count: stats.reviews_count,
      completed_count: stats.completed_count,
    };
  }

  // صف خدمة منضم مع بيانات مقدمها (أعمدة u_*) وإحصاءاتها.
  function service(r, near) {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      skills: parse(r.skills),
      experience_years: r.experience_years,
      experience_note: r.experience_note,
      price: r.price,
      unit: r.unit,
      mode: r.mode,
      city: r.city,
      active: !!r.active,
      category: q.category.get(r.category_id),
      rating: r.s_rating ? Math.round(r.s_rating * 10) / 10 : null,
      reviews_count: r.s_reviews || 0,
      completed_count: r.s_completed || 0,
      distance_km: near ? distanceKm(near.lat, near.lng, r.u_lat, r.u_lng) : null,
      provider: {
        id: r.user_id,
        name: r.u_name,
        city: r.u_city,
        languages: parse(r.u_languages),
        available: !!r.u_available,
        online: hub.isOnline({ id: r.user_id, available: r.u_available, last_seen_at: r.u_last_seen_at }),
        last_seen_at: r.u_last_seen_at || null,
      },
    };
  }

  return { user, service };
}

// استعلام الخدمات مع بيانات مقدميها؛ يُضاف إليه WHERE حسب الحاجة.
const SERVICE_SELECT = `
  SELECT s.*, u.name AS u_name, u.city AS u_city, u.languages AS u_languages, u.available AS u_available,
         u.last_seen_at AS u_last_seen_at, u.lat AS u_lat, u.lng AS u_lng,
         (SELECT AVG(rating) FROM reviews r WHERE r.service_id = s.id) AS s_rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.service_id = s.id) AS s_reviews,
         (SELECT COUNT(*) FROM orders o WHERE o.service_id = s.id AND o.status = 'completed') AS s_completed
  FROM services s JOIN users u ON u.id = s.user_id`;

module.exports = { createPresenter, distanceKm, SERVICE_SELECT, parse };
