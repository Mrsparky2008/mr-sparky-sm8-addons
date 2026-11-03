"""
Fill EMC Technologies "Form 005 Customer and EUT Information" for the
Mr Sparky Smoke Alert 4G prototype. Runs locally on the PC (Windows/Mac/Linux).

Usage (from this folder):
    pip install openpyxl
    python fill_form005.py                      # looks in ~/Downloads
    python fill_form005.py "C:\\path\\to\\Form 005 Customer and EUT Information.xltm"
    python fill_form005.py --dump               # only print the sheets, write nothing

The original template is never modified; a filled copy is saved next to it.
Only the Device Details and Radio Details tabs are written (Sections 1-6).
"""
import re
import sys
from pathlib import Path

import openpyxl

OUT_NAME = "Form 005 - Mr Sparky Smoke Alert 4G"

# ---- TBC values: fill these in before running (left blank = cell left empty) ----
ADDRESS = ""          # TBC - confirm business address with Steven
ANTENNA_GAIN = "TBC"  # TBC - LILYGO flexible LTE antenna gain (dBi)

DEVICE = [
    # Section 1
    ("Company Name", "Mr Sparky Electrical Services Pty Ltd"),
    ("Address", ADDRESS),
    ("Contact Name", "Steven Sukar"),
    ("Contact Number", "0414 525 740"),
    ("Contact Email", "steven.sukar@mrsparky.com.au"),
    # Section 2 (dropdowns)
    ("Service 1", "EMC Testing (Emission/Immunity)"),
    ("Service 2", "Wireless / Radio Testing"),
    ("Service 3", "Electrical Safety Testing"),
    ("Service 4", "EMR Testing"),
    ("Other", "Pre-compliance testing first. Please advise if TEL-CRT (S042) testing is "
              "required or covered by the pre-certified 4G module."),
    # Section 3
    ("Intended Markets", "Australia (RCM)"),
    ("Product Intended use", "Residential"),
    ("Test Standards", "Not confirmed, please advise. Expected: AS/NZS CISPR 32, "
                       "AS/CA S042.1/S042.4, AS/NZS 62368.1, ACMA EME standard."),
    # Section 4
    ("Device/Product Name", "Mr Sparky Smoke Alert 4G"),
    ("Model Number", "MSA-4G-P1 (prototype)"),
    ("Description of Product",
     "Fixed indoor 4G alert unit installed by a licensed electrician next to a hardwired "
     "smoke alarm. Detects the smoke alarm interconnect signal (isolated by an optocoupler) "
     "and sends SMS alerts over 4G. ESP32 microcontroller with a SIMCom A7670SA LTE Cat-1 "
     "module. Powered from 230VAC via an encapsulated 5V module, with an internal 18650 "
     "Li-ion backup battery. Plastic LED-driver-style enclosure."),
    ("Accessories and/or Support Equipment",
     "Active SIM fitted. Smoke alarm or switch to simulate the alarm input, if required."),
    ("Product photos", "To follow once the prototype is built. Design drawing attached."),
    ("Additional Information",
     "Design PDF attached. Module: SIMCom A7670SA (LILYGO T-A7670SA R2 board)."),
    # Section 5
    ("Power Requirements",
     "230VAC 50Hz single phase, under 0.1A (internal Mean Well IRM-05-5 5V module) || "
     "3.7VDC 3000mAh Li-ion 18650 internal backup"),
    ("Weight", "0.3"),
    ("Dimensions", "20 x 7 x 3.5"),
    ("Highest Intentional Radiator Frequency", "2.69 GHz (4G LTE band 7)"),
    ("Highest Internal/Unintentional Radiator Frequency",
     "240 MHz ESP32 CPU. ESP32 2.4 GHz Wi-Fi/Bluetooth present but disabled in firmware."),
    ("List of external ports and cable length",
     "1 x 230VAC + interconnect terminal (A, N, I), about 1m. 2 x extra-low-voltage signal "
     "terminals, under 3m. USB-C for programming only, not used in service."),
    ("Number of Test Modes",
     "3 modes: standby (idle, network registered), transmit (SMS), battery backup"),
    ("Estimated EUT Setup Time for Testing", "15 minutes"),
    ("Additional information to Setup EUT",
     "Needs mobile coverage (Telstra SIM fitted). An SMS command makes the unit transmit "
     "on demand for testing."),
    ("IP XY Rating", "IP20 (indoor use)"),
    ("Ambient Operating Temperature", "0 to 40"),
]

# label, module 1 (4G), module 2 (ESP32)
RADIO = [
    ("Wireless Radio Module Manufacturer", "SIMCom", "Espressif"),
    ("Wireless Radio Module Model", "A7670SA-LASC", "ESP32-WROVER-B"),
    ("Pre-certified module", "Yes, RCM (AU/NZ). No FCC/IC ID.", "Yes"),
    ("Type of Radio Module", "Transceiver", "Transceiver"),
    ("Technology", "4G LTE Cat-1 cellular (2G GSM fallback, not used)",
     "2.4 GHz Wi-Fi / Bluetooth, disabled in firmware"),
    ("Normal Usage", "Fixed", "Fixed"),
    ("Distance From Human Body", "Greater than 20cm", "Greater than 20cm"),
    ("Operating band", "LTE-FDD B1/B2/B3/B4/B5/B7/B8/B28/B66. GSM 850/900/1800/1900",
     "2.4 GHz (not used)"),
    ("Nominal power", "23 dBm (LTE Class 3)", "Not transmitting"),
    ("Antenna Type and Gain",
     f"LILYGO supplied flexible LTE antenna, gain {ANTENNA_GAIN}", "Onboard PCB antenna"),
    ("Modulation", "LTE QPSK/16QAM", "n/a"),
    ("Nominal bandwidth", "LTE 1.4-20 MHz", "n/a"),
]

DROPDOWN_LABELS = {"service 1", "service 2", "service 3", "service 4", "intended markets",
                   "product intended use", "type of radio module", "normal usage"}


def norm(s):
    s = str(s or "").split(":")[0]
    s = re.sub(r"\(.*?\)", "", s)
    return re.sub(r"[^a-z0-9/]+", " ", s.lower()).strip()


def top_left(ws, cell):
    for rng in ws.merged_cells.ranges:
        if cell.coordinate in rng:
            return ws.cell(rng.min_row, rng.min_col)
    return cell


def dump(ws, max_row=120):
    print(f"\n===== {ws.title} =====")
    for row in ws.iter_rows(min_row=1, max_row=max_row):
        vals = [f"{c.coordinate}={c.value!r}" for c in row if c.value not in (None, "")]
        if vals:
            print("  " + " | ".join(vals))


def dropdown_values(wb):
    vals = set()
    for name in wb.sheetnames:
        if "drop" in name.lower():
            for row in wb[name].iter_rows():
                for c in row:
                    if isinstance(c.value, str) and c.value.strip():
                        vals.add(c.value.strip())
    return vals


def match_dropdown(value, options):
    if value in options:
        return value, True
    key = norm(value).replace(" ", "")
    for o in options:
        if norm(o).replace(" ", "") == key:
            return o, True
    return value, False


def find_rows(ws, label):
    """Rows whose column-A label matches. Exact match first, then prefix."""
    target = norm(label)
    exact, prefix = [], []
    for r in range(1, ws.max_row + 1):
        a = norm(ws.cell(r, 1).value)
        if not a:
            continue
        if a == target:
            exact.append(r)
        elif a.startswith(target):
            prefix.append(r)
    return exact or prefix


def answer_cell(ws, row, col):
    """Write into column `col` of the label row; if that cell already holds the lab's
    example text, use the blank cell directly below instead."""
    cell = top_left(ws, ws.cell(row, col))
    if cell.value not in (None, ""):
        below = top_left(ws, ws.cell(row + 1, col))
        if below.value in (None, "") and ws.cell(row + 1, 1).value in (None, ""):
            return below, f"(lab example in {cell.coordinate}; answer written below)"
        return None, f"cell {cell.coordinate} already contains {cell.value!r}"
    return cell, ""


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dump_only = "--dump" in sys.argv
    src = Path(args[0]) if args else Path.home() / "Downloads" / "Form 005 Customer and EUT Information.xltm"
    if not src.exists():
        sys.exit(f"Template not found: {src}\nDownload it from Google Drive / the email first.")

    wb = openpyxl.load_workbook(src, keep_vba=True)
    print("Sheets:", wb.sheetnames)
    for name in wb.sheetnames:
        if "device" in name.lower() or "radio" in name.lower() or "drop" in name.lower():
            dump(wb[name])
    if dump_only:
        return

    options = dropdown_values(wb)
    report, problems = [], []

    ws = next(wb[n] for n in wb.sheetnames if "device" in n.lower())
    seen = {}
    for label, value in DEVICE:
        if value in (None, ""):
            problems.append(f"Device Details: '{label}' left blank (TBC)")
            continue
        rows = find_rows(ws, label)
        idx = seen.get(norm(label), 0)
        if idx >= len(rows):
            problems.append(f"Device Details: label '{label}' not found")
            continue
        seen[norm(label)] = idx + 1
        row = rows[idx]
        if norm(label) in DROPDOWN_LABELS and options:
            value, ok = match_dropdown(value, options)
            if not ok:
                problems.append(f"Device Details: '{value}' is not in the Drop Down Lists tab")
        cell, note = answer_cell(ws, row, 2)
        if cell is None:
            problems.append(f"Device Details: '{label}' row {row}: {note}")
            continue
        cell.value = value
        report.append((ws.title, cell.coordinate, label, value, note))

    ws = next(wb[n] for n in wb.sheetnames if "radio" in n.lower())
    col2 = None
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and re.search(r"module\s*2", c.value, re.I):
                col2 = c.column
                break
        if col2:
            break
    for label, v1, v2 in RADIO:
        rows = find_rows(ws, label)
        if not rows:
            problems.append(f"Radio Details: label '{label}' not found")
            continue
        row = rows[0]
        for col, value in ((2, v1), (col2, v2)):
            if col is None:
                continue
            if norm(label) in DROPDOWN_LABELS and options:
                value, ok = match_dropdown(value, options)
                if not ok:
                    problems.append(f"Radio Details: '{value}' is not in the Drop Down Lists tab")
            cell, note = answer_cell(ws, row, col)
            if cell is None:
                problems.append(f"Radio Details: '{label}' row {row}: {note}")
                continue
            cell.value = value
            report.append((ws.title, cell.coordinate, label, value, note))
    if col2 is None:
        problems.append("Radio Details: no 'Radio Module 2' column found - ESP32 details not "
                        "written; add them to a notes cell by hand (Espressif ESP32-WROVER-B, "
                        "2.4 GHz Wi-Fi/BT disabled in firmware, onboard PCB antenna).")

    # Rows on Radio Details not covered above, for Steven to check
    known = {norm(l) for l, *_ in RADIO}
    extra = []
    for r in range(1, ws.max_row + 1):
        a = ws.cell(r, 1).value
        if a and not any(norm(a).startswith(k) or k.startswith(norm(a)) for k in known):
            if ws.cell(r, 2).value in (None, ""):
                extra.append(f"row {r}: {str(a).strip()}")

    wb.template = False
    has_vba = getattr(wb, "vba_archive", None) is not None
    out = src.with_name(OUT_NAME + (".xlsm" if has_vba else ".xlsx"))
    wb.save(out)

    # Reopen and confirm
    chk = openpyxl.load_workbook(out, keep_vba=has_vba)
    print(f"\nSaved: {out}\n\n===== Filled cells (read back from saved file) =====")
    for sheet, coord, label, value, note in report:
        got = chk[sheet][coord].value
        flag = "OK " if got == value else "MISMATCH"
        print(f"{flag} {sheet}!{coord:6} {label}: {got} {note}")
    if problems:
        print("\n===== Needs attention =====")
        for p in problems:
            print(" - " + p)
    if extra:
        print("\n===== Other blank rows on Radio Details (check / fill or mark TBC) =====")
        for e in extra:
            print(" - " + e)
    if not has_vba:
        print("\nNote: the template has no macros, so it was saved as .xlsx "
              "(an .xlsm with no macros would make Excel complain).")


if __name__ == "__main__":
    main()
