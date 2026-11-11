# 2. How it fits together

The tool is made of **four building blocks**. You don't need to know how each one works inside, only what job it does.

```
        You, in your web browser
        (Chrome, Edge, Safari…)
                 │
                 ▼
   ┌───────────────────────────┐        ┌──────────────────────────────┐
   │ 1. THE WEBSITE            │───────▶│ 2. THE STORE ROOM            │
   │    (on a service called   │        │    (a service called         │
   │    Vercel)                │        │    Supabase)                 │
   │    What you see and click │        │    • all the information     │
   └─────────────┬─────────────┘        │    • usernames & passwords   │
                 │                      │    • uploaded chats & photos │
                 ▼                      └──────────────────────────────┘
   ┌───────────────────────────┐
   │ 3. THE AI HELPER (Groq)   │   4. THE ALARM CLOCK (Vercel Cron)
   │    Reads chats and        │      Wakes the tool up every day
   │    suggests problems      │      to run its checks
   └───────────────────────────┘
```

## The four blocks, compared to a small office

| Block | Name | Like… | What it does |
|---|---|---|---|
| 1 | **The website** (Vercel) | The front desk | Shows the pages, takes your clicks, and passes requests to the right place. Every time we improve the tool, Vercel puts the new version online automatically within about a minute. |
| 2 | **The store room** (Supabase) | A locked filing room with a guard | Keeps every project, problem, comment, user account and uploaded file. The guard checks every request: *"Is this person allowed to see this?"* |
| 3 | **The AI helper** (Groq) | A fast junior assistant | Reads a WhatsApp chat and writes suggested notes. Only used when a manager clicks *Process with AI*. |
| 4 | **The alarm clock** (Vercel Cron) | A daily reminder | Wakes the tool each day to look for late or forgotten problems. |

The website and the store room are both in **Sydney, Australia**, next to each other. That keeps the tool quick: when they were in different continents, every page took twice as long.

## What happens when you open a page

1. Your browser asks the website for, say, the list of problems.
2. The website checks you are signed in.
3. It asks the store room for the problems, **on your behalf**.
4. The store room's guard returns only the problems from your projects.
5. The website arranges them neatly on the page.

The important part is step 4. Even if the website had a mistake in it, the store room would still refuse to hand over another project's information.

## What happens when a chat is uploaded

1. A manager chooses a project and the chat file.
2. The file goes straight into the locked store room.
3. The website opens it, splits it into separate messages, and pairs each photo with the message it was sent with.
4. The manager clicks **Process with AI**. The messages, without photos and without any personal account details, are sent to the AI helper.
5. The AI helper replies with suggested problems.
6. The website **double-checks the AI's work** (see [document 5](05-ai-integration.md)) and saves the suggestions as *drafts*.
7. The manager approves, edits or rejects each draft. Approved drafts become real issues.

## Where the "keys" are kept

Some parts of the system need secret passwords to talk to each other, for example the website's key to the store room or our key for the AI service. These are kept **only on the website's server**, never sent to anyone's browser, and never saved in the shared code. Think of it as the office keeping the master key in a safe, not handing it to visitors.

## Where the code lives

- **GitHub** holds the code, like a shared drive with a full history of every change.
- When a change is saved to GitHub, **Vercel notices and puts the new version online by itself**.
- The project is at github.com/hardiksharma2005/issueflow-ai-ai4bi.
