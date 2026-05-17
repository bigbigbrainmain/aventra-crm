# Aventra CRM — Next Steps

## What this project is
A lightweight CRM for a 2-person UK web design agency. Tracks leads, proposals, and live customers. Built on:
- **Frontend:** React 18 + Vite + Tailwind CSS, hosted on Netlify
- **Backend:** Netlify serverless functions (Node.js)
- **Database:** Google Sheets (Leads Pipeline spreadsheet)
- **Email:** Resend API (`notifications@aventrasites.online`)
- **Auth:** Firebase
- **Proposals:** GitHub API (copies folders between repos)

## Repo structure
```
netlify/functions/    — All backend logic (serverless)
src/components/       — React UI components
src/utils/api.js      — Frontend API client (all fetch calls)
src/utils/constants.js — Shared constants (statuses, styles)
```

## Key files
| File | Purpose |
|------|---------|
| `netlify/functions/_sheets.js` | Google Sheets client + all row-to-object mappings |
| `netlify/functions/lead.js` | Single lead CRUD |
| `netlify/functions/leads.js` | Bulk lead fetch + create |
| `src/components/LeadDetail.jsx` | Lead detail panel (right sidebar) |
| `src/components/LeadsView.jsx` | Lead grid/list view |
| `src/components/Sidebar.jsx` | Navigation sidebar |
| `src/App.jsx` | Root app, view routing |

## Lead schema (Google Sheets "Leads Pipeline")
Columns A–R currently in use:

| Col | Field | Notes |
|-----|-------|-------|
| A | id | Auto-generated `L_` prefix |
| B | businessName | |
| C | industry | |
| D | city | |
| E | email | |
| F | phone | |
| G | website | |
| H | priority | 🔴 Priority 1 / 🟠 Priority 2 / 🟡 Priority 3 / 🟢 Skip |
| I | priorityReason | |
| J | status | New / Working / HOT / Proposal Requested / Booked / Lost / Qualified Out / Closed Won / NRTB / Incorrect Product Fit |
| K | datePitched | |
| L | notes | Inline quick note |
| M | subject | Outreach email subject |
| N | emailBody | Outreach email body |
| O | calendlyLinkSent | Yes / No |
| P | isFavourite | TRUE / FALSE |
| Q | proposalUrl | Live proposal URL |
| R | proposalFolder | GitHub folder name |

## Environment variables (Netlify)
```
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
RESEND_API_KEY
GH_TOKEN
PROPOSAL_WEBHOOK_SECRET
```

---

## Planned feature: Automated Lead Outreach

> This feature was designed in a chat session but NOT yet pushed to the repo.
> Use this section as the spec when ready to build and test.

### What it does
1. **AI generates a personalised cold email** for each lead using Claude Haiku, based on their business name, industry, city, and whether they have a website. Writes the result into the existing `subject` (col M) and `emailBody` (col N) fields.
2. **One-click send** via Resend. Emails look like plain personal messages — no marketing templates. Includes an unsubscribe link for compliance.
3. **Email open tracking** via Resend webhook. When a lead opens the email, their record is updated and their priority is auto-bumped to Priority 1.
4. **Day 3 follow-up** runs automatically at 9am every day via Netlify scheduled function. Sends one short follow-up to anyone who received the initial email 3+ days ago and hasn't opened it yet.
5. **Outreach Queue view** — new tab in the sidebar showing all leads with emails that haven't been contacted yet, with bulk "Generate all pitches" and per-lead send controls.

### New Google Sheets columns to add (S–W)
Before building, manually add these 5 column headers to the "Leads Pipeline" sheet:

| Col | Header | What it stores |
|-----|--------|---------------|
| S | outreachSentAt | ISO timestamp of first outreach email |
| T | outreachCount | Number of outreach emails sent (integer) |
| U | lastOutreachAt | ISO timestamp of most recent email |
| V | emailOpenedAt | ISO timestamp when lead opened the email |
| W | outreachOptedOut | "Yes" if they unsubscribed, blank otherwise |

### New environment variables needed
```
ANTHROPIC_API_KEY        — Claude API key (get from console.anthropic.com, top up $5)
OUTREACH_FROM            — Sending email address e.g. joe@aventrasites.online
OUTREACH_FROM_NAME       — Display name e.g. Joe
```

### New files to create
```
netlify/functions/generate-outreach.js     — POST {leadId} → AI generates subject+body, saves to sheet
netlify/functions/send-outreach.js         — POST {leadId} → sends email via Resend, updates S/T/U cols
netlify/functions/resend-webhook.js        — POST from Resend → handles email.opened / bounced / complained
netlify/functions/scheduled-followups.js   — Cron (9am daily) → sends Day 3 follow-ups
netlify/functions/outreach-unsubscribe.js  — GET ?id=LEAD_ID → sets col W to Yes, returns HTML page
src/components/OutreachView.jsx            — New Outreach tab: queue + bulk actions + sent tracker
```

### Files to modify
```
netlify/functions/_sheets.js   — Add cols S–W to rowToLead()
netlify/functions/lead.js      — Update read range from A2:R to A2:W
netlify/functions/leads.js     — Update read range from A2:R to A2:W
netlify.toml                   — Add cron schedule for scheduled-followups
src/utils/api.js               — Add generateOutreach() and sendOutreach() methods
src/components/LeadDetail.jsx  — Replace static "Outreach Email" section with interactive panel
src/components/Sidebar.jsx     — Add "Outreach" nav item
src/App.jsx                    — Import OutreachView, add view === 'outreach' render
```

### netlify.toml change
Add at the bottom:
```toml
[functions."scheduled-followups"]
  schedule = "0 9 * * *"
```

### Email open tracking — how to use it

When a lead opens the email, Resend fires a webhook, the CRM records the timestamp, and the lead is **automatically bumped to Priority 1**.

The strategic play: check the Outreach view each morning. Any lead showing "Opened" is warm — they read it, they're curious. **Call those leads the same day.** Someone who opened your email and then gets a call from Joe an hour later has a dramatically higher conversion rate than a cold call alone. This is the core of the multi-touch strategy.

### Resend setup (do before testing)
1. In Resend dashboard → Domains → verify `joe@aventrasites.online` (or whatever OUTREACH_FROM is set to) as a sender
2. In Resend dashboard → Webhooks → add endpoint: `https://YOUR-NETLIFY-URL/.netlify/functions/resend-webhook`
   - Enable events: `email.opened`, `email.bounced`, `email.complained`
3. In Resend dashboard → Settings → enable Open Tracking (injects tracking pixel automatically)

---

### Example emails (what Claude Haiku generates)

These are the kind of outputs to expect. Review a few after generating before sending in bulk.

---

**Plumber, Manchester, no website**
> Subject: `Quick question about your plumbing business`
>
> Hi,
>
> I was looking at plumbers in Manchester and noticed Elite Plumbing doesn't have a website yet — you're probably missing a fair few enquiries from people Googling for a plumber in a panic.
>
> I build websites for local trades businesses, gets you showing up on Google and looking professional. We've done a few plumbers actually.
>
> Worth a quick look? I can put a free mockup together this week.
>
> Joe
> Aventra

---

**Hair salon, Birmingham, has a website**
> Subject: `Noticed a couple of things on your site`
>
> Hi,
>
> Came across Bloom Hair in Birmingham — nice place. Had a couple of ideas that might help you pick up more bookings online, mainly around how you're showing up in local searches.
>
> Happy to put a quick breakdown together if you're interested, no charge.
>
> Joe
> Aventra

---

**Electrician, Leeds, no website**
> Subject: `Most electricians in Leeds aren't online`
>
> Hi,
>
> I was searching for electricians in Leeds and your name came up but you don't seem to have a website — which means anyone searching online is going to your competitors instead.
>
> We build trade websites from £499, all in. If you want to see what it could look like I'm happy to mock something up for free.
>
> Joe
> Aventra

---

**Restaurant, Bristol, has a website**
> Subject: `Your restaurant and Google`
>
> Hi,
>
> Found The Copper Pot while looking at Bristol restaurants — the food looks great but your site isn't really doing you justice and you're barely showing up in local searches.
>
> I help local restaurants fix exactly this. If you want I can send over a few specific ideas, takes me five minutes.
>
> Joe
> Aventra

---

**What makes these work:**
- Subject lines are curiosity-driven, not salesy — no exclamation marks, no "FREE!!!"
- Body is 3–4 sentences max — shorter than feels right, which is exactly right
- Always references their specific trade and city — never feels generic
- The ask is tiny: a free mockup, not "buy now"
- Signs off as a person, not a company
- The "no website" angle performs better — it's a more obvious pain point

---

### Expected conversion rates

Based on B2B cold outreach benchmarks. AI-personalised emails get 2–3x higher reply rates than generic templates.

**Email only**

| Emails/day | Monthly | Opens (30%) | Replies (4%) | Sales (20% close) | Revenue |
|---|---|---|---|---|---|
| 10 | 220 | 66 | 9 | ~2 | ~£1,000 |
| 25 | 550 | 165 | 22 | ~4 | ~£2,000 |
| 50 | 1,100 | 330 | 44 | ~9 | ~£4,500 |

**Calling only**

| Calls/day | Monthly | Answered (22%) | Interested (12%) | Sales (25% close) | Revenue |
|---|---|---|---|---|---|
| 10 | 220 | 48 | 6 | ~1–2 | ~£750 |
| 25 | 550 | 121 | 15 | ~3–4 | ~£1,750 |
| 50 | 1,100 | 242 | 29 | ~7 | ~£3,500 |

**Combined (email + call same leads) — multi-touch roughly doubles conversion**

| Contacts/day | Monthly | Expected sales | Revenue | Recurring (£35/mo/client) |
|---|---|---|---|---|
| 10 of each | 440 | 4–6 | ~£2,500 | +£175/mo per month |
| 25 of each | 1,100 | 10–15 | ~£6,000 | +£438/mo per month |
| 50 of each | 2,200 | 20–28 | ~£12,000 | +£875/mo per month |

The recurring column compounds — by month 6 at 25/day you'd have £2,500+/month in recurring revenue on top of new sales.

**Caveats:** Lead quality matters. Scraped Google Maps data outperforms bought lists. First 2 weeks will be lower while scripts are tuned.

---

## Test checklist (run through before going live)

### 1. AI email generation
- [ ] Open any lead that has industry + city filled in
- [ ] Click "Generate AI Pitch" — should take 2–4 seconds
- [ ] Check the generated subject and body look personal and relevant (not generic)
- [ ] Try on a lead with a website URL — angle should differ from one without
- [ ] Check the subject and body saved to cols M and N in the Google Sheet

### 2. Send outreach email
- [ ] Add YOUR OWN email address to a test lead
- [ ] Generate a pitch first (step 1)
- [ ] Click "Send Outreach" — confirm the prompt, should send within 2 seconds
- [ ] Check your inbox — email should arrive from `joe@aventrasites.online`
- [ ] Check it looks like a plain personal email (no design, no logo)
- [ ] Check the unsubscribe link at the bottom works and shows the confirmation page
- [ ] Check cols S, T, U updated in the Google Sheet

### 3. Open tracking
- [ ] Open the email you received in step 2
- [ ] Wait 30–60 seconds, then refresh the lead in the CRM
- [ ] Col V (emailOpenedAt) should now have a timestamp
- [ ] If the lead was Priority 2 or 3, it should have bumped to Priority 1

### 4. Unsubscribe
- [ ] Click the unsubscribe link in the test email
- [ ] Should see "You've been unsubscribed" confirmation page
- [ ] Check col W is now "Yes" in the sheet
- [ ] Try clicking "Send Outreach" again — should be blocked with "Lead has opted out"

### 5. Day 3 follow-up (cron)
- [ ] Manually call `POST /.netlify/functions/scheduled-followups` (via curl or Postman)
- [ ] With a test lead where outreachSentAt is 3+ days ago and outreachCount = 1
- [ ] Check a follow-up email arrives in your inbox
- [ ] Check outreachCount incremented to 2 in the sheet

### 6. Outreach Queue view
- [ ] Click "Outreach" in the sidebar
- [ ] Should show all leads with emails that haven't been contacted
- [ ] "Generate all pitches" should process each lead and show progress
- [ ] Per-lead Generate + Send buttons should work same as in LeadDetail
- [ ] "Sent" tab should show leads that have had outreach, with open status badges

### 7. Edge cases
- [ ] Lead with no email — Send button should not appear, prompt to add email
- [ ] Lead with opted-out status — should show "Opted out" badge, no send button
- [ ] Lead with no subject/body — clicking Send should return "Generate an AI pitch first"

---

## Deliverability notes (important for cold email)
- Send from a subdomain if possible (e.g. `outreach@mail.aventrasites.online`) rather than your main domain — protects your main domain reputation
- Start slow: 10 emails/day for the first week, then ramp up
- The automated follow-up only sends ONE follow-up (Day 3). After that, no more automated emails — keeps it human
- Resend handles SPF/DKIM automatically for verified domains

---

## Planned feature: Automated Voice Calling

> To be built after email outreach is tested and working.

### The problem it solves
The sales guy isn't calling enough leads. This automates outbound calls so prospects are contacted even when nobody has time to pick up the phone.

---

### All approaches considered

#### Option A — Managed service (Vapi / Bland.ai)
Fully managed AI calling platform. You configure a voice agent via a dashboard, give it a script, and it handles everything.

| | |
|---|---|
| Cost | ~$0.10–0.15/min all-in |
| Setup time | 1–2 hours |
| Latency | ~500ms (good) |
| Voice cloning | Yes (ElevenLabs built in) |
| Pros | Easiest by far. Built-in call recording, transcripts, webhooks |
| Cons | Ongoing cost. Less control. Dependent on their platform |

#### Option B — Semi-DIY (Twilio + OpenAI Realtime API)
Twilio handles the phone call, OpenAI's Realtime API handles the voice conversation end-to-end (STT + LLM + TTS in one stream).

| | |
|---|---|
| Cost | ~$0.08–0.12/min |
| Setup time | 1–2 days |
| Latency | ~600ms |
| Voice cloning | No (uses OpenAI voices) |
| Pros | Much simpler than full DIY. OpenAI Realtime is well documented |
| Cons | Still costs per minute. Locked to OpenAI voices |

#### Option C — Full DIY (Twilio + Groq + Deepgram + Google TTS) ✅ Recommended
Each component is separate and swappable. Free tiers cover low volumes.

| | |
|---|---|
| Cost | ~£0.02–0.04/min (just Twilio + Deepgram) |
| Setup time | 3–5 days |
| Latency | ~700–900ms (acceptable) |
| Voice cloning | Optional via ElevenLabs add-on later |
| Pros | Cheapest by far. Full control. Groq is free. Google TTS free tier covers thousands of calls |
| Cons | More moving parts. Needs a persistent WebSocket server (not Netlify) |

#### Option D — Simple voicemail drop (Slybroadcast / Drop Cowboy)
Sends a pre-recorded or TTS-generated audio message directly to voicemail without the phone ringing. No AI conversation.

| | |
|---|---|
| Cost | ~$0.05/drop |
| Setup time | A few hours |
| Latency | N/A (not real-time) |
| Pros | Extremely simple. No server needed. Feels personal if voice is good |
| Cons | One-way only. No conversation. Not all carriers support it |

---

### Chosen approach: Option C (Full DIY)

**Why:** Cheapest to run long-term. At low volumes (20–30 calls/day) the cost is under £1/day. If it proves its worth, swapping in voice cloning or a faster TTS is straightforward.

---

### How a call works (flow)

```
CRM "Call" button clicked
        ↓
Netlify function triggers Twilio outbound call to lead's phone
        ↓
Lead answers → Twilio connects to WebSocket server (Railway)
        ↓
Lead speaks → Twilio streams audio to server
        ↓
Audio → Deepgram Nova-2 (speech-to-text) → text
        ↓
Text → Groq LLM (llama-3.3-70b) → response text
        ↓
Response → Google Cloud TTS → audio
        ↓
Audio → back to Twilio → plays to lead
        ↓
Loop until call ends
        ↓
Call outcome saved to CRM (lead sheet + recording URL)
```

---

### AI caller script / persona

Joe. Casual, direct, friendly. Not salesy. Short sentences. Sounds like he picked up the phone and called on a whim.

The LLM should be given the lead's business name, industry, city, and whether they have a website — and instructed to respond naturally based on what the person says, not follow a rigid script.

---

**Branch A — Lead has no website**

Opening:
> "Hey, is that [businessName]? ... Hi, this is Joe, I run a little web design company — I was just looking at [industry] businesses in [city] and noticed you guys don't have a website. Is there a reason for that?"

If curious / open:
> "Yeah totally makes sense. Look I won't keep you long — I basically build websites for local businesses, get you showing up on Google, the whole lot. We've done a few [industry] businesses actually. What if I just put a quick mockup together for you so you can see what it'd look like? Completely free, no strings."

If they ask how much:
> "We do them from £499 all in, and then it's £35 a month after that for hosting and keeping it updated. But honestly the best way is just to see it first — I can have something over to you this week. What's your email?"

If not interested:
> "No worries at all, sorry to bug you. If you ever change your mind just Google Aventra. Take care."

---

**Branch B — Lead has a website**

Opening:
> "Hey, is that [businessName]? ... Hi, this is Joe — I run a web design company. I came across your website and had a couple of ideas that might help you pick up more local work. Got two minutes?"

If open:
> "So basically the main thing I noticed is you're not really showing up when people search for [industry] in [city] — which means you're probably missing a fair few enquiries. We fix that kind of thing, get the site ranking properly, make it convert better. We've done it for a few local businesses. Worth a quick look if I put something together?"

If not interested:
> "No worries at all. Good luck with it."

---

**If voicemail:**
> "Hey, this is Joe from Aventra — I do websites for local businesses. I was looking at [businessName] and had a couple of ideas — I'll drop you an email as well. No rush, no pressure. Cheers."

---

**LLM system prompt (give to Groq):**
```
You are Joe, a friendly and straight-talking UK web designer. You're calling [businessName], 
a [industry] business in [city]. [They don't have a website / They have a website at [url]].

Keep responses short — 1-3 sentences max. Sound like a real person on the phone, not a 
salesperson. Be casual and genuine. If they're not interested, end the call warmly and quickly.
If they're interested, your goal is to get their email address to send a free mockup.
Never be pushy. If they ask if you're a real person, say yes — you're Joe.

Lead info: [inject full lead object here]
```

---

### Stack and costs

| Component | Service | Cost |
|-----------|---------|------|
| Phone calls | Twilio | ~£0.013/min outbound UK |
| Speech-to-text | Deepgram Nova-2 | ~$0.004/min |
| LLM | Groq (llama-3.3-70b) | Free tier / very cheap |
| Text-to-speech | Google Cloud TTS Neural2 | Free up to 1M chars/month |
| WebSocket server | Railway | Free tier (500hrs/month) |
| **Total per 2-min call** | | **~£0.03** |

100 calls/month ≈ **£3**. One website sale pays for years of this.

---

### Voice quality options

Google Cloud TTS has three tiers. Pick Neural2 as the default:

| Voice tier | Quality | Cost | Recommended |
|---|---|---|---|
| Standard | Slightly robotic — avoid | Free 4M chars/month | No |
| Neural2 | Natural, sounds human | Free 1M chars/month | ✅ Yes |
| ElevenLabs (Joe's actual voice) | Indistinguishable from real Joe | £17/month + record 1 min of audio | Optional upgrade |

Use `en-GB-Neural2-D` for a natural-sounding British male voice. At 50 calls/day averaging 200 words of AI speech, you'll use ~220k chars/month — well within the 1M free tier.

To add voice cloning later: swap the `tts.js` module to call ElevenLabs API instead of Google. No other changes needed.

---

### New environment variables needed

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER         — Your Twilio UK number
DEEPGRAM_API_KEY            — From deepgram.com (free trial credit)
GROQ_API_KEY                — From console.groq.com (free tier)
GOOGLE_TTS_API_KEY          — From Google Cloud Console (free tier)
VOICE_SERVER_URL            — Your Railway WebSocket server URL
```

---

### New Google Sheets columns (append after W)

| Col | Field | What it stores |
|-----|-------|---------------|
| X | lastCallAt | ISO timestamp of most recent call |
| Y | callCount | Number of calls made |
| Z | callOutcome | Interested / Not Interested / No Answer / Voicemail / Callback Requested |
| AA | callRecordingUrl | Twilio recording URL for review |

---

### New files to create

```
voice-server/                      — Separate Node.js project, deployed to Railway
  index.js                         — WebSocket server + conversation loop
  tts.js                           — Google TTS helper
  stt.js                           — Deepgram streaming STT helper
  llm.js                           — Groq conversation helper

netlify/functions/trigger-call.js  — POST {leadId} → triggers Twilio outbound call
netlify/functions/call-status.js   — POST from Twilio → saves call outcome to sheet
```

### Files to modify

```
netlify/functions/_sheets.js        — Add cols X–AA to rowToLead()
netlify/functions/lead.js           — Update read range to A2:AA
netlify/functions/leads.js          — Update read range to A2:AA
src/utils/api.js                    — Add triggerCall(leadId) method
src/components/LeadDetail.jsx       — Add "Call" button + call history
src/components/OutreachView.jsx     — Add "Call" button per lead in queue
```

---

### Test checklist (voice calling)

- [ ] Twilio account set up with a UK phone number
- [ ] Railway WebSocket server deployed and reachable
- [ ] Call yourself — hear the AI opening message
- [ ] Have a short conversation — check responses are relevant and latency is acceptable
- [ ] Say "not interested" — confirm call ends gracefully
- [ ] Let it go to voicemail — confirm voicemail message plays correctly
- [ ] Check call outcome saved to cols X–Z in the sheet
- [ ] Check recording URL in col AA is accessible
- [ ] Trigger a call from the CRM "Call" button on a test lead
- [ ] Check call history shows in LeadDetail after the call
