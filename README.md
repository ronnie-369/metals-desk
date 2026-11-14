# Metals Desk

Gold and silver ETF tracker for retail readers. One static page plus one Vercel function.

```
metals-desk/
  index.html      the page (edit watch levels in the ETFS block at the top of the script)
  api/quotes.js   Vercel serverless function: Yahoo Finance prices + AMFI fund values, cached 15 min
  README.md
```

## Deploy

```
cd ~/Claude/Projects/metals-desk
git init
git add .
git commit -m "Metals Desk v2: retail tracker with live quotes function"
gh repo create metals-desk --public --source=. --push
vercel --prod
```

Vercel detects `api/quotes.js` automatically. No build step, no environment variables.

## Data

- Prices: Yahoo Finance chart API for GOLDBEES.NS, SILVERBEES.NS, GC=F, SI=F, INR=X. Delayed up to 15 minutes.
- Fund value: AMFI NAVAll.txt, published after each trading day. The premium check compares the ETF close on the NAV date with that NAV.
- The function returns partial data if a source fails and lists the failures in `errors`; the page shows them in a notice.

## Change the watch levels

In `index.html`, the `ETFS` object near the top of the script holds `levels`, `buyBelow` and `sellAbove` per ETF. Edit, commit, push. Vercel redeploys.
