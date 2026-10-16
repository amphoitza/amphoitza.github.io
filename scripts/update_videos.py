"""Refresh videos.json with every video and short from the clip channels.

Run daily by .github/workflows/videos.yml. If a channel tab fails to load,
its previous entries are kept so a flaky run never shrinks the list.
"""
import datetime
import json
import pathlib
import subprocess

CHANNELS = ["baiatucucaiacu", "ggugateste"]
TABS = {"videos": "video", "shorts": "short"}
OUT = pathlib.Path(__file__).resolve().parent.parent / "videos.json"


def fetch(handle, tab):
    url = f"https://www.youtube.com/@{handle}/{tab}"
    result = subprocess.run(
        ["yt-dlp", "--flat-playlist", "--ignore-errors", "--print", "%(id)s\t%(title)s", url],
        capture_output=True, text=True, timeout=600,
    )
    items = []
    for line in result.stdout.splitlines():
        vid, _, title = line.partition("\t")
        if len(vid) == 11:
            items.append({"id": vid, "title": title, "channel": handle, "type": TABS[tab]})
    return items


def main():
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else []
    videos = []
    for handle in CHANNELS:
        for tab in TABS:
            items = fetch(handle, tab)
            if not items:
                print(f"{handle}/{tab}: nothing fetched, keeping previous entries")
                items = [v for v in old if v["channel"] == handle and v["type"] == TABS[tab]]
            print(f"{handle}/{tab}: {len(items)}")
            videos += items

    # "added" is the day a clip was first seen. The page only picks from clips added
    # before today, so a new upload can't change today's clip halfway through the day.
    first_seen = {v["id"]: v.get("added") for v in old}
    today = datetime.date.today().isoformat()
    seen, unique = set(), []
    for v in videos:
        if v["id"] not in seen:
            seen.add(v["id"])
            v["added"] = first_seen.get(v["id"]) or today
            unique.append(v)

    OUT.write_text(json.dumps(unique, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"total: {len(unique)}")


if __name__ == "__main__":
    main()
