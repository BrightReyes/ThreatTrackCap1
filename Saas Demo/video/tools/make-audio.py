# Original, fully synthesized soundtrack for the ThreatTrack SaaS demo.
# Writes audio/music.wav and audio/sfx.wav. No samples or third-party recordings.
import sys
import wave
import numpy as np

SR = 44100
DUR = 95.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
BPM = 124
BEAT = 60 / BPM
BAR = BEAT * 4

def tone(f, d, partials=1, decay=None):
    t = np.arange(int(d * SR)) / SR
    y = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, partials + 1))
    if decay:
        y *= np.exp(-t / decay)
    return y

def add(buf, y, t, g=1.0):
    i = int(t * SR)
    if i >= len(buf) or i < 0:
        return
    y = y[: len(buf) - i]
    buf[i: i + len(y)] += y * g

def lp(y, k):
    return np.convolve(y, np.ones(k) / k, mode="same")

def fade(y, a=.004, r=.02):
    a, r = int(a * SR), int(r * SR)
    y = y.copy()
    y[:a] *= np.linspace(0, 1, a)
    y[-r:] *= np.linspace(1, 0, r)
    return y

def kick():
    d = .28
    t = np.arange(int(d * SR)) / SR
    ph = 2 * np.pi * np.cumsum(46 + 130 * np.exp(-t / .035)) / SR
    return np.sin(ph) * np.exp(-t / .09)

def hat(d=.05):
    n = rng.normal(0, 1, int(d * SR))
    return np.diff(n, prepend=0) * np.exp(-np.arange(len(n)) / (SR * .014))

# ---------- music ----------
music = np.zeros(N)
ROOTS = [110.0, 87.31, 130.81, 98.0]              # Am F C G
TRIADS = [[1, 1.189, 1.498], [1, 1.26, 1.498], [1, 1.26, 1.498], [1, 1.26, 1.498]]
K, H = kick(), hat()
ARP = [0, 1, 2, 1, 2, 3, 2, 1]

def section(t):
    if t < 7.45: return dict(kick=.9, hat=.5, bass=.9, arp=.25, pad=.8)
    if t < 45.3: return dict(kick=1, hat=.8, bass=1, arp=.8, pad=.7)
    if t < 53.45: return dict(kick=.65, hat=.55, bass=.8, arp=1, pad=1)
    if t < 85.8: return dict(kick=1, hat=.9, bass=1, arp=.9, pad=.8)
    return dict(kick=0, hat=0, bass=0, arp=0, pad=1)

bar = 0
while bar * BAR < 89.6:
    tb = bar * BAR
    i = bar % 4
    root, tri = ROOTS[i], TRIADS[i]
    s = section(tb)
    p = sum(fade(tone(root * 2 * r * dt, BAR, 4), .08, .2) for r in tri for dt in (1, 1.004))
    add(music, p, tb, .045 * s["pad"])
    for b in range(16):
        t = tb + b * BEAT / 4
        s = section(t)
        if b % 4 == 0 and s["kick"]:
            add(music, K, t, .62 * s["kick"])
        if b % 4 == 2 and s["hat"]:
            add(music, H, t, .1 * s["hat"])
        if b % 2 == 1 and s["hat"]:
            add(music, H, t, .035 * s["hat"])
        if b % 2 == 0 and b % 4 != 0 and s["bass"]:
            add(music, fade(tone(root / 2, BEAT / 2, 4, .14)), t, .3 * s["bass"])
        elif b % 4 == 3 and s["bass"]:
            add(music, fade(tone(root / 2, BEAT / 4, 4, .08)), t, .2 * s["bass"])
        if s["arp"]:
            n = ARP[b % 8]
            f = root * 4 * (tri[n] if n < 3 else 2)
            add(music, fade(tone(f, BEAT / 2, 3, .09)), t, .05 * s["arp"])
    bar += 1

# Final title: one sustained chord that rings out under the reveal.
t0 = 89.62
for f in (110, 164.81, 220, 261.63, 329.63):
    add(music, fade(tone(f, DUR - t0, 4), .02, 1.4), t0, .07)
music[int(t0 * SR) - 1:] *= 1.0
music[int(94.0 * SR):] *= np.linspace(1, 0, N - int(94.0 * SR))

# ---------- sfx ----------
sfx = np.zeros(N)

def whoosh(d=.42):
    n = rng.normal(0, 1, int(d * SR))
    e = np.sin(np.linspace(0, np.pi, len(n))) ** 2
    return lp(n, 9) * e

def sub(d=.7, f0=70, f1=34):
    t = np.arange(int(d * SR)) / SR
    ph = 2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t / .16)) / SR
    return np.sin(ph) * np.exp(-t / (d / 3))

def click(f=1900):
    return fade(tone(f, .04, 2, .012), .001, .005)

def pop():
    t = np.arange(int(.12 * SR)) / SR
    return np.sin(2 * np.pi * np.cumsum(520 + 500 * np.exp(-t / .03)) / SR) * np.exp(-t / .04)

def thud():
    return sub(.22, 120, 55) + lp(rng.normal(0, 1, int(.22 * SR)), 30) * .5 * np.exp(-np.arange(int(.22 * SR)) / (SR * .03))

def shutter():
    y = np.zeros(int(.16 * SR))
    b = rng.normal(0, 1, int(.03 * SR)) * np.exp(-np.arange(int(.03 * SR)) / (SR * .008))
    y[:len(b)] += b
    y[int(.09 * SR):int(.09 * SR) + len(b)] += b * .8
    return lp(y, 3)

def ding(f=1320):
    return fade(tone(f, .5, 3, .16), .002, .05)

def riser(d):
    t = np.arange(int(d * SR)) / SR
    p = t / d
    y = lp(rng.normal(0, 1, len(t)), 5) * p ** 2.2
    y += np.sin(2 * np.pi * np.cumsum(150 + 750 * p ** 2) / SR) * .4 * p ** 2
    return y

# Scene changes and camera whips
for t in [4.62, 7.45, 16.05, 24.25, 30.55, 36.1, 40.0, 45.3, 53.45, 62.25, 66.65, 70.35, 75.45, 85.95]:
    add(sfx, whoosh(), t - .2, .3)
    add(sfx, sub(.32), t, .28)

for t in [.02, 4.72]:
    add(sfx, thud(), t, .35)
for t in [.78, 1.86]:
    add(sfx, pop(), t, .35)
add(sfx, click(), 2.3, .5)
add(sfx, ding(), 2.75, .16)

add(sfx, shutter(), 4.95, .6)
add(sfx, whoosh(.6), 5.42, .3)
add(sfx, thud(), 6.1, .28)

# Press, count, cancel, commit
add(sfx, click(1200), 7.6, .5)
for t in [8.0, 8.55, 9.1]:
    add(sfx, thud(), t, .34)
    add(sfx, click(2400), t, .3)
y = fade(tone(420, .3, 3), .002, .1)
t_ = np.arange(len(y)) / SR
y = np.sin(2 * np.pi * np.cumsum(520 - 900 * t_) / SR) * np.exp(-t_ / .1)
add(sfx, y, 9.85, .36)
add(sfx, click(1200), 11.42, .5)
add(sfx, riser(.8), 11.46, .3)
add(sfx, sub(.5), 12.24, .4)
add(sfx, whoosh(.45), 12.24, .26)
add(sfx, click(), 13.0, .55)
add(sfx, ding(), 13.42, .2)
for i in range(4):
    add(sfx, click(2600), 13.7 + i * .08, .2)
add(sfx, whoosh(1.0), 14.76, .42)

# Report
for i in range(10):
    add(sfx, pop(), 16.75 + i * .1, .18)
add(sfx, click(), 19.24, .4); add(sfx, click(), 19.86, .4)
add(sfx, shutter(), 20.86, .6)
for i in range(5):
    add(sfx, click(2200 - i * 180), 21.42 + i * .22, .25)
add(sfx, ding(1046), 23.15, .22); add(sfx, ding(1568), 23.27, .18)

# Routing
add(sfx, click(), 24.6, .5)
add(sfx, thud(), 25.2, .4)
for i in range(3):
    add(sfx, click(2600), 25.75 + i * .14, .2)
add(sfx, pop(), 26.86, .3); add(sfx, pop(), 26.95, .24)
add(sfx, whoosh(.5), 27.15, .2)
add(sfx, ding(988), 28.16, .24)
add(sfx, whoosh(1.2), 29.1, .22)

# SOS interrupt alarm, then sync hits
for i in range(6):
    add(sfx, fade(tone(880 if i % 2 == 0 else 660, .17, 3), .004, .02), 31.1 + i * .19, .14)
add(sfx, thud(), 31.1, .45)
for t in [33.1, 34.04, 34.8]:
    add(sfx, pop(), t, .3)

# Dispatch
add(sfx, pop(), 36.3, .28)
add(sfx, click(), 38.04, .6); add(sfx, sub(.4), 38.04, .3)
add(sfx, ding(1046), 38.9, .24); add(sfx, ding(1568), 39.03, .2)

# Ratings
add(sfx, pop(), 40.7, .28)
add(sfx, thud(), 41.45, .36)
add(sfx, ding(1318), 41.48, .16)
add(sfx, pop(), 42.1, .26); add(sfx, pop(), 42.6, .26)
add(sfx, thud(), 43.4, .42); add(sfx, thud(), 43.5, .42)

# Help on the way
add(sfx, ding(784), 46.45, .28); add(sfx, ding(1175), 46.62, .24)
for i in range(4):
    add(sfx, click(2200), 49.05 + i * .16, .24)
for t in [50.86, 51.3, 51.74, 52.2]:
    add(sfx, ding(1046 + 150 * [50.86, 51.3, 51.74, 52.2].index(t)), t, .12)
add(sfx, ding(1568), 53.0, .3)

# Hotspots
for i in range(7):
    add(sfx, pop(), 55.8 + i * .16, .22)
add(sfx, click(), 57.6, .35); add(sfx, click(), 58.3, .35)
add(sfx, pop(), 59.15, .3); add(sfx, ding(1175), 60.0, .2); add(sfx, click(), 61.1, .5)

# AI
add(sfx, click(), 63.72, .55)
add(sfx, riser(.5), 63.8, .16)
for t in [64.6, 65.05, 65.5]:
    add(sfx, pop(), t, .26)
add(sfx, pop(), 68.5, .3); add(sfx, click(), 69.4, .4); add(sfx, pop(), 69.65, .3)
add(sfx, thud(), 71.2, .3); add(sfx, thud(), 71.8, .3)
add(sfx, whoosh(.5), 72.0, .2); add(sfx, pop(), 73.3, .32)
add(sfx, ding(1318), 73.9, .16); add(sfx, ding(1568), 74.0, .14)
add(sfx, pop(), 78.1, .28); add(sfx, pop(), 79.4, .28)
add(sfx, thud(), 80.45, .36); add(sfx, thud(), 81.4, .28); add(sfx, thud(), 84.0, .4)
add(sfx, sub(.5), 85.0, .4); add(sfx, ding(988), 85.05, .22)

# Title reveal
add(sfx, thud(), 86.34, .3); add(sfx, thud(), 88.0, .3)
add(sfx, riser(.9), 88.72, .42)
add(sfx, whoosh(.6), 89.05, .3)
add(sfx, sub(1.8, 80, 28), 89.62, .85)
add(sfx, lp(rng.normal(0, 1, int(.9 * SR)), 12) * np.exp(-np.arange(int(.9 * SR)) / (SR * .2)), 89.62, .5)
add(sfx, ding(1760), 90.68, .1)

def write(path, y):
    y = np.clip(y / max(1e-9, np.abs(y).max()) * .89, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype(np.int16).tobytes())

write(sys.argv[1], music)
write(sys.argv[2], sfx)
print("music peak", round(float(np.abs(music).max()), 3), "sfx peak", round(float(np.abs(sfx).max()), 3))
