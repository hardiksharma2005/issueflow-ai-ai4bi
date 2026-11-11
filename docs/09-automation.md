# 9. Automatic daily checks

The tool runs four checks by itself, so nothing is forgotten. Think of them as an assistant who goes through the list every morning.

## The four checks

| Check | When (India time) | What it looks for |
|---|---|---|
| **Daily overdue check** | Every day, around 12:30 pm | Problems past their due date that aren't finished, with who owns each one and how many days late it is |
| **Stale issue check** | Every day, around 1:00 pm | Problems that nobody has touched for 7 days or more |
| **Weekly project summary** | Every Monday, around 1:30 pm | For each project: how many problems are open, in progress, blocked, in review, new this week and fixed this week |
| **Import failure check** | Every day, around 2:30 pm | WhatsApp uploads that failed in the last 24 hours, and why |

Times can vary by up to an hour, because of the free plan.

## What the checks do, and don't do

- They **only look and report**. They never change a problem, its owner or its progress.
- Results are saved on the **Automations** page, where the admin can open each run and see the details.
- **They don't send emails or WhatsApp messages yet.** Results are visible inside the tool.

## Reminders you see straight away

Separately from the daily checks, the tool always shows live reminders, updated every time you open a page:

- the **bell icon** shows your overdue problems, uploads waiting for review, and failed uploads
- the **dashboard** shows "Needs attention" (critical or overdue problems)
- **My Tasks** shows late items first

So even if a daily check hasn't run yet, you'll still see what's late.

## Controls for the admin

On the **Automations** page the admin can:

- see each check's schedule, when it last ran and whether it worked
- press **Run now** to run a check immediately
- **switch a check off** (and on again)
- open the record of past runs

## How it's kept safe

The daily "alarm clock" (a Vercel feature) wakes the tool using a **secret password**. Anyone else who tries to trigger the checks is turned away. We tested this: without the password the request is refused; with it, the check runs and is recorded.
