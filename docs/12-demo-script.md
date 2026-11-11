# 12. Demo guide

A click-by-click guide for showing IssueFlow AI to others. It takes about **10 minutes**.

**Before you start:**
- Open **https://issueflow-ai-ai4bi.vercel.app** in two windows: a normal one, and a private/incognito one (so you can be signed in as two different people at once).
- Have the practice password ready.

> **Important:** the WhatsApp upload in Part 3 can only be done **once**, because the tool blocks uploading the same chat twice. If it has already been done, ask the developer to reset the practice data before the next demo, or simply show the finished upload.

---

## Part 1 — The problem (1 minute)

Say something like:
> "Our clients report problems in WhatsApp groups. After a few days there are hundreds of messages, with greetings, thank-yous and photos mixed in with the real problems. Making a list by hand is slow, and things get missed."

## Part 2 — The dashboard (1 minute)

1. In the first window, sign in as **manager@issueflow.example**.
2. Point out the **greeting** ("Good to see you, AI4BI Manager") and the **number tiles**: open, overdue, critical.
3. Point to the **charts**. Click the small **table icon** on a chart to show the exact numbers.
4. Point to **Needs attention**, the critical and overdue problems.

## Part 3 — Uploading a WhatsApp chat (3 minutes)

1. Click **Imports** in the left menu, then **New import**.
2. Under **Project**, choose **BLOOM · Bloom Retail — Online Store**.
3. Click **Use sample WhatsApp data**. Two files appear with green ticks: the chat with its photos, and one extra screenshot.
4. Click **Upload & extract messages** and wait a few seconds.
5. Point out:
   - **Messages: 37, Participants: 5, Media files: 4**
   - **Import notes:** one photo was left out by WhatsApp, and one mentioned file wasn't included. *"The tool tells you; it never guesses."*
   - Scroll down to the **conversation**: photos sit next to the messages they were sent with.
6. Scroll back up and click **Process with AI**. After about 15 seconds, the suggestions appear.

## Part 4 — Checking the AI's suggestions (3 minutes)

1. Say: *"The AI found 7 real problems among 37 messages. None of these is on our list yet; a person decides."*
2. On the **payment** suggestion, click **source messages** to show the original WhatsApp messages it came from, from several people.
3. Find the suggestion about **search showing out-of-stock products**. Point to the yellow box: **"This may already be tracked: BLOOM-7"**. Under *Link to an existing issue*, choose **BLOOM-7** and click the link button. *"No duplicate is created; the new messages are added to the existing problem."*
4. On the **payment** suggestion: change the title if you like, set **Assignee: AI4BI Member 2**, choose a due date, and click **Approve**. It becomes a real problem, **BLOOM-11**.
5. On the **courier delay** suggestion, click **Reject**.
6. Point out what's **missing**: *"One message in the chat tried to trick the AI into making someone an admin. It was ignored."*

## Part 5 — Working on a problem (1 minute)

1. Click **All Issues**, then open **BLOOM-11**. Show the details, the linked WhatsApp messages, the photo and the history.
2. Type a comment and click **Comment**.
3. Switch to **Board** (top right) and **drag a card** to *In Progress*.

## Part 6 — Who can see what (1 minute)

1. In the private window, sign in as **member@issueflow.example** (AI4BI Member 1).
2. Show that **Bloom Retail doesn't appear anywhere**, not even in search. *"Each person only sees their own projects."*
3. Click **Imports → New import**: *"You can't import into any project."* Only managers handle uploads.
4. Open **My Tasks**, then any task: the member can change its **progress**, but urgency and owner are locked.

## Part 7 — Reports and daily checks (1 minute)

1. In the first window, sign out and sign in as **admin@issueflow.example** (AI4BI Admin).
2. **Reports → Open issues → Export CSV**: a file opens in Excel.
3. **Automations:** show the four daily checks, and click **Run now** on *Daily overdue check*.
4. **Settings:** scroll down to show the **activity record**, which only the admin sees.

## Closing message

> "The AI does the reading, a person makes every decision, every problem keeps its proof, and each person only sees what they should. It runs on free services, and it's live today."

## Questions people often ask

| Question | Answer |
|---|---|
| Does it read our WhatsApp automatically? | No. Someone exports the chat and uploads it. It can't access anyone's phone. |
| Can the AI make mistakes? | Yes, which is why nothing is added without a person approving it, and every suggestion shows its proof. |
| Does it look at the photos? | It saves and links them, but the free AI doesn't look inside them. A paid option can. |
| Is client data safe? | Each person only sees their own projects. This is enforced in the store room itself and tested. Secret keys are never shown to anyone. |
| What does it cost? | Currently nothing: all services are on free plans. |
| Does it send reminders? | Inside the tool, yes. Email or WhatsApp reminders could be added later. |
