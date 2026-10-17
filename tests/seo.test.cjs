'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('index.html has complete SEO metadata, valid JSON-LD graph, descriptive image alts, and pre-rendered reviews', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /<html lang="en-US">/);
  assert.match(html, /<title>Bathtub Refinishing Tampa FL \| Tub Reglazing &amp; Resurfacing — Bath Professional<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bath-professional\.com\/">/);
  assert.match(html, /<link rel="alternate" hreflang="en-US" href="https:\/\/bath-professional\.com\/">/);
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest">/);
  assert.match(html, /<link rel="alternate" type="text\/plain" href="\/llms\.txt" title="LLM Context">/);
  assert.match(html, /<meta property="og:image:width" content="1280">/);
  assert.match(html, /<meta property="og:image:height" content="720">/);

  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(ldMatch, 'index.html must contain a JSON-LD script block');
  const schema = JSON.parse(ldMatch[1]);
  assert.equal(schema['@context'], 'https://schema.org');
  assert.ok(Array.isArray(schema['@graph']));
  assert.equal(schema['@graph'].length, 14);

  const business = schema['@graph'].find((node) => node['@id'] === 'https://bath-professional.com/#business');
  assert.ok(business, 'LocalBusiness entity must exist');
  assert.equal(business.address.addressLocality, 'Tampa');
  assert.equal(business.address.addressRegion, 'FL');
  assert.equal(business.logo.url, 'https://bath-professional.com/images/apple-touch-icon.png');
  assert.equal(business.aggregateRating.ratingValue, '5.0');
  assert.equal(business.aggregateRating.reviewCount, '444');
  assert.equal(business.review.length, 5);
  assert.equal(business.hasOfferCatalog.itemListElement.length, 8);

  // Verify pre-rendered Google reviews in initial HTML for crawlers
  assert.doesNotMatch(html, /Loading Google reviews…/);
  assert.match(html, /Shyanne Lowrey/);
  assert.match(html, /Daniela Valencia/);
  assert.match(html, /Wilfredo Corchado/);
  assert.match(html, /Kaitlyn M/);
  assert.match(html, /Lindsey Ogden/);
});

test('privacy-policy.html has valid JSON-LD and canonical metadata', () => {
  const html = fs.readFileSync(path.join(root, 'privacy-policy.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/bath-professional\.com\/privacy-policy">/);
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest">/);
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(ldMatch, 'privacy-policy.html must contain a JSON-LD script block');
  const schema = JSON.parse(ldMatch[1]);
  assert.equal(schema['@graph'].length, 2);
});

test('sitemap.xml, robots.txt, vercel.json, llms.txt, site.webmanifest, and IndexNow key are valid and configured for SEO', () => {
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(sitemap, /https:\/\/bath-professional\.com\/images\/hero-pristine\.jpg/);

  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /User-agent: OAI-SearchBot/);
  assert.match(robots, /Sitemap: https:\/\/bath-professional\.com\/sitemap\.xml/);

  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(Array.isArray(vercelConfig.headers));

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.short_name, 'Bath Professional');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);

  const llms = fs.readFileSync(path.join(root, 'llms.txt'), 'utf8');
  assert.match(llms, /\(813\) 445-9319/);
  assert.match(llms, /Tampa/);

  const llmsFull = fs.readFileSync(path.join(root, 'llms-full.txt'), 'utf8');
  assert.match(llmsFull, /5-Year/);
  assert.match(llmsFull, /ISO-FREE/);

  const indexNowKey = fs.readFileSync(path.join(root, 'e819a4d27f3c40b6852e9c1a7d3b64f0.txt'), 'utf8').trim();
  assert.equal(indexNowKey, 'e819a4d27f3c40b6852e9c1a7d3b64f0');
});
