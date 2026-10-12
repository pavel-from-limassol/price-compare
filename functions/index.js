"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const catalog = require("./catalog.json");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function norm(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[\s_\-]+/g, " ");
}

function storeMap() {
  const map = {};
  for (const s of catalog.stores || []) {
    map[s.id] = s.name || s.id;
  }
  return map;
}

function productHaystack(product) {
  const parts = [product.name || "", product.category || ""].concat(
    product.aliases || []
  );
  return norm(parts.join(" "));
}

function matchScore(query, product) {
  const q = norm(query);
  if (!q) return 0;
  const hay = productHaystack(product);
  if (q === norm(product.name || "")) return 100;
  if (hay.includes(q)) return 80;
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length && tokens.every((t) => hay.includes(t))) return 60;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  if (hits) return 20 + hits * 10;
  return 0;
}

function findProducts(query) {
  const scored = [];
  for (const p of catalog.products || []) {
    const score = matchScore(query, p);
    if (score > 0) scored.push({ score, product: p });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.product.name || "").localeCompare(String(b.product.name || ""))
  );
  return scored;
}

function enrichOffers(product) {
  const stores = storeMap();
  const rows = [];
  for (const offer of product.offers || []) {
    const price = Number(offer.price);
    if (!Number.isFinite(price)) continue;
    const storeId = offer.store_id || "?";
    rows.push({
      store_id: storeId,
      store_name: stores[storeId] || storeId,
      price,
      currency: catalog.currency || "EUR",
      url: offer.url ?? null,
      note: offer.note ?? null,
    });
  }
  rows.sort((a, b) => a.price - b.price);
  return rows;
}

function productPayload(product, score) {
  const offers = enrichOffers(product);
  const payload = {
    id: product.id,
    name: product.name,
    unit: product.unit,
    category: product.category,
    aliases: product.aliases || [],
    offers,
  };
  if (typeof score === "number") payload.score = score;
  if (offers.length) {
    payload.cheapest = offers[0];
    payload.price_range = {
      min: offers[0].price,
      max: offers[offers.length - 1].price,
      currency: catalog.currency || "EUR",
    };
  }
  return payload;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "limassol-prices",
    auth: "none",
    currency: catalog.currency || "EUR",
    updated_at: catalog.updated_at || null,
  });
});

app.get("/api/meta", (_req, res) => {
  res.json({
    schema: catalog.schema || "limassol-prices.catalog/v1",
    currency: catalog.currency || "EUR",
    updated_at: catalog.updated_at || null,
    store_count: (catalog.stores || []).length,
    product_count: (catalog.products || []).length,
    auth: "none",
    openapi: "/openapi.yaml",
  });
});

app.get("/api/stores", (_req, res) => {
  res.json({
    currency: catalog.currency || "EUR",
    stores: catalog.stores || [],
  });
});

app.get("/api/products", (_req, res) => {
  const products = (catalog.products || []).map((p) => productPayload(p));
  res.json({
    currency: catalog.currency || "EUR",
    updated_at: catalog.updated_at || null,
    count: products.length,
    products,
  });
});

app.get("/api/products/:id", (req, res) => {
  const product = (catalog.products || []).find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: "product_not_found", id: req.params.id });
    return;
  }
  res.json(productPayload(product));
});

app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "missing_query", hint: "Pass ?q=..." });
    return;
  }
  const hits = findProducts(q).map(({ score, product }) =>
    productPayload(product, score)
  );
  res.json({
    query: q,
    currency: catalog.currency || "EUR",
    count: hits.length,
    products: hits,
  });
});

app.get("/api/compare", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "missing_query", hint: "Pass ?q=..." });
    return;
  }
  const hits = findProducts(q);
  if (!hits.length) {
    res.status(404).json({ error: "not_found", query: q, products: [] });
    return;
  }
  const best = productPayload(hits[0].product, hits[0].score);
  res.json({
    query: q,
    currency: catalog.currency || "EUR",
    product: best,
    alternatives: hits.slice(1, 5).map(({ score, product }) =>
      productPayload(product, score)
    ),
  });
});

app.get("/api/cheapest", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "missing_query", hint: "Pass ?q=..." });
    return;
  }
  const hits = findProducts(q);
  if (!hits.length) {
    res.status(404).json({ error: "not_found", query: q });
    return;
  }
  const product = productPayload(hits[0].product, hits[0].score);
  if (!product.cheapest) {
    res.status(404).json({ error: "no_offers", query: q, product });
    return;
  }
  res.json({
    query: q,
    currency: catalog.currency || "EUR",
    product_id: product.id,
    product_name: product.name,
    unit: product.unit,
    cheapest: product.cheapest,
    all_offers: product.offers,
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "not_found",
    hint: "See /openapi.yaml for available endpoints",
  });
});

exports.api = onRequest(
  {
    region: "europe-west1",
    cors: true,
    invoker: "public",
  },
  app
);
