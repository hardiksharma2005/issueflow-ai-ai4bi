# 11. How it was built, step by step

This is the story of how IssueFlow AI went from an empty folder to a working tool on the internet, one step at a time. Each step explains **what we did** and **why**.

---

### Step 1 — Writing down what we needed
**What:** We listed what the tool must do: read WhatsApp chats, suggest problems with proof, let a person approve them, keep a shared list, show charts and reports, run daily checks, and keep data safe.
**Why:** A clear list keeps the work focused, and lets us check at the end that everything was done.

### Step 2 — Preparing the workshop
**What:** We set up the computer with the tools needed to build a website, and created an empty project from a standard starting template.
**Why:** Like a carpenter setting up a workbench before building furniture.

### Step 3 — Designing the filing cabinets first
**What:** Before any screens, we designed where every piece of information is kept (see [document 3](03-database-design.md)) and wrote the safety rules: who may see and change what.
**Why:** Putting the rules **in the store room itself** means they protect the data even if a screen has a mistake. It is like fitting the locks before moving the furniture in.

### Step 4 — Teaching the tool to read WhatsApp chats
**What:** We wrote the part that splits a WhatsApp file into separate messages, understands different phones' date styles, spots WhatsApp's own notes ("X added Y"), and pairs photos with messages.
**Why:** Chats from Android phones and iPhones look different. We tested each style before moving on.

### Step 5 — Connecting the AI, with safety checks
**What:** We wrote the instructions for the AI (find real problems, group follow-ups, never invent anything, ignore orders inside the chat) and the checks that test its answers (see [document 5](05-ai-integration.md)).
**Why:** AI can be wrong. We decided early that the AI only *suggests*, the tool *checks*, and a person *decides*.

### Step 6 — A free practice mode
**What:** We built a simple rule-based "pretend AI" that works without any AI service and labels everything *Simulated*.
**Why:** So the tool can be shown and tested for free, and nobody mistakes practice results for real AI.

### Step 7 — Building the screens
**What:** Sign-in pages, the dashboard, project pages, the problem list and board, the problem detail page, My Tasks, the upload screens, the review screen, reports, automations, team and settings (see [document 6](06-frontend-development.md)).
**Why:** These are what people actually use, so we kept them clean, readable and usable on phones.

### Step 8 — Practice data
**What:** A made-up WhatsApp chat with 7 hidden problems (and one trick message), sample photos, five practice accounts, three made-up clients and 24 sample problems.
**Why:** So everyone can try the tool safely, without real client information.

### Step 9 — Connecting the real store room
**What:** We created the free Supabase store room, built the cabinets in it, and loaded the practice data.
**Why:** Up to here, parts were tested separately. Now everything worked together for the first time, and this revealed small setup problems, which we fixed.

### Step 10 — Testing like a real user
**What:** A robot opened the tool in a browser and clicked through every page as admin, manager and member, on a computer and on a phone (see [document 10](10-testing.md)).
**Why:** It found real problems, such as pages too wide for phones and forms that erased what you typed. All were fixed.

### Step 11 — Writing the documents
**What:** We wrote these documents, checking each statement against the actual tool.
**Why:** While writing about safety we re-checked every protection, and found and closed one gap: a sign-in link that could have been misused.

### Step 12 — Making it reliable
**What:** We made the tool cope with brief internet hiccups: retrying safely, and showing "please try again" instead of wrongly signing people out.
**Why:** Repeated testing showed the connection to Australia occasionally drops for a moment.

### Step 13 — Switching to the free Groq AI
**What:** We connected Groq's free AI and tested it on the practice chat: it found all 7 problems in about 16 seconds.
**Why:** It gives real AI results at no cost. Its limits (words only, a limited amount per minute) are handled by reading long chats in portions.

### Step 14 — Putting it online
**What:** We saved the code to GitHub, connected it to Vercel, entered the settings, and published it (see [document 8](08-deployment.md)).
**Why:** So the team can use it from any computer or phone, with no installation.

### Step 15 — Testing the live site and speeding it up
**What:** We ran the full robot test on the live site. We found times showing in UK time instead of India time and fixed that, and made pages about **twice as fast** by moving the website next to the store room.
**Why:** The live site can behave differently from the developer's computer, so it needs its own testing.

### Step 16 — Final touches
**What:** Renamed the practice accounts to AI4BI Admin, AI4BI Manager and AI4BI Member 1–3, and rewrote all documents in plain language.
**Why:** So the team can recognise the roles at a glance and understand the documents without technical knowledge.

---

## Where we are now

- The tool is **live** and **fully tested**.
- It uses **free services** throughout.
- It contains **practice data**, ready for a demonstration.

## Sensible next steps

1. Show it to the team (see the [demo guide](12-demo-script.md)) and collect feedback.
2. Try it with one **real** WhatsApp chat from a client, with permission.
3. Before real use: remove practice data, connect a proper email service, and decide who may create accounts.
4. Possible additions: email or WhatsApp reminders, reading photos (needs the paid AI), and a second sign-in step for extra security.
