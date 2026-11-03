# EMC Technologies Form 005: Mr Sparky Smoke Alert 4G

Run this on the PC, not in a cloud session.

1. Download `Form 005 Customer and EUT Information.xltm` (Google Drive, or Aakash Patel's
   email "Inquiry for testing at EMC Technologies") to your Downloads folder.
2. Open `fill_form005.py` and set `ADDRESS` (and `ANTENNA_GAIN` if you know it).
3. Run:
   ```
   pip install openpyxl
   python fill_form005.py --dump      # optional: print the form's labels first
   python fill_form005.py             # or: python fill_form005.py "C:\path\to\form.xltm"
   ```
4. The filled copy is saved next to the template as `Form 005 - Mr Sparky Smoke Alert 4G`.
   The script reads the file back and prints each filled cell, plus anything that still
   needs attention (labels not found, dropdown text mismatches, extra Radio Details rows).

The template contains no macros, so the output is `.xlsx`. Saving it as `.xlsm` without macros
makes Excel report an invalid format.

Only the Device Details and Radio Details tabs are filled. Sections 7-14 are left blank.

## Reply email (draft only, do not send)
To: aakash@emctech.com.au, CC: tracy@emctech.com.au
Subject: RE: Inquiry for testing at EMC Technologies
Attach: the filled form and `Smoke_Alert_4G_Prototype_Design.pdf`

Hi Aakash,

Thanks for getting back to me. Please find attached the completed Form 005 and a design
drawing of the prototype.

We're at the prototype stage, so we'd like to start with a pre-compliance session at your
Seven Hills lab, followed by a quote for full RCM testing. It would also help to know:
1. Whether the existing RCM certification of the A7670SA module reduces the testing needed.
2. Whether TEL-CRT (S042) testing is required or covered by the module.
3. How much the testing would reduce for an extra-low-voltage-only version powered by an
   approved plug pack, with a dry-contact input only.

Kind regards,
Steven Sukar
Mr Sparky Electrical Services Pty Ltd
0414 525 740
