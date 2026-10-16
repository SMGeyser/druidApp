import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formImagePath, animalArt } from '../art.js';

const root = new URL('../', import.meta.url);
const beasts = JSON.parse(readFileSync(new URL('data/beasts.json', root), 'utf8').replace(/^\uFEFF/, '')).filter(b => !b.name.startsWith('Swarm of'));

test('every individual Beast form has a unique, valid, compact local WebP image', () => {
  const paths = new Set();
  for (const beast of beasts) {
    const path = formImagePath(beast.name);
    assert.ok(!paths.has(path), `Duplicate artwork path for ${beast.name}`);
    paths.add(path);
    const bytes = readFileSync(new URL(path, root));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `Invalid image for ${beast.name}`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `Invalid WebP for ${beast.name}`);
    assert.ok(bytes.length > 1000 && bytes.length < 400000, `Image size out of bounds for ${beast.name}: ${bytes.length}`);
  }
  assert.equal(paths.size, 85);
});

test('form images provide the correct subject name and reserve dimensions for stable loading', () => {
  for (const beast of beasts) {
    const html = animalArt(beast.name);
    assert.ok(html.includes(`alt="${beast.name}"`));
    assert.match(html, /loading="lazy"/);
    assert.match(html, /width="1000" height="667"/);
    assert.ok(html.includes(formImagePath(beast.name)));
  }
});

test('every image has honest provenance and licensed references retain author and license links', () => {
  const credits = JSON.parse(readFileSync(new URL('data/artwork.json', root), 'utf8'));
  assert.equal(credits.images.length, 85);
  assert.equal(new Set(credits.images.map(c => c.name)).size, 85);
  for (const beast of beasts) {
    const credit = credits.images.find(c => c.name === beast.name);
    assert.ok(credit, `Missing attribution for ${beast.name}`);
    assert.equal(credit.file, formImagePath(beast.name));
    if (credit.source) {
      assert.match(credit.source, /^https:\/\/commons\.wikimedia\.org\//);
      assert.ok(credit.author && credit.license && credit.licenseUrl, `Incomplete attribution for ${beast.name}`);
    } else {
      assert.ok(credit.prompt && credit.kind.startsWith('AI-generated'));
    }
  }
});
