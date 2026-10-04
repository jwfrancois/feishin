# One-off README repair: dedupe the partially-applied MultiEdit results and finish the remaining edits.
import re

p = "/home/z/my-project/README.md"
src = open(p, encoding="utf-8").read()

# 1) Dedupe the two feature bullets (keep the first pair only).
feat_hifi = "- **Hi-Fi Studio sound system** — a real Web Audio DSP chain: preamp, 10-band parametric EQ with 13 studio presets, headphone crossfeed, mid/side stereo width, balance, 4-mode dynamics compressor and loudness normalization — plus a canvas spectrum analyzer with L/R peak meters (see below).\n"
feat_auto = "- **Agent Auto-EQ** — the Library Agent analyzes the playing track or album (library genres + Deezer + MusicBrainz) and adapts the sound output automatically, with a confidence score and rationale; manual control always wins (see below).\n"
pair = feat_hifi + feat_auto
assert src.count(pair) == 2, f"feature pair count = {src.count(pair)}"
src = src.replace(pair + pair, pair)

# 2) Drop the FIRST "Hi-Fi Studio" section copy (the one with escaped pipes).
m1 = src.find("## Hi-Fi Studio sound system")
m2 = src.find("## Hi-Fi Studio sound system", m1 + 1)
assert m1 != -1 and m2 != -1, "expected two section copies"
first_copy = src[m1:m2]
assert "\\|" in first_copy, "first copy should be the escaped-pipe one"
src = src[:m1] + src[m2:]

# 3) In the surviving copy, restore the |album variant on the endpoint line.
src = src.replace(
    "`GET /api/agent/sound-profile/[itemId]?itemType=track&name=…&artist=…&album=…&genres=…&year=…[&refresh=1]`",
    "`GET /api/agent/sound-profile/[itemId]?itemType=track|album&name=…&artist=…&album=…&genres=…&year=…[&refresh=1]`",
)

# 4) Update the REST endpoints paragraph.
old_ep = "REST endpoints: `GET /api/agent/status`, `POST /api/agent/run`, `GET /api/agent/findings`, `POST /api/agent/findings/[id]/apply`, `GET|POST /api/agent/writeback`, `GET /api/agent/health?history=N`, `GET|PATCH /api/agent/config`, `GET /api/agent/enrichment/[itemId]?kind=bio|artwork|metadata|lyrics&fetch=1`."
new_ep = "REST endpoints: `GET /api/agent/status`, `POST /api/agent/run`, `GET /api/agent/findings`, `POST /api/agent/findings/[id]/apply`, `GET|POST /api/agent/writeback` (batch body: `{\"limit\": 100}`), `GET /api/agent/health?history=N`, `GET|PATCH /api/agent/config`, `GET /api/agent/enrichment/[itemId]?kind=bio|artwork|metadata|lyrics&fetch=1`, `GET /api/agent/discography/[artistId]?name=…&fetch=1`, `GET /api/agent/sound-profile/[itemId]?itemType=track|album&…`."
assert old_ep in src, "endpoints paragraph not found"
src = src.replace(old_ep, new_ep)

# 5) Add the Auto-EQ limitation bullet after the write-back limitation bullet.
anchor = "Deezer availability depends on the server's network (its CDN blocks some datacenter IPs).\n"
add = "- **Agent Auto-EQ is a stylistic starting point, not room correction.** Profiles are derived from genre/mood tags (library, Deezer, MusicBrainz), so items with thin tagging get a low-confidence or neutral profile — the studio panel always shows what was matched and why, and manual EQ overrides the agent until the next track.\n"
if "stylistic starting point" not in src:
    assert anchor in src
    src = src.replace(anchor, anchor + add, 1)

open(p, "w", encoding="utf-8").write(src)
print("OK — sanity checks:")
print("  feature pairs:", src.count(feat_hifi))
print("  Hi-Fi headings:", src.count("## Hi-Fi Studio sound system"))
print("  Auto-EQ headings:", src.count("### Agent Auto-EQ"))
print("  escaped pipes left:", src.count("\\|"))
print("  stylistic bullet:", src.count("stylistic starting point"))
print("  endpoints updated:", "sound-profile" in src.split("REST endpoints:")[1])
