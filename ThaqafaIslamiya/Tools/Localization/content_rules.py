"""Rules applied to every content file (Arabic source and translations):
the app shows the lessons without the name of the original book, so the book title, author and source are
cleared and lesson references keep only their page numbers (e.g. "ص ٦١–٦٤" / "pp. 61–64")."""


def neutralize(data):
    book = data.get("book", {})
    for field in ("title", "author", "source"):
        book[field] = ""
    for lesson in data.get("lessons", []):
        ref = lesson.get("reference", "")
        for sep in ("، ", ", ", "، ", "," , "،"):
            if sep in ref:
                ref = ref.rsplit(sep, 1)[1]
                break
        lesson["reference"] = ref.strip()
    return data
