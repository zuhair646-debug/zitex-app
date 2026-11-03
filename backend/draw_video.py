"""
Draw video composer (server side, ffmpeg via imageio-ffmpeg).

Output: 720x1280 vertical MP4
  0 … intro_ms          → officer's face full-screen + lower-third (title, permit, fairness commitment)
  intro_ms … end        → animated draw stage (rolling reels → winner reveal) with the face cam as a
                          small picture-in-picture in the top-left corner; audio runs through the whole video.
"""
import base64
import hashlib
import io
import math
import os
import subprocess
import tempfile

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

W, H = 720, 1280
FPS = 15
ROLL_MS = 4000
HERE = os.path.dirname(__file__)
FONT = os.path.join(HERE, "fonts", "Cairo.ttf")
GOLD, GOLD_L, GOLD_D = (201, 168, 92), (246, 222, 154), (122, 90, 34)
INK, INK2, WHITE, MUTED = (14, 13, 18), (28, 24, 20), (245, 242, 235), (170, 160, 140)
_fonts = {}


def font(size, weight="Bold"):
    k = (size, weight)
    if k not in _fonts:
        f = ImageFont.truetype(FONT, size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _fonts[k] = f
    return _fonts[k]


def ar(t):
    return str(t)  # Pillow is built with libraqm → it shapes Arabic and applies bidi itself


def ltr(p):
    return "\u2066" + str(p) + "\u2069"  # keep masked phones / codes left-to-right inside Arabic lines


def text(d, xy, s, size, fill=WHITE, weight="Bold", anchor="mm"):
    d.text(xy, ar(s), font=font(size, weight), fill=fill, anchor=anchor)


def logo_img(size):
    raw = open(os.path.join(HERE, "static_logo.b64")).read().strip()
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGBA").resize((size, size), Image.LANCZOS)


def gradient(top, bottom):
    g = Image.new("RGB", (1, H))
    for y in range(H):
        a = y / (H - 1)
        g.putpixel((0, y), tuple(int(top[i] * (1 - a) + bottom[i] * a) for i in range(3)))
    return g.resize((W, H))


def background(comp, s):
    bg = gradient(INK, INK2)
    d = ImageDraw.Draw(bg)
    for i in range(-H, W, 46):  # faint diagonal gold pattern
        d.line([(i, 0), (i + H, H)], fill=(30, 26, 20), width=1)
    d.rectangle([10, 10, W - 11, H - 11], outline=GOLD_D, width=2)
    # header (right side — the face cam PiP sits top-left)
    bg.paste(logo_img(64), (W - 92, 34), logo_img(64))
    text(d, (W - 108, 52), "ZENREX", 22, GOLD_L, anchor="rm")
    text(d, (W - 108, 82), "سحب رسمي موثّق", 18, MUTED, "SemiBold", anchor="rm")
    text(d, (W - 30, 150), comp.get("title", "")[:34], 28, WHITE, anchor="rm")
    text(d, (W - 30, 192), f"الجائزة: {str(comp.get('prize', ''))[:30]}", 20, GOLD, "SemiBold", anchor="rm")
    if comp.get("permit_number"):
        text(d, (W - 30, 228), f"بإشراف الغرفة التجارية — تصريح رقم {comp['permit_number']}", 18, MUTED, "SemiBold", anchor="rm")
    y = 420
    d.rounded_rectangle([30, y, W - 30, y + 56], 14, fill=(22, 20, 18), outline=GOLD_D)
    text(d, (W / 2, y + 28), f"عدد المشاركين المؤهلين: {len(s['snapshot'])}   •   الجوائز: {s['slots']}", 20, WHITE, "SemiBold")
    text(d, (W / 2, y + 84), f"بصمة السحب قبل البدء: {s['seed_hash'][:20]}…", 16, MUTED, "Regular")
    return bg


def lower_third(comp, s):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    band = Image.new("RGBA", (W, 300), (10, 9, 12, 215))
    im.paste(band, (0, H - 300))
    d = ImageDraw.Draw(im)
    d.line([(0, H - 300), (W, H - 300)], fill=GOLD + (255,), width=3)
    im.paste(logo_img(70), (W - 100, H - 270), logo_img(70))
    text(d, (W - 118, H - 248), "ZENREX — سحب رسمي", 24, GOLD_L, anchor="rm")
    text(d, (W - 30, H - 190), comp.get("title", "")[:36], 28, WHITE, anchor="rm")
    if comp.get("permit_number"):
        text(d, (W - 30, H - 145), f"بإشراف الغرفة التجارية — تصريح رقم {comp['permit_number']}", 20, GOLD, "SemiBold", anchor="rm")
    text(d, (W - 30, H - 100), f"المشاركون: {len(s['snapshot'])}  •  بصمة السحب: {s['seed_hash'][:16]}…", 18, MUTED, "Regular", anchor="rm")
    if s.get("kind") == "redraw" and s.get("replaced"):
        text(d, (W - 30, H - 58), f"سحب بديل عن: {s['replaced'].get('name', '')} — {s.get('reason', '')[:28]}", 17, MUTED, "Regular", anchor="rm")
    return im


def _h(*a):
    return int(hashlib.md5(":".join(map(str, a)).encode()).hexdigest()[:8], 16)


def reel(d, box, names, k, elapsed, winner):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 18, fill=(20, 18, 16), outline=GOLD, width=3)
    u = min(1.0, elapsed / ROLL_MS)
    ticks = int(46 * (1 - (1 - u) ** 3))  # fast → slow, like a real slot reel
    cy = (y0 + y1) / 2
    if u >= 0.985:
        text(d, ((x0 + x1) / 2, cy), winner["name"][:26], 34 if (y1 - y0) > 110 else 28, GOLD_L)
        return
    n = len(names)
    for off, alpha, sz in ((-1, 90, 20), (0, 255, 32), (1, 90, 20)):
        nm = names[_h(k, ticks + off) % n]["name"][:24]
        col = tuple(int(c * alpha / 255) for c in WHITE)
        text(d, ((x0 + x1) / 2, cy + off * (y1 - y0) * 0.32), nm, sz if (y1 - y0) > 110 else sz - 4, col, "SemiBold")


def winner_card(d, box, w, glow_t):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 18, fill=(40, 32, 16), outline=GOLD_L, width=4 if int(glow_t / 250) % 2 else 2)
    big = (y1 - y0) > 110
    text(d, (x1 - 24, y0 + 30), f"الفائز رقم {w['k']}", 20 if big else 17, GOLD, anchor="rm")
    text(d, ((x0 + x1) / 2, (y0 + y1) / 2 + 8), w["name"][:26], 36 if big else 28, WHITE)
    text(d, ((x0 + x1) / 2, y1 - 24), f"{ltr(w['phone'])}   •   مشارك رقم {w['n']}", 17 if big else 15, MUTED, "Regular")


def confetti(d, t_since, seed):
    if t_since > 2600:
        return
    for i in range(70):
        x = (_h(seed, i, "x") % W)
        sp = 0.25 + (_h(seed, i, "s") % 100) / 160
        y = -20 + t_since * sp - (_h(seed, i, "y") % 300)
        if 0 < y < H:
            c = (GOLD_L, GOLD, WHITE)[i % 3]
            r = 4 + i % 4
            d.rectangle([x, y, x + r, y + r * 1.8], fill=c)


def frame(bg, s, picks_by_k, events, t, finish_ms):
    im = bg.copy()
    d = ImageDraw.Draw(im)
    names = s["snapshot"]
    done = [e for e in events if t >= e["t_ms"] + ROLL_MS]
    cur = next((e for e in reversed(events) if t >= e["t_ms"]), None)
    top, bottom = 600, 1010
    if cur is None:
        text(d, (W / 2, (top + bottom) / 2 - 20), "جاهزين للسحب", 46, GOLD_L)
        text(d, (W / 2, (top + bottom) / 2 + 40), "النتيجة تُحسب آلياً ولا يمكن لأحد التحكم بها", 20, MUTED, "SemiBold")
    else:
        batch = [picks_by_k[k] for k in range(cur["pick_from"], cur["pick_to"] + 1) if k in picks_by_k]
        el = t - cur["t_ms"]
        n = max(1, len(batch))
        gap = 16
        hgt = min(200, (bottom - top - gap * (n - 1)) / n)
        y = top + ((bottom - top) - (hgt * n + gap * (n - 1))) / 2
        label = "جارِ السحب…" if el < ROLL_MS else ("مبروك للفائز!" if n == 1 else "مبروك للفائزين!")
        text(d, (W / 2, top - 30), label, 30, GOLD_L)
        for w in batch:
            box = (40, y, W - 40, y + hgt)
            (reel(d, box, names, w["k"], el, w) if el < ROLL_MS else winner_card(d, box, w, el))
            y += hgt + gap
        if el >= ROLL_MS:
            confetti(d, el - ROLL_MS, cur["pick_from"])
    prev = [picks_by_k[k] for e in done for k in range(e["pick_from"], e["pick_to"] + 1) if k in picks_by_k]
    if prev:
        text(d, (W - 40, 1040), "الفائزون", 20, GOLD, anchor="rm")
        for i, w in enumerate(prev[-6:]):
            yy = 1078 + i * 30
            text(d, (W - 40, yy), f"{w['k']}. {w['name'][:22]}", 18, WHITE, "SemiBold", anchor="rm")
            text(d, (40, yy), ltr(w["phone"]), 16, MUTED, "Regular", anchor="lm")
    if finish_ms and t >= finish_ms:
        d.rounded_rectangle([30, 420, W - 30, 520], 16, fill=(16, 40, 24), outline=(80, 190, 120), width=3)
        text(d, (W / 2, 450), "اكتمل السحب — تم كشف مفتاح السحب للتحقق", 22, (150, 230, 170))
        b = s.get("beacon") or {}
        text(d, (W / 2, 490), f"رمز الموظف {ltr(s.get('officer_code', ''))} • drand #{b.get('round', '-')} • {(s.get('final_seed') or '')[:16]}…", 16, WHITE, "Regular")
    return im


def render(face_bytes: bytes, s: dict, comp: dict, v: dict) -> bytes:
    intro = max(0.5, v["intro_ms"] / 1000)
    total = max(intro + 1, v["duration_ms"] / 1000)
    events = sorted([e for e in v.get("events") or [] if isinstance(e, dict)], key=lambda e: e.get("t_ms", 0))
    events = [{"t_ms": int(e["t_ms"]), "pick_from": int(e["pick_from"]), "pick_to": int(e["pick_to"])} for e in events]
    picks = {p["k"]: p for p in s["picks"]}
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory() as tmp:
        face = os.path.join(tmp, "face.mp4")
        open(face, "wb").write(face_bytes)
        lt = os.path.join(tmp, "lt.png")
        lower_third(comp, s).save(lt)
        out = os.path.join(tmp, "out.mp4")
        fc = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps=30,split[fa][fb];"
              f"[fa]trim=end={intro:.3f},setpts=PTS-STARTPTS[fi];[fi][1:v]overlay=0:0[intro];"
              f"[fb]trim=start={intro:.3f},setpts=PTS-STARTPTS,scale=216:384,pad=iw+8:ih+8:4:4:color=0xC9A85C[pip];"
              f"[2:v]fps=30,setpts=PTS-STARTPTS[stage];[stage][pip]overlay=20:20:shortest=1[draw];"
              f"[intro][draw]concat=n=2:v=1:a=0,format=yuv420p[v]")
        cmd = [ff, "-y", "-loglevel", "error", "-i", face, "-i", lt,
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
               "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
               "-crf", "25", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out]
        err = open(os.path.join(tmp, "err.log"), "w+")
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=err)
        bg = background(comp, s)
        frames = math.ceil((total - intro) * FPS)
        try:
            for i in range(frames):
                t = intro * 1000 + i * 1000 / FPS
                p.stdin.write(frame(bg, s, picks, events, t, v.get("finish_ms") or 0).tobytes())
        except BrokenPipeError:
            pass
        p.stdin.close()
        code = p.wait(timeout=900)
        if code != 0 or not os.path.exists(out):
            err.seek(0)
            raise RuntimeError(f"ffmpeg failed: {err.read()[-400:]}")
        return open(out, "rb").read()
