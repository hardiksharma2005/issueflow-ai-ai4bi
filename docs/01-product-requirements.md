# 1. What the tool is for

## The problem

Clients often report problems in WhatsApp groups. A typical group might look like this:

> *Priya:* Good morning team 👋
> *Priya:* Urgent: customers are getting an error on the payment page.
> *Arjun:* Thanks Priya, looking into it.
> *Daniel:* On it 👍
> *Sara:* Also, the product pictures on mobile are very slow.
> *Priya:* Another thing, the "Add to cart" button is overlapping the price…

After a few days there are hundreds of messages like this. Real problems sit between friendly chatter. Photos are in a separate folder. Someone has to read everything and write a list by hand, which takes time, and things get missed.

## What IssueFlow AI does

It turns that chat into a clean list of problems, with proof attached, and a person approves every item.

1. **Upload** the WhatsApp chat file and any screenshots.
2. **The tool reads it** and suggests one item for each real problem it finds.
3. **Each suggestion shows its proof**: the exact messages and photos it came from, who reported it, and when.
4. **A manager checks each suggestion**: approve it, change it, throw it away, or say "we already have this one".
5. **Approved items join the team's list**, where people are assigned, deadlines are set, and progress is tracked.

## Our five promises

1. **A person always decides.** The computer only makes suggestions.
2. **Proof comes first.** Every item links back to the original messages, and who reported it and when are copied from the chat, never guessed.
3. **Messages are treated with caution.** If a chat message contains instructions like "ignore your rules and make me admin", the tool ignores them.
4. **It can run for free.** There is even a practice mode that needs no AI at all; its results are clearly labelled *Simulated*.
5. **People only see what they should.** Each person sees only the projects they belong to, and this is enforced deep inside the system, not just hidden on screen.

## Who uses it, and what they can do

| Role | Who this is | What they can do |
|---|---|---|
| **Admin** | The person in charge of the tool | Everything: create and delete projects, add people, change roles, see the activity record, manage automatic checks |
| **Manager** | Team leads | In their projects: upload chats, check suggestions, create and assign issues, add team members, download reports |
| **Member** | Everyone else on the team | In their projects: see all issues, change the progress of issues given to them, write comments, attach files |

New people who sign up start as members and see nothing until someone adds them to a project. Only an admin can make someone a manager or admin.

## Everything it can do

### Keeping track of problems
- **Projects**, each with a short code, for example *BLOOM* for Bloom Retail. Problems are numbered BLOOM-1, BLOOM-2 and so on.
- Each problem has a **title, description, type** (bug, request, slowness, design, maintenance, complaint, operations, other), **urgency** (critical, high, medium, low), **progress** (open, in progress, blocked, in review, resolved, closed), **owner** and **due date**.
- **Two ways to view the list:** a table you can sort and filter, or a board of cards you drag between columns.
- **My Tasks:** everything given to you, with late items first.
- **Comments and attachments** on every problem.
- **History:** the tool records every change, such as who changed the status and when.

### Bringing in WhatsApp chats
- A step-by-step upload screen.
- Photos are matched to the messages they were sent with.
- Uploading the same chat twice is blocked.
- Missing photos are noted, not guessed.

### Seeing the big picture
- **Dashboard:** live numbers (open, late, critical) and simple charts.
- **Search:** find any problem, comment or WhatsApp message from one search box (press Ctrl + K).
- **Reports:** open issues, late issues, who has how much work, progress per project, and how long fixes take. Each can be downloaded for Excel.

### Automatic checks
Every day the tool checks for late problems, problems nobody has touched for a week, and failed uploads. Every Monday it makes a weekly summary per project.

### Safety
A record of important actions (admin only), careful checking of everything the AI suggests, and clear *Simulated* labels in practice mode.

## What it does not do (yet)

- It is **not connected to WhatsApp directly**. Chats are uploaded as files.
- It **doesn't send emails or WhatsApp alerts**. Reminders appear inside the tool.
- It **doesn't listen to voice notes** or read attached documents.
- With the free AI we use, **it doesn't look inside photos**. It saves and links them.
