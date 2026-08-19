"""Turn a standard's PDF into clause-sized chunks.

The whole point is that Charlie quotes rather than paraphrases, so a chunk has
to be a real clause with its real number — not an arbitrary window of text.
Australian standards number their clauses strictly (3.11.3.1), which makes the
boundaries findable; the fight is with everything that LOOKS like a heading and
isn't: the contents pages, running headers, and figure/table captions.
"""
import re, json, sys
import pymupdf

# "3.11.3.1  Category A underground wiring systems"
HEADING = re.compile(r'^\s*(\d{1,2}(?:\.\d{1,3}){1,4})\s+(\S.{2,95})$')
# Contents lines carry dot leaders and a trailing page number: "1.3 REFERENCED ..... 34"
CONTENTS = re.compile(r'\.{4,}\s*\d+\s*$|\.\s\.\s\.\s')

def page_lines(doc, i):
    return [l.rstrip() for l in doc[i].get_text().splitlines()]

def is_running_header(line, std_tag):
    s = line.strip()
    if not s: return True
    if s.isdigit(): return True                       # bare page number
    if std_tag and std_tag.lower() in s.lower() and len(s) < 60: return True
    # The DRM watermark is stamped on every page and would otherwise land in
    # the middle of whatever clause the page happened to be showing.
    if re.match(r'(COPYRIGHT|Licensed to |Accessed by |This is a free preview)', s, re.I): return True
    if s == '*': return True
    if 'saiglobal.com/licensing' in s.lower(): return True
    if re.match(r'Get permission to copy', s, re.I): return True
    return False

def chunk(path, standard, edition, std_tag, note=""):
    doc = pymupdf.open(path)
    clauses, cur = [], None
    for i in range(doc.page_count):
        for raw in page_lines(doc, i):
            if is_running_header(raw, std_tag):
                continue
            if CONTENTS.search(raw):                  # contents page entry, not a clause
                continue
            m = HEADING.match(raw)
            if m and not m.group(2).endswith(('.', ',')):
                if cur: clauses.append(cur)
                cur = {"standard": standard, "edition": edition, "note": note,
                       "clause": m.group(1), "title": m.group(2).strip(),
                       "page": i + 1, "text": []}
                continue
            if cur: cur["text"].append(raw)
    if cur: clauses.append(cur)
    doc.close()
    out = []
    for c in clauses:
        body = re.sub(r'\n{2,}', '\n', "\n".join(c["text"]).strip())
        # A parent clause (2.6.2) often has no prose of its own — its body is
        # its children. Dropping those lost exactly the headings a sparky asks
        # for by name, so keep them and let the children speak for them.
        c["parent"] = len(body) < 40
        c["text"] = body[:6000]
        out.append(c)
    return out

if __name__ == "__main__":
    cl = chunk(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4],
               sys.argv[5] if len(sys.argv) > 5 else "")
    json.dump(cl, open(sys.argv[6], "w"), indent=None)
    print("%-28s %5d clauses" % (sys.argv[2], len(cl)))
