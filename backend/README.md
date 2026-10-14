# Registration & payment backend (Google Sheets)

The website saves every registration to a **Google Sheet that you own**, through a small
**Google Apps Script web app** (`apps-script/Code.gs`). No secrets are stored in the website:
the script runs as you, and the site only knows its public web-app address.

## One-time setup (about 10 minutes)

1. Create a new Google Sheet (name it e.g. *FutureMakers registrations*), signed in as the account that will own the data.
2. In the sheet: **Extensions → Apps Script**. Delete the default code and paste the whole of
   `backend/apps-script/Code.gs`.
3. Click the ⚙ **Project Settings** → tick **Show "appsscript.json" manifest file**, open `appsscript.json`
   and paste in `backend/apps-script/appsscript.json` (sets the Lagos time zone and "run as me, anyone can call").
4. Pick the function **`setup`** in the toolbar and press **Run**. Approve the permissions
   (it only touches this spreadsheet). This creates the **Registrations** and **Confirmations**
   sheets, the status dropdown and the colours.
5. **Deploy → New deployment → type: Web app**. *Execute as:* **Me**. *Who has access:* **Anyone**. Deploy,
   approve, and copy the **Web app URL** (it ends in `/exec`).
6. In the website repo open `js/config.js` and paste the URL into `BACKEND.url`:
   ```js
   export const BACKEND = { url: 'https://script.google.com/macros/s/XXXX/exec', timeoutMs: 15000 };
   ```
   Commit and deploy the site. Until this is filled in, the form says plainly that online
   registration is not switched on and saves nothing.
7. Reload the sheet; a **FutureMakers** menu appears.

> If you later edit `Code.gs`, use **Deploy → Manage deployments → ✏ → New version** so the live URL
> picks up the change. If you change prices, change them in **both** `js/config.js` (`PRICES`) and
> `Code.gs` (`PRICES`); `npm test` fails if they differ.

## What gets stored

**Registrations** sheet, one row per registration (columns are found by their header name, so you can
reorder or add your own columns):

| Column | Notes |
|---|---|
| Registration reference | `FM-XXXXXX`, created by the browser, shown to the parent |
| Registration date | Lagos time |
| Parent/guardian name, Email, Contact number, Country | |
| Package, Workshop(s) | Both workshops are recorded for the bundle |
| Children, Age bands | |
| Currency, Amount per child, Amount owed | Recomputed by the script from its own price table |
| Payment method | "Bank transfer (OPay/Moniepoint)" for NGN, "Revolut.me" for GBP/USD |
| **Payment status** | `Pending` → `Payment submitted — awaiting verification` → `Paid` |
| Payment verification date, Verified by | Filled when you mark a row Paid |
| Confirmation submitted at, Amount paid (reported), Method used (reported), Transaction reference (reported) | From the website confirmation form |
| Confirmation channel opened | Notes when a parent opened the email/WhatsApp link (not proof anything was sent) |
| Notes (admin) | Yours |

**Confirmations** sheet: a log line for every confirmation-form submission.

## Seeing and managing registrations

Just open the sheet. Filter or sort as normal. Status cells are colour-coded
(red Pending, yellow submitted, green Paid). There is intentionally **no public way** to list
registrations: the web app can only create a registration, record a payment confirmation, or return the
status of *one* registration to someone who knows both its reference and email.

## Verifying a payment (the only way anything becomes "Paid")

1. Check the money has actually arrived in OPay / Moniepoint / Revolut, for the **exact amount owed**,
   and match it to the reference (in the transfer narration, the receipt email, or the WhatsApp message).
2. In the sheet select the row(s) and use **FutureMakers → Mark selected as PAID (after checking funds)**
   and confirm the prompt. This sets *Payment status = Paid*, stamps *Payment verification date* and
   *Verified by*. (Changing the dropdown by hand also stamps the date.)
3. Wrong or missing payment? Use **Mark selected as Pending** (clears the verification stamp).

Nothing on the website, email link, WhatsApp link or confirmation form can set `Paid`. The confirmation
form only moves a row from `Pending` to `Payment submitted — awaiting verification`, and never
downgrades a row you already marked Paid.

## Receipts / screenshots

Screenshots are **not uploaded to the website** (public uploads need virus scanning, size limits and
private storage that a static site cannot provide safely). Parents send receipts by email
(keneokonjo44@gmail.com) or WhatsApp (+234 7047167280) quoting their reference; you match them to
rows by hand.

## Protections built in

* amounts are recomputed server-side (a tampered browser cannot lower the price)
* the same reference + email is idempotent (retries never create duplicate rows); a clash with a
  different email makes the browser generate a new reference
* a hidden honeypot field and a limit of 5 registrations per email per 24 h
* a script lock so simultaneous registrations never overwrite each other
* all values are written as plain text, so nothing a visitor types can run as a spreadsheet formula
* the website shows payment details only for data that passes its own price check, and shows an error
  (never a success) when saving fails

## Limits / things to know

* Apps Script quotas apply (consumer accounts allow roughly 20,000 web-app calls a day; far more than needed).
* The spreadsheet is only updated when the parent's browser reaches the script. If they close the tab
  mid-request the registration may not exist; the site tells them honestly when saving failed.
* This was tested with the real `Code.gs` running against in-memory fakes of Google's services
  (`npm test`, `npm run test:e2e`). It has **not** been run against a live Google Sheet from this
  development environment: do a real test registration after deploying (step 8 below).

## Step 8: smoke-test after deploying

1. Visit the live site, register with your own email (NGN, then GBP).
2. Confirm a new `Pending` row appears with the right amount and reference.
3. Press *Tell us I've paid* in the window; the row should change to *Payment submitted — awaiting verification*.
4. Mark it Paid from the menu, then delete the test rows.
