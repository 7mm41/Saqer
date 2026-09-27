"""Export the 604 Madani mushaf pages from the pdfquran.com standard mushaf (King Fahd Complex print).

  curl -L -o standard1-quran.pdf https://www.pdfquran.com/download/standard1/standard1-quran.pdf
  python3 export_pages.py standard1-quran.pdf

PDF page n+2 is mushaf page n (1…604). The embedded 750 px scans are re-encoded as WebP (q70, ~115 KB each)
into Assets/Quran/Pages/mushaf_<ppp>.webp.
"""
import io, os, sys
from concurrent.futures import ProcessPoolExecutor

import pymupdf
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ThaqafaIslamiya", "Assets", "Quran", "Pages")


def export(args):
    pdf, page = args
    doc = pymupdf.open(pdf)
    xref = doc[page + 2].get_images()[0][0]
    image = Image.open(io.BytesIO(doc.extract_image(xref)["image"])).convert("RGB")
    image.save(os.path.join(OUT, f"mushaf_{page:03d}.webp"), "WEBP", quality=70, method=6)
    return page


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    with ProcessPoolExecutor() as ex:
        list(ex.map(export, [(sys.argv[1], p) for p in range(1, 605)], chunksize=8))
    print("ok")
