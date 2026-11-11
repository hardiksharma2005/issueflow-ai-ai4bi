# 8. How the tool was put online

"Deployment" simply means **putting the tool on the internet** so anyone with the link and an account can use it.

**The tool is live at https://issueflow-ai-ai4bi.vercel.app** (since 11 November 2026).

## The services involved

| Service | Its job | Cost |
|---|---|---|
| **GitHub** | Keeps the code safe, with a history of every change | Free |
| **Vercel** | Runs the website and puts updates online automatically | Free plan |
| **Supabase** | Stores the information, user accounts and files | Free plan |
| **Groq** | The AI that reads chats | Free plan |

## How it was set up, step by step

1. **Created the store room (Supabase).** A new free project was set up in the Sydney region. We copied its address and keys into a private settings file on the developer's computer.
2. **Built the cabinets.** One command created all the cabinets, rules and the locked file area (see [document 3](03-database-design.md)).
3. **Added practice data.** Another command created the five practice accounts, three made-up clients and 24 sample problems.
4. **Saved the code to GitHub**, after checking that no secret keys were included.
5. **Connected GitHub to Vercel.** On Vercel's website we chose "Import" and picked the GitHub project.
6. **Gave Vercel its settings.** The store-room address, the keys and the AI key were typed into Vercel's private settings page. Secret ones are marked "Sensitive" so nobody can read them back.
7. **Pressed Deploy.** About two minutes later the tool was live.
8. **Told the store room about the new address**, so password-reset emails link to the live site and not to the developer's computer.
9. **Tested everything on the live site** (see [document 10](10-testing.md)).

## Making it fast

At first, pages took about **2 seconds** to open. We found the reason: the website was running in **America** while the store room is in **Australia**, so every request crossed the Pacific Ocean several times.

We moved the website to **Sydney**, right next to the store room. Now pages open in **about half a second to one second**:

| | Before | After |
|---|---|---|
| A normal page | 1.5 – 2.4 seconds | 0.5 – 1.0 seconds |
| Signing in | 4.3 seconds | 2.7 seconds |

The remaining time is mostly the distance between India and Australia. If we ever want it faster still, the store room could be moved to a Mumbai location.

## How updates happen

Whenever the developer saves an improvement to GitHub, **Vercel notices, rebuilds the tool and replaces the live version within about a minute**, with no downtime. If something goes wrong, Vercel keeps every earlier version, and going back takes one click.

## Things to know about the free plans

- **Supabase** pauses a free project that hasn't been used for about a week. If that happens, the tool shows an error until someone presses "Resume" in Supabase. Using the tool regularly prevents this.
- **Groq** limits how much text the AI can read per minute; very long chats take longer.
- **Vercel** runs each automatic check once a day, at roughly the scheduled time (it can be up to an hour late).
- Password-reset emails use Supabase's built-in email sender, which only allows a few emails per hour. For everyday use by a larger team, a proper email service should be connected.

## Before real client data goes in

- [ ] Remove the practice accounts and practice projects
- [ ] Decide whether strangers may sign up, or switch to invitation only
- [ ] Connect a proper email service for password resets
- [ ] Make sure the right person creates the first real admin account
