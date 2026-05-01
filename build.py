#!/usr/bin/env python3
"""Build script for Wilshire Rewind. Run: python3 build.py"""

import json
import re
import struct
import sys
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).parent
SRC = ROOT / "src"
CONFIG_PATH = ROOT / "config.json"


def load_config():
    if not CONFIG_PATH.exists():
        print("Error: config.json not found.")
        sys.exit(1)
    return json.loads(CONFIG_PATH.read_text())


def parse_date(name):
    """Sermon_MMDDYY → datetime"""
    m = re.match(r"Sermon_(\d{2})(\d{2})(\d{2})$", name)
    if not m:
        return None
    month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return datetime(2000 + year, month, day)


def parse_srt_duration(path):
    """Return duration in whole seconds from last SRT end timestamp."""
    last = 0.0
    pattern = re.compile(r"--> (\d{2}):(\d{2}):(\d{2}),(\d{3})")
    for line in path.read_text().splitlines():
        m = pattern.search(line)
        if m:
            h, mn, s, ms = map(int, m.groups())
            t = h * 3600 + mn * 60 + s + ms / 1000
            if t > last:
                last = t
    return int(last)


def fmt_hhmmss(seconds):
    h, r = divmod(seconds, 3600)
    m, s = divmod(r, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def fmt_display(seconds):
    h, r = divmod(seconds, 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def excerpt(text, chars=220):
    if len(text) <= chars:
        return text
    return text[:chars].rsplit(" ", 1)[0] + "…"


def read_id3_tags(path):
    """Return {'TIT2': title, 'TPE1': artist} from ID3v2 tag, empty dict if absent."""
    result = {}
    try:
        with open(path, 'rb') as f:
            hdr = f.read(10)
            if hdr[:3] != b'ID3':
                return result
            ver = hdr[3]
            tag_size = ((hdr[6] & 0x7f) << 21 | (hdr[7] & 0x7f) << 14 |
                        (hdr[8] & 0x7f) << 7  |  (hdr[9] & 0x7f))
            raw = f.read(tag_size)
        i = 0
        while i + 10 <= len(raw):
            if raw[i:i+4] == b'\x00\x00\x00\x00':
                break
            try:
                fid = raw[i:i+4].decode('ascii')
            except UnicodeDecodeError:
                break
            if ver == 4:
                fsize = ((raw[i+4] & 0x7f) << 21 | (raw[i+5] & 0x7f) << 14 |
                         (raw[i+6] & 0x7f) << 7  |  (raw[i+7] & 0x7f))
            else:
                fsize = struct.unpack('>I', raw[i+4:i+8])[0]
            if fsize <= 0 or fsize > len(raw) - i:
                break
            if fid in ('TIT2', 'TPE1', 'TALB'):
                content = raw[i+10:i+10+fsize]
                enc = content[0]
                text = content[1:]
                try:
                    if enc == 0:
                        result[fid] = text.split(b'\x00')[0].decode('latin-1').strip()
                    elif enc == 1:
                        result[fid] = text.decode('utf-16').rstrip('\x00').strip()
                    elif enc == 2:
                        result[fid] = text.split(b'\x00\x00')[0].decode('utf-16-be').strip()
                    elif enc == 3:
                        result[fid] = text.split(b'\x00')[0].decode('utf-8').strip()
                except Exception:
                    pass
            i += 10 + fsize
    except Exception:
        pass
    return result


def load_sermons():
    sermons = []
    for mp3 in sorted((SRC / "audio").glob("Sermon_*.mp3")):
        name = mp3.stem
        date = parse_date(name)
        if not date:
            continue
        srt = SRC / "subtitles" / f"{name}.srt"
        txt = SRC / "transcriptions" / f"{name}.txt"
        dur = parse_srt_duration(srt) if srt.exists() else 0
        text = txt.read_text().strip() if txt.exists() else ""
        tags = read_id3_tags(mp3)
        sermons.append({
            "id": name,
            "date": date.strftime("%Y-%m-%d"),
            "dateFormatted": date.strftime("%B %-d, %Y"),
            "durationSeconds": dur,
            "durationDisplay": fmt_display(dur),
            "durationHMS": fmt_hhmmss(dur),
            "excerpt": excerpt(text),
            "title": tags.get("TIT2", ""),
            "speaker": tags.get("TPE1", ""),
            "series": tags.get("TALB", ""),
            "audioUrl": f"audio/{name}.mp3",
            "transcriptUrl": f"transcriptions/{name}.txt",
            "captionsUrl": f"subtitles/{name}.srt" if srt.exists() else "",
            "fileSizeBytes": mp3.stat().st_size,
            "_text": text,
        })
    sermons.sort(key=lambda s: s["date"])
    return sermons


def build_rss(sermons, config):
    site_url = config["siteUrl"].rstrip("/")
    title = escape(config["podcastTitle"])
    desc = escape(config["podcastDescription"])
    author = escape(config.get("podcastAuthor", config["podcastTitle"]))

    items = []
    for s in reversed(sermons):
        date = datetime.fromisoformat(s["date"])
        pub = date.strftime("%a, %d %b %Y 00:00:00 +0000")
        url = f"{site_url}/{s['audioUrl']}"
        item_title = s["title"] or s["dateFormatted"]
        transcript_tag = ""
        if s["captionsUrl"]:
            srt_url = escape(f"{site_url}/{s['captionsUrl']}")
            transcript_tag = f'\n      <podcast:transcript url="{srt_url}" type="application/x-subrip"/>'
        items.append(f"""\
    <item>
      <title>{escape(item_title)}</title>
      <description>{escape(s["excerpt"])}</description>
      <pubDate>{pub}</pubDate>
      <guid isPermaLink="false">{escape(url)}</guid>
      <enclosure url="{escape(url)}" length="{s["fileSizeBytes"]}" type="audio/mpeg"/>
      <itunes:duration>{s["durationHMS"]}</itunes:duration>{transcript_tag}
    </item>""")

    items_str = "\n".join(items)
    return f"""\
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/modules/content/"
     xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>{title}</title>
    <link>{escape(site_url)}</link>
    <description>{desc}</description>
    <language>en-us</language>
    <itunes:author>{author}</itunes:author>
    <itunes:summary>{desc}</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
{items_str}
  </channel>
</rss>
"""


def main():
    config = load_config()
    sermons = load_sermons()
    print(f"Found {len(sermons)} sermon(s).")

    pub = [{k: v for k, v in s.items() if k != "_text"} for s in sermons]
    (SRC / "sermons.json").write_text(json.dumps(pub, indent=2) + "\n")
    print("  → src/sermons.json")

    t_data = [{"id": s["id"], "date": s["date"], "text": s["_text"]} for s in sermons]
    (SRC / "transcriptions.json").write_text(json.dumps(t_data, indent=2) + "\n")
    print("  → src/transcriptions.json")

    (SRC / "feed.xml").write_text(build_rss(sermons, config))
    print("  → src/feed.xml")


if __name__ == "__main__":
    main()
