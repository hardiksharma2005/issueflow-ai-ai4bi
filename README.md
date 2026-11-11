# IssueFlow AI

**Turning WhatsApp messages from clients into a tidy, trackable list of problems.**

Open the tool here: **https://issueflow-ai-ai4bi.vercel.app**

---

## What is it, in one minute?

Many of our clients tell us about problems in WhatsApp groups. Over a few days a group fills up with hundreds of messages: greetings, "thank you", "on it 👍", photos, and somewhere in between, the real problems that need fixing. It is easy for something important to get lost.

IssueFlow AI helps with this:

1. **We upload the WhatsApp chat** (WhatsApp can save any chat as a file).
2. **The computer reads the chat** and picks out each real problem, with the exact messages and photos that mention it.
3. **A person checks every suggestion** and clicks *Approve*, changes it, or throws it away. The computer never adds anything on its own.
4. **Approved problems go onto a shared list**, where the team can see who is working on what, what is late, and what is finished.

Think of it as a very fast assistant who reads the whole chat and hands you neat notes, while you stay the one who decides.

## Who can sign in to try it?

We have set up practice accounts with made-up clients and problems, so the team can explore without any risk.

| Sign in as | Name shown | What this person can do |
|---|---|---|
| `admin@issueflow.example` | AI4BI Admin | Everything, including managing the team and settings |
| `manager@issueflow.example` | AI4BI Manager | Upload WhatsApp chats, check the computer's suggestions, manage problems |
| `member@issueflow.example` | AI4BI Member 1 | See their projects, update their own tasks, write comments |
| `daniel@issueflow.example` | AI4BI Member 2 | Same as Member 1, on a different project |
| `sara@issueflow.example` | AI4BI Member 3 | Same as Member 1, on two projects |

The password is shared privately by the person running the demo. It is not written here on purpose.

## What to read

The documents are written for everyone. No technical knowledge is needed.

| Document | What it explains |
|---|---|
| [1. What the tool is for](docs/01-product-requirements.md) | The problem it solves and everything it can do |
| [2. How it fits together](docs/02-architecture.md) | The four building blocks, explained with everyday comparisons |
| [3. Where information is kept](docs/03-database-design.md) | What is stored, and how it is kept separate and safe |
| [4. How WhatsApp chats are read](docs/04-whatsapp-processing.md) | What happens to a chat after you upload it |
| [5. How the AI helps](docs/05-ai-integration.md) | What the AI does, what it is not allowed to do, and what it costs |
| [6. A tour of the screens](docs/06-frontend-development.md) | Every page of the tool, one by one |
| [7. Logging in and keeping data safe](docs/07-authentication-and-security.md) | Passwords, who can see what, and how we protect client information |
| [8. How the tool was put online](docs/08-deployment.md) | Where it lives on the internet and how updates happen |
| [9. Automatic daily checks](docs/09-automation.md) | The reminders the tool runs by itself every day |
| [10. How we tested it](docs/10-testing.md) | What we checked, the results, and what we fixed |
| [11. How it was built, step by step](docs/11-development-walkthrough.md) | The whole journey, from an empty folder to a working tool |
| [12. Demo guide](docs/12-demo-script.md) | A click-by-click guide for showing the tool to others |
| [13. Help with common problems](docs/13-troubleshooting.md) | What to do if something doesn't work |
| [Project diary](DEVELOPMENT_LOG.md) | A short timeline of what was done, in order |

For developers, the detailed technical versions of all these documents are in [docs/technical](docs/technical/README-technical.md).

## Good to know before showing it

- **The AI is free to use.** We use a service called Groq on its free plan. It is limited in how much it can read per minute, so very long chats take a little longer.
- **The AI reads words, not pictures.** Photos and screenshots are saved and attached to the right problem, but the AI does not look inside them.
- **Chats are uploaded as files.** The tool is not connected to WhatsApp directly, and it cannot read anyone's phone.
- **Reminders appear inside the tool only.** It doesn't send emails or WhatsApp messages yet.
- **All the people and companies in the practice data are made up.**

## A few words you may come across

| Word | Meaning |
|---|---|
| **Issue** | One problem or request that needs doing, like "the payment page shows an error" |
| **Project** | One client or piece of work. Each project has its own list of issues and its own team |
| **Draft** | A problem the computer *suggests*. It only becomes an issue after a person approves it |
| **AI** | Artificial intelligence: a computer program that can read text and summarise it |
| **Import** | Uploading a WhatsApp chat into the tool |
| **Kanban board** | A view where each issue is a card, and cards move across columns such as "Open", "In progress" and "Done" |
