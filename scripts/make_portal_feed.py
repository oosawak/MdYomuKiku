#!/usr/bin/env python3
"""Generate a community-portal federation feed (static-site-feed/v1) for Yomukiku.

Reads the generated docs/catalog.json and writes docs/data/sites/yomukiku.json
in the shared feed format consumed by community-portal's merge_feeds.py:
each novel becomes an "article" entry whose cover is a small WebP thumbnail
and whose URL points at the novel's work page.
"""
from pathlib import Path
import base64, io, json, re, sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'docs' / 'catalog.json'
OUT = ROOT / 'docs' / 'data' / 'sites' / 'yomukiku.json'
HOMEPAGE = 'https://oosawak.github.io/MdYomuKiku/'
SITE_ID = 'yomukiku'
MAX_THUMB_BYTES = 140_000  # portal limit is 150_000; keep headroom


def webp_thumb(data_uri: str, alt: str) -> dict:
    """Convert a base64 image data URI to a small WebP thumbnail cover."""
    raw = base64.b64decode(data_uri.split(',', 1)[1])
    with Image.open(io.BytesIO(raw)) as im:
        image = im.convert('RGB')
    image.thumbnail((480, 480), Image.Resampling.LANCZOS)
    for quality in (80, 65, 50, 35):
        buffer = io.BytesIO()
        image.save(buffer, format='WEBP', quality=quality)
        data = buffer.getvalue()
        if len(data) <= MAX_THUMB_BYTES:
            break
    else:
        raise ValueError('thumbnail too large even at lowest quality')
    return {'src': 'data:image/webp;base64,' + base64.b64encode(data).decode('ascii'),
            'mime': 'image/webp', 'alt': alt[:200]}


def placeholder_cover(alt: str) -> dict:
    image = Image.new('RGB', (480, 320), (70, 90, 110))
    buffer = io.BytesIO()
    image.save(buffer, format='WEBP', quality=80)
    return {'src': 'data:image/webp;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii'),
            'mime': 'image/webp', 'alt': alt[:200]}


def slug_from_file(file_name: str) -> str:
    stem = Path(file_name).stem.lower()
    slug = re.sub(r'[^a-z0-9_-]', '-', stem)
    if not slug:
        raise ValueError(f'cannot derive slug from {file_name!r}')
    return slug[:100]


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    novels = catalog.get('novels')
    if not isinstance(novels, list) or not novels:
        print('catalog has no novels', file=sys.stderr)
        return 1
    entries = []
    hero = None
    for novel in novels:
        title = str(novel.get('title', '')).strip()
        file_name = str(novel.get('file', '')).strip()
        if not title or not file_name:
            continue
        slug = slug_from_file(file_name)
        author = str(novel.get('author', '')).strip()
        description = str(novel.get('description', '')).strip()
        summary = description
        if author:
            summary = (summary + f'（{author}）') if summary else author
        cover_uri = novel.get('cover') or ''
        try:
            cover = webp_thumb(cover_uri, title) if cover_uri.startswith('data:image/') else placeholder_cover(title)
        except Exception:
            cover = placeholder_cover(title)
        if hero is None:
            hero = cover
        entries.append({
            'id': f'{SITE_ID}:{slug}',
            'site_id': SITE_ID,
            'slug': slug,
            'type': 'article',
            'date': str(novel.get('updated', '2026-01-01'))[:10],
            'title': title[:180],
            'summary': summary[:600],
            'category': (str(novel.get('genre', '')).strip() or '小説')[:80],
            'url': HOMEPAGE + file_name,
            'cover': cover,
        })
    entries.sort(key=lambda e: (e['date'], e['slug']), reverse=True)
    feed = {
        'version': 1,
        'schema': 'static-site-feed/v1',
        'schema_version': '1.1.0',
        'site': {
            'id': SITE_ID,
            'name': 'よむきく',
            'kind': 'library',
            'kind_label': '小説サイト',
            'description': 'Markdownから生成する、読んで聴ける小説サイト。青空文庫の名作とオリジナル小説を掲載しています。',
            'subtitle': 'MdYomuKiku',
            'hero_thumbnail': hero,
        },
        'entries': entries,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {OUT} with {len(entries)} entries, {OUT.stat().st_size} bytes')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
