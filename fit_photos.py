# Crops each team photo to the person (drops empty or transparent borders) and makes it square.
import glob, os, shutil
from PIL import Image, ImageChops
os.makedirs('static/img/team/originals', exist_ok=True)
for p in glob.glob('static/img/team/*.png'):
    keep = os.path.join('static/img/team/originals', os.path.basename(p))
    if not os.path.exists(keep):
        shutil.copy(p, keep)
    im = Image.open(keep).convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
    rgb = im.convert('RGB')
    bg = Image.new('RGB', rgb.size, rgb.getpixel((0, 0)))
    b2 = ImageChops.difference(rgb, bg).convert('L').point(lambda v: 255 if v > 25 else 0).getbbox()
    if box and b2:
        box = (max(box[0], b2[0]), max(box[1], b2[1]), min(box[2], b2[2]), min(box[3], b2[3]))
    box = box or b2 or (0, 0, *im.size)
    im = im.crop(box)
    w, h = im.size
    s = min(w, h)
    x0 = (w - s) // 2
    y0 = int((h - s) * 0.15)
    im = im.crop((x0, y0, x0 + s, y0 + s)).resize((512, 512), Image.LANCZOS)
    flat = Image.new('RGB', im.size, (14, 22, 40))
    flat.paste(im, mask=im.getchannel('A'))
    flat.save(p)
    print('fitted', os.path.basename(p))
