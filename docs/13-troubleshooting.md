# 13. Help with common problems

Find your situation in the left column. If none of these help, contact the person who looks after the tool.

## Signing in

| What you see | What it means | What to do |
|---|---|---|
| "Invalid email or password" | The email or password is wrong | Check for typing mistakes and Caps Lock. Use **Forgot password?** if needed. |
| I signed in but see no projects | You haven't been added to any project yet | Ask an admin or manager to add you to a project. |
| The password-reset email doesn't arrive | The free email service only sends a few emails per hour, or it went to spam | Check your spam folder. Wait an hour and try again, or ask an admin for help. |
| The reset link says "invalid or expired" | Each link works once, for a limited time | Request a new link. |

## Using the tool

| What you see | What it means | What to do |
|---|---|---|
| "Something went wrong — the page could not be loaded", or "Could not reach the database. Please try again." | A brief internet hiccup, or the free store room has been paused after a quiet week | Click **Try again**. If it keeps happening, ask the admin to check that Supabase is running ("Resume project"). |
| I can't change an issue's urgency or owner | Members can only change the **progress** of issues given to them | Ask your manager to make the change. |
| A page looks out of date | It hasn't refreshed | Refresh the page (F5, or pull down on a phone). |
| Times look wrong | All times are shown in India time | Nothing to do, unless you are in another country. |

## Uploading WhatsApp chats

| What you see | What it means | What to do |
|---|---|---|
| "You can't import into any project" | Only managers and admins can upload chats | Ask a manager to do it, or ask the admin to change your role. |
| "No WhatsApp messages were found" | The file isn't a WhatsApp chat export | Export it again from WhatsApp: **⋮ → More → Export chat**. Upload the .txt or .zip file it creates. |
| A red cross next to a file | The file is too big (over 25 MB) or of a type the tool doesn't accept | Remove that file, or make it smaller. |
| Status **Duplicate** | This chat was already uploaded to this project | Open the original upload instead. Nothing was lost. |
| Status **Failed** | Something went wrong partway, usually a brief internet hiccup | Open the upload and click **Retry**. It continues safely. |
| "Groq rate limit reached" | The free AI is limited in how much it can read per minute | Wait a minute and click **Retry AI processing**. |
| "AI processing is limited to 15 imports per hour" | A fair-use limit per person | Wait a while and try again. |
| A photo isn't linked to any message | The chat didn't mention that photo's name | It's still saved as evidence for the upload. |
| Some dates show as unknown | That message's date couldn't be read | The message is still saved. The tool leaves the date blank rather than guessing. |

## For the person looking after the tool

| Situation | What to do |
|---|---|
| The whole site shows an error | Open Supabase and check the project isn't paused. Open Vercel and check the latest deployment says "Ready". |
| Need to restore the practice data before a demo | Ask the developer to run the "reset demo" command. It recreates the practice accounts, projects and problems. |
| Daily checks don't seem to run | Look at the **Automations** page as admin. In Vercel, check **Settings → Cron Jobs**. Checks run once a day and can be up to an hour late. |
| Someone needs to be made an admin | **Team Members** → change their role (admin only). |

The technical version of this page, for developers, is in [docs/technical/13-troubleshooting.md](technical/13-troubleshooting.md).
