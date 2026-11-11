# 3. Where information is kept

All information lives in one place, the **store room** (a service called Supabase). It is organised like a set of labelled cabinets. Here is what each cabinet holds, in plain words.

## The cabinets

| Cabinet | What it holds | Example |
|---|---|---|
| **People** | Each user's name, email and role (admin, manager or member) | "AI4BI Manager, manager" |
| **Projects** | Each client or piece of work, with a short code | "BLOOM, Bloom Retail Online Store" |
| **Project members** | Who belongs to which project | "AI4BI Member 2 is on BLOOM" |
| **Issues** | The approved problems, each with title, type, urgency, progress, owner and due date | "BLOOM-11: Payment page error, critical" |
| **Comments** | Notes people write on an issue | "Called the payment company, waiting for reply" |
| **Files** | Photos, screenshots and documents, stored in a locked area | "IMG-20261103-WA0001.jpg" |
| **Uploads** | Each WhatsApp chat that was uploaded, and how far it got | "Bloom chat, 37 messages, waiting for review" |
| **Original messages** | Every WhatsApp message, exactly as written. **These are never changed.** | "Priya, 3 Nov 09:17: Urgent: customers are getting an error…" |
| **Drafts** | The AI's suggestions, kept apart from real issues until approved | "Suggested: Slow product images on mobile" |
| **History** | Every change to an issue, recorded automatically | "Status changed from Open to In progress by AI4BI Member 1" |
| **Automatic checks** | The daily checks and a record of each time they ran | "Daily late check: 4 late issues" |
| **Activity record** | Important actions: sign-ins, role changes, deletions, downloads | "AI4BI Admin made someone a manager". Only the admin can see this. |

## How it all connects

- A **project** has many **issues**. Each issue can have **comments**, **files** and **history**.
- An **upload** contains many **original messages** and leads to several **drafts**.
- When a draft is approved, it becomes an **issue** that stays linked to the original messages it came from. You can always see *where a problem came from*.

## How information is kept separate and safe

The store room has a **guard who checks every single request**, not just the website. The guard follows these rules:

| Rule | In practice |
|---|---|
| You only see projects you belong to | Member 1 cannot see the Bloom project at all, even through search |
| Only managers can upload chats and see AI drafts | Members never see unchecked AI suggestions |
| Members can only change the **progress** of issues given to them | They can't change the title, urgency, owner or due date |
| Only admins can change someone's role | Nobody can make themselves an admin |
| There must always be at least one admin | The last admin can't be removed by accident |
| The activity record is admin-only | Members and managers can't read it |
| Uploaded files are locked per project | A photo from one client's project can't be opened by someone from another project |

We tested each of these rules by pretending to be different people and trying to break them. All the rules held. See [document 10](10-testing.md).

## What happens when something is deleted

- **Deleting a project** removes its issues, uploads, messages and files completely, including the stored photos.
- **Deleting an upload** removes its messages and drafts, but **approved issues keep their proof**.
- **Original WhatsApp messages are never edited**, only kept or deleted together with their upload.

## Practice data

The tool currently contains made-up practice data, so the team can explore:

| Project | Client (made up) | Issues | Team |
|---|---|---|---|
| **BLOOM** | Bloom Retail: online store | 10 | Admin, Manager, Member 2, Member 3 |
| **RVSD** | Riverside Office fit-out | 8 | Admin, Manager, Member 1 |
| **CARE** | Customer care | 6 | Admin, Member 1, Member 3 |

RVSD also contains one finished WhatsApp upload, so you can see what a completed upload looks like.
