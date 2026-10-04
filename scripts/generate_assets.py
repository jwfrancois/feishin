#!/usr/bin/env python3
"""
Feishin rebuild - demo library asset generator.
Generates: album covers (PIL), artist images (PIL), synthesized audio tracks (numpy -> ffmpeg mp3),
and a manifest JSON consumed by the Next.js app.
"""
import json
import math
import os
import random
import subprocess

import numpy as np
from scipy.signal import lfilter
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/home/z/my-project"
PUB = os.path.join(ROOT, "public", "media")
COV = os.path.join(PUB, "covers")
ART = os.path.join(PUB, "artists")
AUD = os.path.join(PUB, "audio")
os.makedirs(COV, exist_ok=True)
os.makedirs(ART, exist_ok=True)
os.makedirs(AUD, exist_ok=True)

# ----------------------------------------------------------------------------
# Library definition
# ----------------------------------------------------------------------------

ARTISTS = [
    {"id": "natasha-beller", "name": "Natasha Beller", "genre": "Trip-Hop", "hue": 340},
    {"id": "back-on-earth", "name": "Back On Earth", "genre": "Pop Punk", "hue": 20},
    {"id": "carter-vall", "name": "Carter Vall", "genre": "Indie Rock", "hue": 8},
    {"id": "polish-ambassador", "name": "The Polish Ambassador", "genre": "Electronic", "hue": 45},
    {"id": "forget-the-whale", "name": "Forget the Whale", "genre": "Poprock", "hue": 200},
    {"id": "nine-inch-nails", "name": "Nine Inch Nails", "genre": "Industrial", "hue": 0},
    {"id": "maya-filipic", "name": "Maya Filipic", "genre": "Neoclassical", "hue": 30},
    {"id": "midnight-dual", "name": "Midnight Dual", "genre": "Synthwave", "hue": 300},
    {"id": "velvet-fern", "name": "The Velvet Fern", "genre": "Dream Pop", "hue": 160},
    {"id": "korgi-runs", "name": "Korgi Runs", "genre": "Chiptune", "hue": 55},
    {"id": "sable-ridge", "name": "Sable Ridge", "genre": "Americana", "hue": 35},
    {"id": "vektor-prime", "name": "Vektor Prime", "genre": "Techno", "hue": 190},
    {"id": "june-hollows", "name": "June & The Hollows", "genre": "Folk", "hue": 90},
    {"id": "acid-lagoon", "name": "Acid Lagoon", "genre": "Psychedelic", "hue": 275},
    {"id": "various", "name": "Various Artists", "genre": "Hip Hop", "hue": 265},
]

# (artist, [(album, year, genre, [track titles])])
ALBUMS = [
    ("natasha-beller", "Fairytale", 2023, "Trip-Hop",
     ["Daniel", "Jazzix", "He Was (Clementine)", "Fairytale", "Pleasant Melody",
      "Red Car", "I'm Smoking", "Never Over", "Senseless Song"]),
    ("back-on-earth", "Love, All, Was Able to Say", 2024, "Pop Punk",
     ["Postcard", "Say It Louder", "Basement Tapes", "When We Were Younger"]),
    ("back-on-earth", "Nostalgia Isn't What It Used to Be", 2021, "Pop Punk",
     ["Nostalgia", "Paper Planes", "Static in My Head", "Long Drive Home"]),
    ("back-on-earth", "Take Me With You", 2019, "Pop Punk",
     ["Take Me With You", "Fifteen", "Chasing Streetlights", "Fine Print"]),
    ("carter-vall", "Red Eyes", 2020, "Indie Rock",
     ["Red Eyes", "Undertow", "Golden Hour", "Slow Burn"]),
    ("carter-vall", "Static Bloom", 2022, "Indie Rock",
     ["Static Bloom", "Paper Crown", "Fault Lines", "Night Swim"]),
    ("polish-ambassador", "First Words", 2014, "Electronic",
     ["First Words", "Dirt Sweet Dirt", "Story of My Life", "Where Strangers Go"]),
    ("polish-ambassador", "Diplomatic Immunity", 2018, "Electronic",
     ["Diplomatic Immunity", "Futurecode", "Eclectic Soup", "Witness"]),
    ("forget-the-whale", "Take to the Skies", 2018, "Poprock",
     ["Take to the Skies", "Comet Tail", "Radio Silence", "Paper Airplanes"]),
    ("forget-the-whale", "Signal Fires", 2021, "Poprock",
     ["Signal Fires", "Wavelength", "Loudest Room", "Orbit"]),
    ("nine-inch-nails", "The Slip", 2008, "Industrial",
     ["999,999", "1,000,000", "Letting You", "Discipline", "Echoplex"]),
    ("nine-inch-nails", "Ghosts I - IV Sampler", 2008, "Industrial",
     ["1 Ghosts I", "9 Ghosts I", "17 Ghosts III", "28 Ghosts IV"]),
    ("maya-filipic", "Between Two Worlds", 2015, "Neoclassical",
     ["Prelude in Amber", "Between Two Worlds", "Rain on Cedar", "Snowlight", "Undertow Piano", "Last Light"]),
    ("midnight-dual", "Neon Cartography", 2022, "Synthwave",
     ["Neon Cartography", "Midnight Horizon", "Laser Skyline", "Cassette Dreams", "Afterglow Drive"]),
    ("midnight-dual", "Chrome Sunset", 2020, "Synthwave",
     ["Chrome Sunset", "Turbo Heart", "Arcade Love", "Endless Summer Lane"]),
    ("velvet-fern", "Glasshouse", 2023, "Dream Pop",
     ["Glasshouse", "Petalscatter", "Soft Focus", "Halo Bloom", "Lanterns"]),
    ("korgi-runs", "1-Up Anthem", 2019, "Chiptune",
     ["1-Up Anthem", "Boss Rush", "Save Point", "Coin Runner", "Extra Life"]),
    ("sable-ridge", "Golden Standard", 2023, "Americana",
     ["Golden Standard", "Whiskey Hollow", "Prairie Wind", "Copper Moon"]),
    ("sable-ridge", "Dust & Honey", 2020, "Americana",
     ["Dust & Honey", "Rust Belt Rail", "Tallgrass", "Carolina Call"]),
    ("vektor-prime", "Modular Nation", 2024, "Techno",
     ["Modular Nation", "Voltage Sequence", "Patch Bay", "Cold Circuit", "Overclock"]),
    ("june-hollows", "Hollow Crown", 2021, "Folk",
     ["Hollow Crown", "Willow Weep", "Bramble & Thorn", "Riverine", "Homeward"]),
    ("acid-lagoon", "Fuzzy Logic Pond", 2022, "Psychedelic",
     ["Fuzzy Logic Pond", "Prism Tide", "Mossy Static", "Lens Flare Lagoon", "Sunworm"]),
    ("various", "Filthy Rhythm, Dirty Soul Mixtape Vol. 7", 2017, "Hip Hop",
     ["Party Breaks Anthem", "Boom Bap Science", "Crossfade Kings", "Dusty 808"]),
    ("various", "netBloc Vol. 42: Live, The Universe & Everything", 2013, "Electronic",
     ["42 Reasons", "Hitchhike the Grid", "Mostly Harmless Bass", "Towel Day"]),
    ("various", "Chillhop Essentials - Fall 2021", 2021, "Hip Hop",
     ["Autumn Loop", "Cassette Rain", "Study Lamp", "Sweater Weather Beat", "Window Seat"]),
    ("various", "8-bit lagerfeuer", 2016, "Chiptune",
     ["Lagerfeuer", "Campfire Chip", "Starry Bytes", "Ember Scan"]),
    ("various", "Deflonesoundsystem", 2019, "Industrial",
     ["Deft Sounds", "System Static", "Backline Break", "Monitor Mix"]),
]

PLAYLISTS = [
    {"id": "late-night-coding", "name": "Late Night Coding"},
    {"id": "morning-coffee", "name": "Morning Coffee"},
    {"id": "road-trip-2024", "name": "Road Trip 2024"},
    {"id": "gym-pump", "name": "Gym Pump"},
    {"id": "rainy-day", "name": "Rainy Day Jazz"},
    {"id": "synth-taxi", "name": "Synth Taxi"},
    {"id": "folk-fireside", "name": "Folk Fireside"},
]

# ----------------------------------------------------------------------------
# Cover art generators
# ----------------------------------------------------------------------------

def _noise_texture(size, alpha=18, seed=1):
    noise = np.random.default_rng(seed).integers(0, 255, (size[1] // 4, size[0] // 4), dtype=np.uint8)
    im = Image.fromarray(noise, "L").resize(size, Image.BILINEAR)
    return im.point(lambda p: int(p / 255 * alpha))


def _finish(img, seed):
    img = img.convert("RGB")
    w, h = img.size
    vig = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(vig)
    d.ellipse([-w * 0.25, -h * 0.25, w * 1.25, h * 1.25], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(w // 5))
    black = Image.new("RGB", (w, h), (0, 0, 0))
    img = Image.composite(img, black, vig)
    grain = _noise_texture((w, h), 14, seed)
    img = Image.blend(img, Image.composite(img, black, grain.point(lambda p: 255 - p)) , 0.35)
    return img


def _hsl(hue, sat, light):
    import colorsys
    r, g, b = colorsys.hls_to_rgb((hue % 360) / 360, light, sat)
    return (int(r * 255), int(g * 255), int(b * 255))


def gen_blob(img, hue, rnd):
    """Soft multi-radial gradient blobs."""
    w, h = img.size
    base = _hsl(hue + rnd.randint(-15, 15), 0.35, 0.16)
    img.paste(base, [0, 0, w, h])
    layers = Image.new("RGB", (w, h), base)
    for _ in range(rnd.randint(4, 7)):
        cx, cy = rnd.randint(0, w), rnd.randint(0, h)
        rr = rnd.randint(w // 5, w // 2)
        col = _hsl(hue + rnd.randint(-70, 70), rnd.uniform(0.45, 0.8), rnd.uniform(0.3, 0.6))
        lay = Image.new("RGB", (w, h), col)
        mask = Image.new("L", (w, h), 0)
        md = ImageDraw.Draw(mask)
        md.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=rnd.randint(120, 200))
        mask = mask.filter(ImageFilter.GaussianBlur(rnd.randint(40, 90)))
        layers = Image.composite(Image.blend(layers, lay, 0.85), layers, mask)
    img.paste(layers, (0, 0))
    return img


def gen_geo(img, hue, rnd):
    """Bauhaus-style flat geometry."""
    w, h = img.size
    bg = _hsl(hue, 0.25, 0.85)
    img.paste(bg, [0, 0, w, h])
    d = ImageDraw.Draw(img)
    palette = [_hsl(hue + s, 0.7, 0.45) for s in (-40, 0, 40, 140)] + [(30, 30, 30)]
    for _ in range(rnd.randint(5, 9)):
        col = rnd.choice(palette)
        shape = rnd.choice(["rect", "circle", "arc", "tri"])
        x, y = rnd.randint(-w // 4, w), rnd.randint(-h // 4, h)
        s = rnd.randint(w // 6, w // 2)
        if shape == "rect":
            d.rectangle([x, y, x + s, y + s], fill=col)
        elif shape == "circle":
            d.ellipse([x, y, x + s, y + s], fill=col)
        elif shape == "arc":
            d.arc([x, y, x + s, y + s], rnd.randint(0, 180), rnd.randint(181, 359), fill=col, width=rnd.randint(10, 40))
        else:
            d.polygon([(x, y + s), (x + s, y + s), (x + s // 2, y)], fill=col)
    return img


def gen_retro(img, hue, rnd):
    """Synthwave sun + grid."""
    w, h = img.size
    top = _hsl(hue + 30, 0.65, 0.25)
    bot = _hsl(hue - 25, 0.7, 0.45)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        col = tuple(int(a + (b - a) * t) for a, b in zip(top, bot))
        d.line([(0, y), (w, y)], fill=col)
    sc = _hsl(hue - 10, 0.85, 0.6)
    cx, cy, rr = w // 2, int(h * 0.44), w // 4
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=sc)
    i = 0
    for yy in range(cy, cy + rr, 10):
        if i % 2 == 0:
            d.rectangle([cx - rr, yy, cx + rr, yy + 6], fill=top)
        i += 1
    gz = int(h * 0.62)
    for i in range(-8, 9):
        d.line([(w // 2 + i * 40, gz), (w // 2 + i * 400, h)], fill=_hsl(hue, 0.7, 0.6), width=3)
    for i in range(1, 14):
        y = gz + int((h - gz) * (i / 14) ** 2.2)
        d.line([(0, y), (w, y)], fill=_hsl(hue, 0.7, 0.6), width=3)
    return img


def gen_glitch(img, hue, rnd):
    """Dark glitch bars."""
    w, h = img.size
    img.paste(_hsl(hue, 0.1, 0.08), [0, 0, w, h])
    d = ImageDraw.Draw(img)
    for _ in range(rnd.randint(30, 60)):
        y = rnd.randint(0, h)
        hh = rnd.randint(2, 26)
        col = rnd.choice([_hsl(hue + rnd.randint(-30, 30), 0.75, rnd.uniform(0.3, 0.6)),
                          (230, 230, 230), (15, 15, 15)])
        x0 = rnd.randint(-50, w)
        x1 = max(x0 + 2, rnd.randint(0, w + 60))
        d.rectangle([x0, y, x1, y + hh], fill=col)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    for _ in range(rnd.randint(2, 4)):
        y = rnd.randint(0, h - 60)
        block = img.crop((0, y, w, y + rnd.randint(20, 60))).transpose(Image.FLIP_TOP_BOTTOM)
        img.paste(block, (rnd.randint(-30, 30), y))
    return img


def gen_watercolor(img, hue, rnd):
    """Layered translucent blobs on paper."""
    w, h = img.size
    img.paste(_hsl(hue + 20, 0.25, 0.88), [0, 0, w, h])
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for _ in range(rnd.randint(10, 16)):
        cx, cy = rnd.randint(0, w), rnd.randint(0, h)
        rr = rnd.randint(w // 8, w // 3)
        col = _hsl(hue + rnd.randint(-80, 80), rnd.uniform(0.4, 0.75), rnd.uniform(0.4, 0.7)) + (rnd.randint(40, 90),)
        od.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    overlay = overlay.filter(ImageFilter.GaussianBlur(25))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    d = ImageDraw.Draw(img)
    for _ in range(rnd.randint(2, 4)):
        cx, cy = rnd.randint(0, w), rnd.randint(0, h)
        rr = rnd.randint(w // 10, w // 6)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=_hsl(hue, 0.6, 0.3), width=4)
    return img


def gen_waves(img, hue, rnd):
    """Flowing sine lines on dark background."""
    w, h = img.size
    img.paste(_hsl(hue, 0.3, 0.12), [0, 0, w, h])
    d = ImageDraw.Draw(img)
    for _ in range(rnd.randint(14, 22)):
        y0 = int(h * rnd.uniform(0.05, 0.95))
        amp = rnd.randint(20, 70)
        freq = rnd.uniform(1.5, 4)
        ph = rnd.uniform(0, 6.28)
        col = _hsl(hue + rnd.randint(-50, 50), 0.6, rnd.uniform(0.45, 0.75))
        pts = [(x, y0 + amp * math.sin(x / w * freq * 6.28 + ph)) for x in range(0, w, 8)]
        d.line(pts, fill=col, width=rnd.randint(2, 5))
    return img


def gen_chip(img, hue, rnd):
    """Pixel-art checker mosaic."""
    w, h = img.size
    cell = w // 16
    pal = [_hsl(hue + s, 0.8, l) for s in (-30, 0, 30, 150) for l in (0.35, 0.5, 0.65)]
    bg = _hsl(hue, 0.35, 0.14)
    img.paste(bg, [0, 0, w, h])
    d = ImageDraw.Draw(img)
    for gy in range(16):
        for gx in range(16):
            if rnd.random() < 0.42:
                d.rectangle([gx * cell, gy * cell, (gx + 1) * cell - 1, (gy + 1) * cell - 1], fill=rnd.choice(pal))
    y0 = 6 * cell
    for gx in range(4, 12):
        d.rectangle([gx * cell, y0, (gx + 1) * cell - 1, y0 + cell * 2], fill=(245, 245, 245))
    return img


def gen_mountains(img, hue, rnd):
    """Layered ridges (americana)."""
    w, h = img.size
    sky = _hsl(hue + 15, 0.55, 0.72)
    img.paste(sky, [0, 0, w, h])
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.6, h * 0.18, w * 0.85, h * 0.43], fill=_hsl(hue - 10, 0.75, 0.8))
    for light, ybase in [(0.55, 0.55), (0.4, 0.68), (0.25, 0.8), (0.12, 0.92)]:
        col = _hsl(hue + rnd.randint(-15, 15), 0.35, light)
        pts = [(0, h)]
        x = 0
        y = int(h * ybase) + rnd.randint(-30, 30)
        while x < w:
            pts.append((x, y))
            x += rnd.randint(60, 140)
            y = int(h * ybase) + rnd.randint(-60, 60)
        pts.append((w, y))
        pts.append((w, h))
        d.polygon(pts, fill=col)
    return img


GEN_BY_GENRE = {
    "Trip-Hop": [gen_blob, gen_glitch],
    "Pop Punk": [gen_geo, gen_blob],
    "Indie Rock": [gen_blob, gen_geo],
    "Electronic": [gen_geo, gen_blob],
    "Poprock": [gen_geo, gen_mountains],
    "Industrial": [gen_glitch],
    "Neoclassical": [gen_waves],
    "Synthwave": [gen_retro],
    "Dream Pop": [gen_watercolor, gen_blob],
    "Chiptune": [gen_chip],
    "Americana": [gen_mountains],
    "Techno": [gen_glitch, gen_geo],
    "Folk": [gen_watercolor, gen_mountains],
    "Psychedelic": [gen_blob, gen_retro],
    "Hip Hop": [gen_geo, gen_glitch],
}


def vibrant_color(img):
    """Pick a vibrant dominant color from the image."""
    small = img.resize((64, 64))
    px = list(small.getdata())
    best, best_score = (60, 60, 60), -1
    for r, g, b in px[::7]:
        mx, mn = max(r, g, b), min(r, g, b)
        sat = 0 if mx == 0 else (mx - mn) / mx
        score = sat * 1.6 + (mx / 255) * 0.5
        if score > best_score:
            best_score, best = score, (r, g, b)
    return best


# ----------------------------------------------------------------------------
# Audio synthesis
# ----------------------------------------------------------------------------

SR = 44100

SCALES = {
    "minor_pent": [0, 3, 5, 7, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "aeolian": [0, 2, 3, 5, 7, 8, 10],
    "major": [0, 2, 4, 5, 7, 9, 11],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
}

PROGS = {
    "aeolian_tragic": [0, -4, -2, -5],
    "dorian_groove": [0, 3, -4, 5],
    "pent_loop": [0, 5, 3, -2],
    "major_uplift": [0, 5, 7, 5],
    "phrygian_dark": [0, 1, 0, -2],
}

STYLES = {
    "Trip-Hop": dict(bpm=78, scale="minor_pent", prog="aeolian_tragic", drums="boom_bap",
                     bass="sub", pad=0.9, lead="sine", lead_oct=0, lead_density=0.4, swing=0.16),
    "Pop Punk": dict(bpm=168, scale="major", prog="major_uplift", drums="backbeat",
                     bass="pump", pad=0.25, lead="square", lead_oct=1, lead_density=0.7, swing=0.0),
    "Indie Rock": dict(bpm=118, scale="dorian", prog="dorian_groove", drums="backbeat",
                       bass="walk", pad=0.35, lead="saw", lead_oct=1, lead_density=0.55, swing=0.05),
    "Electronic": dict(bpm=112, scale="minor_pent", prog="pent_loop", drums="four_on_floor",
                       bass="pump", pad=0.8, lead="saw", lead_oct=1, lead_density=0.6, swing=0.0),
    "Poprock": dict(bpm=136, scale="major", prog="major_uplift", drums="backbeat",
                    bass="walk", pad=0.3, lead="triangle", lead_oct=1, lead_density=0.6, swing=0.04),
    "Industrial": dict(bpm=104, scale="phrygian", prog="phrygian_dark", drums="breakbeat",
                       bass="pump", pad=0.45, lead="saw", lead_oct=0, lead_density=0.5, swing=0.0),
    "Neoclassical": dict(bpm=76, scale="aeolian", prog="aeolian_tragic", drums="none",
                         bass="sustain", pad=0.15, lead="piano", lead_oct=1, lead_density=0.75, swing=0.0),
    "Synthwave": dict(bpm=108, scale="minor_pent", prog="aeolian_tragic", drums="four_on_floor",
                      bass="pump", pad=0.9, lead="saw", lead_oct=1, lead_density=0.55, swing=0.0),
    "Dream Pop": dict(bpm=98, scale="major", prog="major_uplift", drums="halftempo",
                      bass="sustain", pad=0.85, lead="triangle", lead_oct=1, lead_density=0.45, swing=0.06),
    "Chiptune": dict(bpm=150, scale="major", prog="major_uplift", drums="chip_fast",
                     bass="pump", pad=0.1, lead="square", lead_oct=1, lead_density=0.8, swing=0.0),
    "Americana": dict(bpm=98, scale="major", prog="pent_loop", drums="backbeat",
                      bass="walk", pad=0.25, lead="piano", lead_oct=1, lead_density=0.5, swing=0.1),
    "Techno": dict(bpm=130, scale="phrygian", prog="phrygian_dark", drums="four_on_floor",
                   bass="offbeat", pad=0.6, lead="saw", lead_oct=0, lead_density=0.5, swing=0.0),
    "Folk": dict(bpm=92, scale="major", prog="pent_loop", drums="halftempo",
                 bass="walk", pad=0.2, lead="piano", lead_oct=1, lead_density=0.5, swing=0.09),
    "Psychedelic": dict(bpm=104, scale="dorian", prog="dorian_groove", drums="breakbeat",
                        bass="walk", pad=0.7, lead="saw", lead_oct=1, lead_density=0.6, swing=0.05),
    "Hip Hop": dict(bpm=88, scale="minor_pent", prog="pent_loop", drums="boom_bap",
                    bass="sub", pad=0.5, lead="piano", lead_oct=0, lead_density=0.45, swing=0.12),
}


def note_freq(semi_from_a4):
    return 440.0 * (2.0 ** (semi_from_a4 / 12.0))


def env_exp(n, decay):
    return np.exp(-np.linspace(0, decay, n))


def adsr(n, a, r):
    e = np.ones(n)
    na = max(1, int(a * SR))
    nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def kick(dur=0.28):
    n = int(dur * SR)
    t = np.linspace(0, dur, n)
    f = np.linspace(150, 42, n)
    ph = np.cumsum(f / SR) * 2 * np.pi
    x = np.sin(ph) * env_exp(n, 9)
    click = np.random.default_rng(1).standard_normal(int(0.01 * SR)) * 0.4
    x[: len(click)] += click
    return x


def snare():
    dur = 0.18
    n = int(dur * SR)
    noise = np.random.default_rng(2).standard_normal(n)
    noise = np.convolve(noise, np.ones(4) / 4, "same")
    body = np.sin(2 * np.pi * 185 * np.linspace(0, dur, n)) * 0.5
    return (noise * 0.8 + body) * env_exp(n, 14)


def hat(open=False):
    dur = 0.14 if open else 0.045
    n = int(dur * SR)
    noise = np.random.default_rng(3).standard_normal(n)
    for _ in range(3):
        noise = np.diff(noise, prepend=0)
    return noise * env_exp(n, 20 if open else 40) * 0.6


def osc(shape, n, f0):
    t = np.linspace(0, n / SR, n, endpoint=False)
    ph = 2 * np.pi * f0 * t
    if shape == "sine":
        return np.sin(ph)
    if shape == "square":
        return np.sign(np.sin(ph)) * 0.7
    if shape == "saw":
        return (2 * ((f0 * t) % 1) - 1) * 0.8
    if shape == "triangle":
        return (2 * np.abs(2 * ((f0 * t) % 1) - 1) - 1) * 0.9
    if shape == "piano":
        return np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph) + 0.12 * np.sin(4 * ph)
    return np.sin(ph)


def place(buf, x, at):
    i = int(at * SR)
    j = min(len(buf), i + len(x))
    if i < len(buf):
        buf[i:j] += x[: j - i]


def lowpass_fast(x, cutoff):
    alpha = 1.0 - math.exp(-2 * math.pi * cutoff / SR)
    return lfilter([alpha], [1, -(1 - alpha)], x)


def compose(seed, genre, duration):
    rnd = random.Random(seed)
    st = STYLES[genre]
    bpm = st["bpm"] * rnd.uniform(0.97, 1.03)
    beat = 60 / bpm
    bar = beat * 4
    n_bars = max(2, int(duration / bar))
    duration = n_bars * bar
    total_n = int(duration * SR)
    buf = np.zeros(total_n)

    root = rnd.choice([-17, -15, -12, -10, -8])
    scale = SCALES[st["scale"]]
    prog = PROGS[st["prog"]]

    kick_s, snare_s, hat_s, hat_o = kick(), snare(), hat(), hat(open=True)
    swing = st["swing"]

    for b in range(n_bars):
        bar_at = b * bar
        chord_root = root + 12 + prog[b % len(prog)]
        pat = st["drums"]
        for step in range(16):
            at = bar_at + step * beat / 4
            if swing and step % 2 == 1:
                at += swing * beat / 4
            if pat == "four_on_floor":
                if step % 4 == 0:
                    place(buf, kick_s, at)
                if step % 4 == 2:
                    place(buf, hat_s, at)
                if step == 14:
                    place(buf, hat_o, at)
            elif pat == "boom_bap":
                if step in (0, 7, 10):
                    place(buf, kick_s, at)
                if step in (4, 12):
                    place(buf, snare_s, at)
                if step % 2 == 0:
                    place(buf, hat_s, at)
            elif pat == "backbeat":
                if step in (0, 8) or (step == 6 and rnd.random() < 0.4):
                    place(buf, kick_s, at)
                if step in (4, 12):
                    place(buf, snare_s, at)
                if step % 2 == 0:
                    place(buf, hat_s, at)
            elif pat == "breakbeat":
                if step in (0, 10):
                    place(buf, kick_s, at)
                if step in (4, 12, 14):
                    place(buf, snare_s, at)
                if rnd.random() < 0.8:
                    place(buf, hat_s, at)
            elif pat == "halftempo":
                if step == 0:
                    place(buf, kick_s, at)
                if step == 8:
                    place(buf, snare_s, at)
                if step % 4 == 2:
                    place(buf, hat_s, at)
            elif pat == "chip_fast":
                if step % 4 == 0:
                    place(buf, kick_s, at)
                if step in (4, 12):
                    place(buf, snare_s, at)
                place(buf, hat_s, at)

        # bass
        bass_style = st["bass"]
        bf = note_freq(root)
        if bass_style == "pump":
            for e in range(8):
                n = int(beat / 2 * SR)
                x = osc("saw", n, bf) * 0.5
                place(buf, lowpass_fast(x, 300), bar_at + e * beat / 2)
        elif bass_style == "offbeat":
            for e in range(4):
                n = int(beat / 2 * SR)
                x = osc("saw", n, bf) * 0.55
                place(buf, lowpass_fast(x, 280), bar_at + e * beat + beat / 2)
        elif bass_style == "walk":
            for e, semi in enumerate([0, 0, 7, 0, 0, 7, 5, 7]):
                n = int(beat / 2 * SR)
                x = osc("saw", n, note_freq(root + semi)) * 0.45
                place(buf, lowpass_fast(x, 320), bar_at + e * beat / 2)
        elif bass_style == "sub":
            n = int(bar * SR)
            x = osc("sine", n, bf / 2) * 0.6
            place(buf, x, bar_at)
        elif bass_style == "sustain":
            n = int(bar * SR)
            x = osc("triangle", n, bf) * 0.4
            place(buf, lowpass_fast(x, 300), bar_at)

        # pad chords
        if st["pad"] > 0.05:
            chord = [chord_root, chord_root + scale[2 % len(scale)], chord_root + scale[4 % len(scale)]]
            n = int(bar * SR)
            pad = np.zeros(n)
            for semi in chord:
                for det in (-0.4, 0.4):
                    pad += osc("saw", n, note_freq(semi + det)) / 6
            pad = lowpass_fast(pad, 900) * adsr(n, 0.4, 0.5) * st["pad"] * 0.55
            place(buf, pad, bar_at)

        # lead melody
        if rnd.random() < st["lead_density"]:
            shape = st["lead"]
            octv = 12 * st["lead_oct"]
            step_len = beat / (2 if rnd.random() < 0.7 else 4)
            deg = rnd.randint(0, len(scale) - 1)
            tt = 0.0
            while tt < bar - 0.01:
                if rnd.random() < 0.82:
                    deg += rnd.choice((-2, -1, -1, 1, 1, 2))
                    deg = max(-3, min(len(scale) + 2, deg))
                    oct_shift = 0
                    d = deg
                    while d >= len(scale):
                        d -= len(scale)
                        oct_shift += 1
                    while d < 0:
                        d += len(scale)
                        oct_shift -= 1
                    semi = chord_root + octv + oct_shift * 12 + scale[d]
                    dur_n = step_len * rnd.choice((1, 1, 1, 2))
                    n = int(dur_n * SR)
                    if shape == "piano":
                        x = osc("piano", n, note_freq(semi)) * env_exp(n, 5)
                    else:
                        x = osc(shape, n, note_freq(semi)) * adsr(n, 0.01, 0.08) * 0.5
                    place(buf, x, bar_at + tt)
                    tt += dur_n
                else:
                    tt += step_len

    # global echo for depth
    echo = np.copy(buf)
    dly = int(beat * 0.75 * SR)
    echo[dly:] += buf[:-dly] * 0.28
    buf = echo

    # post
    buf = np.tanh(buf * 1.15) * 0.85
    fi = int(0.06 * SR)
    fo = int(min(2.0, duration / 6) * SR)
    buf[:fi] *= np.linspace(0, 1, fi)
    buf[-fo:] *= np.linspace(1, 0, fo)
    peak = np.max(np.abs(buf)) or 1.0
    buf = buf / peak * 0.88

    d = int(0.011 * SR)
    right = np.concatenate([np.zeros(d), buf[:-d]]) * 0.92
    left = buf
    stereo = np.stack([left, right], axis=1)
    return stereo, duration


def write_mp3(path, stereo, meta):
    raw = (np.clip(stereo, -1, 1) * 32767).astype("<i2").tobytes()
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0",
           "-b:a", "80k", "-id3v2_version", "3",
           "-metadata", f"title={meta['title']}", "-metadata", f"artist={meta['artist']}",
           "-metadata", f"album={meta['album']}", path]
    subprocess.run(cmd, input=raw, check=True)


# ----------------------------------------------------------------------------
# Build manifest
# ----------------------------------------------------------------------------

manifest = {"artists": [], "albums": [], "tracks": [], "playlists": []}
artist_by_id = {a["id"]: a for a in ARTISTS}

for a in ARTISTS:
    seed = hash(a["id"]) & 0xFFFF
    rnd = random.Random(seed)
    w = 512
    img = Image.new("RGB", (w, w))
    img = gen_blob(img, a["hue"], rnd).filter(ImageFilter.GaussianBlur(8))
    img = _finish(img, seed=seed)
    path = os.path.join(ART, f"{a['id']}.jpg")
    img.save(path, quality=80)
    col = vibrant_color(img)
    manifest["artists"].append({
        "id": a["id"], "name": a["name"], "genre": a["genre"],
        "imageUrl": f"/media/artists/{a['id']}.jpg",
        "color": list(col),
    })
    print("artist", a["name"], flush=True)

track_index = 0
for ai, (artist_id, album_title, year, genre, titles) in enumerate(ALBUMS):
    seed = hash((artist_id, album_title)) & 0xFFFF
    rnd = random.Random(seed)
    img = Image.new("RGB", (512, 512))
    gen = GEN_BY_GENRE[genre][rnd.randrange(len(GEN_BY_GENRE[genre]))]
    img = gen(img, artist_by_id[artist_id]["hue"] + rnd.randint(-18, 18), rnd)
    img = _finish(img, seed=seed)
    cover_id = f"al{ai:02d}"
    img.save(os.path.join(COV, f"{cover_id}.jpg"), quality=82)
    col = vibrant_color(img)

    album_id = f"album-{cover_id}"
    artist = artist_by_id[artist_id]
    track_ids = []
    album_play_total = 0
    for ti, title in enumerate(titles):
        trnd = random.Random(seed * 1000 + ti)
        dur = trnd.choice([88, 96, 104, 112, 118, 124, 132, 140])
        plays = int(trnd.random() ** 2.2 * 2400) + 1
        album_play_total += plays
        tid = f"tr{track_index:04d}"
        track_index += 1
        track_ids.append(tid)
        audio_path = os.path.join(AUD, f"{tid}.mp3")
        if not os.path.exists(audio_path):
            stereo, actual_dur = compose(seed * 1000 + ti * 7 + 3, genre, dur)
            write_mp3(audio_path, stereo, {"title": title, "artist": artist["name"], "album": album_title})
            print(f"  track {tid} {title} ({dur}s)", flush=True)
        manifest["tracks"].append({
            "id": tid,
            "name": title.strip() if not title.startswith(" ") else title.strip(),
            "albumId": album_id,
            "artistId": artist_id,
            "artistName": artist["name"],
            "albumName": album_title,
            "trackNum": ti + 1,
            "duration": dur,
            "playCount": plays,
            "genre": genre,
            "year": year,
            "audioUrl": f"/media/audio/{tid}.mp3",
        })

    manifest["albums"].append({
        "id": album_id,
        "name": album_title,
        "artistId": artist_id,
        "artistName": artist["name"],
        "year": year,
        "genre": genre,
        "coverUrl": f"/media/covers/{cover_id}.jpg",
        "color": list(col),
        "trackIds": track_ids,
        "playCount": album_play_total,
        "rating": round(rnd.uniform(2.5, 5), 1),
        "duration": sum(t["duration"] for t in manifest["tracks"] if t["albumId"] == album_id),
    })
    print("album", album_title, flush=True)

all_track_ids = [t["id"] for t in manifest["tracks"]]
for pi, pl in enumerate(PLAYLISTS):
    prnd = random.Random(hash(pl["id"]) & 0xFFFF)
    pool = list(all_track_ids)
    prnd.shuffle(pool)
    count = prnd.randint(10, 18)
    picks = pool[:count]
    art_album = manifest["albums"][(pi * 5 + 3) % len(manifest["albums"])]
    manifest["playlists"].append({
        "id": pl["id"],
        "name": pl["name"],
        "trackIds": picks,
        "coverUrl": art_album["coverUrl"],
        "color": list(art_album["color"]),
        "duration": sum(next(t for t in manifest["tracks"] if t["id"] == tid)["duration"] for tid in picks),
    })
    print("playlist", pl["name"], flush=True)

os.makedirs(os.path.join(ROOT, "src", "lib"), exist_ok=True)
with open(os.path.join(ROOT, "src", "lib", "library-manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)

print("TOTAL tracks:", len(manifest["tracks"]), "albums:", len(manifest["albums"]))
print("DONE")
