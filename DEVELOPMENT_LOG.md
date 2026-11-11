# Project diary

A short timeline of what was done, in order. The full step-by-step story, with explanations, is in [How it was built, step by step](docs/11-development-walkthrough.md).

| # | Stage | What happened | Result |
|---|---|---|---|
| 1 | **Planning** | Listed everything the tool needed to do | A clear checklist |
| 2 | **Setting up** | Prepared the computer and started an empty website project | Ready to build |
| 3 | **Store room design** | Designed where information is kept, and the safety rules about who can see what | Rules built into the store room itself |
| 4 | **Reading WhatsApp** | Taught the tool to read chats from Android and iPhone and to pair photos with messages | Tested with many date styles |
| 5 | **AI with safety checks** | Wrote the AI's instructions and the checks on its answers | The AI suggests, the tool checks, a person decides |
| 6 | **Practice mode** | Built a free "pretend AI" for demos and testing | Clearly labelled "Simulated" |
| 7 | **Screens** | Built every page: dashboard, lists, board, uploads, review, reports, team, settings | Works on computers and phones |
| 8 | **Practice data** | Created a made-up chat, sample photos, accounts, clients and problems | Safe to explore |
| 9 | **Real store room** | Connected the free Supabase store room and loaded the practice data | Fixed three small setup problems |
| 10 | **Testing as a user** | A robot clicked through every page for every role | Found and fixed 5 problems (layout on phones, forms erasing typing, leftover files, a misleading chart, upload names) |
| 11 | **Documents and safety review** | Wrote the documents and re-checked every protection | Closed one safety gap in sign-in links |
| 12 | **Reliability** | Made the tool cope with brief internet hiccups | Retrying now always works |
| 13 | **Free AI** | Connected Groq's free AI | Found all 7 problems in the practice chat in 16 seconds |
| 14 | **Going live** | Saved the code to GitHub and published it with Vercel | Live at issueflow-ai-ai4bi.vercel.app |
| 15 | **Live testing and speed** | Tested the live site; fixed times showing in UK time; moved the website next to the store room | All 36 walk-through checks pass; pages twice as fast |
| 16 | **Final touches** | Renamed practice accounts to AI4BI Admin / Manager / Member 1–3; rewrote documents in plain language | Ready to show the team |

## Where things stand

- ✅ Tool is live and fully tested
- ✅ All services on free plans
- ✅ Practice data ready for a demonstration
- ⏳ Not yet tested: emails (password reset, invitations), the paid "Grok" AI option
- ⏳ Before real client use: remove practice data, connect an email service, decide who may sign up

The detailed technical diary, for developers, is in [docs/technical/development-log.md](docs/technical/development-log.md).
