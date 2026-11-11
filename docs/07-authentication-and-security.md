# 7. Logging in and keeping data safe

Client conversations can contain sensitive information, so we took safety seriously. This page explains how, without technical terms.

## Signing in

| What | How it works |
|---|---|
| **Creating an account** | Name, email and a password of at least 8 characters. New accounts start as **members** with no projects. The very first account ever created became the admin. |
| **Signing in** | Email and password. If either is wrong, the message is the same ("Invalid email or password"), so nobody can find out which emails have accounts. |
| **Forgot password** | Enter your email and a reset link is sent. The tool always replies "If an account exists, a link is on its way", for the same reason. |
| **Inviting people** | An admin can invite someone by email from **Team Members**. They choose their own password. |
| **Signing out** | Click your initials (top right) → **Sign out**. |

Passwords are handled by a specialised login service (part of Supabase). **We never see or store anyone's password.**

## Who can see and do what

There are three levels of protection, like a building with a receptionist, locked doors and a guard at the filing room:

1. **What you see on screen.** Buttons you can't use are hidden. This is only for convenience.
2. **The website double-checks** every action: are you signed in, and do you have the right role?
3. **The store room's guard checks again**, on every single request. This is the real protection: even if someone bypassed the website entirely, the guard would still refuse.

The rules are listed in [document 3](03-database-design.md). In short: you only see your own projects, only managers handle uploads and AI suggestions, members can only update the progress of their own tasks, and only admins can change roles.

**We tested these rules by trying to break them**: pretending to be a member who tries to make themselves admin, look at another project, change someone else's task, approve AI suggestions, and so on. Every attempt was refused. See [document 10](10-testing.md).

## Protecting secrets

Some parts of the system need secret keys, like the master key to the store room or our key for the AI service.

- They are kept **only on our server**, like keys in a safe.
- They are **never sent to anyone's browser**.
- They are **never saved in the shared code**. We checked the entire code history to confirm no secret was ever saved there.

## Protecting against tricks

| Trick | What the tool does |
|---|---|
| A WhatsApp message that tries to give the AI orders ("ignore your rules…") | The AI is told to treat chat text as information only. Its answers are checked, and a person approves everything. |
| A file pretending to be something else (for example a program renamed as a photo) | Every file is checked to make sure it really is what its name says |
| A huge "zip bomb" file meant to overload the system | Size limits are checked while opening it |
| A web link that sends people to a fake site after signing in | Only links back to our own site are allowed |
| Putting our site inside another website to trick people into clicking | Our site refuses to be shown inside other websites |
| A downloaded report that contains hidden Excel formulas | Report cells that could be formulas are made harmless |
| Too many AI requests | Each person can use the AI on up to 15 uploads per hour |

## The activity record

The tool keeps a record of important actions: sign-ins, role changes, deleted items, report downloads and AI runs. **Only the admin** can read it (Settings page). It records *what* changed, not the full text of messages, and never passwords.

## The connection is private

The address starts with **https://**, which means everything between your browser and the tool is encrypted, like a sealed envelope.

## What we could add later

- A second step when signing in, such as a code from your phone
- A "are you a human?" check on the sign-up page
- Making the tool invitation-only, so strangers can't create accounts
