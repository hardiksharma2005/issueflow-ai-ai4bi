# 10. How we tested it

Before showing the tool to anyone, we checked that it works, that it is safe, and that it is quick. We used **three kinds of tests**, from small to large.

## The three kinds of tests

| Kind | In everyday terms | How many | Result |
|---|---|---|---|
| **Small checks** | Testing each part on its own, like checking every light switch in a house | 61 | **All passed** |
| **Security checks** | Pretending to be different people and trying to break the rules on the real store room | 12 | **All passed** |
| **Full walk-throughs** | A robot opens the real website in a web browser and clicks through everything a person would, on a computer screen and on a phone-sized screen | 36 | **All passed**, on the live site, twice in a row |

All tests are saved, so they can be run again any time something changes.

## What the small checks cover
- Reading WhatsApp chats from Android and iPhone, in different date and time styles
- Matching photos to messages
- Checking the AI's answers: throwing away suggestions with no proof, never trusting names or dates from the AI
- Making sure the trick message in the practice chat never becomes an issue
- Spotting duplicates
- Report downloads (including making Excel formulas harmless)
- Dates and times shown in India time
- Blocking web links that would send people to other sites

## The security checks: trying to break the rules

| We tried to… | Result |
|---|---|
| Read information without signing in | Refused |
| See another project's problems as a member | Refused |
| Make yourself an admin as a member | Refused |
| Create problems or projects as a member | Refused |
| Change a problem's title or urgency as a member | Refused (only progress can be changed) |
| Change progress on a problem given to someone else | Refused |
| Create problems in a project you don't manage, as a manager | Refused |
| Give a problem to someone outside the project | Refused |
| Read the activity record as a member | Refused |
| See or approve AI suggestions as a member | Refused |
| Approve the same suggestion twice | Refused |
| Upload the same chat twice | Refused |
| Find another project's information through search | Nothing found |
| Open another project's photos | Refused |

## The full walk-throughs: what the robot does

1. **Without signing in:** tries to open pages and is sent to the sign-in page.
2. **As admin, manager and member:** opens every page on a computer screen and on a phone screen, checking each page loads without errors and nothing spills off the side of the screen.
3. **As a member:** confirms they can't upload chats, can change the progress of their own task, can't change urgency or owner, and can add a comment.
4. **As the manager:** uploads the practice WhatsApp chat, then:
   - checks all 37 messages were read
   - runs the real AI, which produces 7 suggestions
   - checks the duplicate warning ("may already be BLOOM-7") appears
   - checks the trick message didn't become a problem
   - checks every photo loads
   - approves one suggestion and rejects another
   - confirms the approved one is now a real problem, linked to its WhatsApp messages
   - tries to upload the same chat again, which is blocked
   - downloads a report and searches for "payment"
5. **Accounts:** creates a new account (rejecting a too-short password without wiping the form), signs out, tries a wrong password, tries "forgot password", and runs an automatic check as admin.

## Speed

| | Before improvement | After |
|---|---|---|
| Opening a page | 1.5 – 2.4 seconds | 0.5 – 1.0 seconds |
| Signing in | 4.3 seconds | 2.7 seconds |

See [document 8](08-deployment.md) for how this was improved.

## Problems found by testing, and fixed

Testing is useful because it finds problems before users do. These were all found and fixed:

| What was wrong | What we did |
|---|---|
| Some pages were too wide on a phone and needed sideways scrolling | Fixed the layout; every page now fits a phone screen |
| A chart drew curved lines suggesting numbers that never existed | Changed it to a clear running total |
| Forms erased everything you typed if you made one small mistake | Forms now keep what you typed |
| Deleting a project left its uploaded files behind | Files are now removed too |
| A sign-in link could be misused to send people to another website | Closed: only our own site is allowed |
| If the connection dropped while reading a chat, retrying didn't work | Retrying now works |
| A brief connection drop could make the tool think you'd signed out | Now it says "please try again" instead |
| Times were shown 5½ hours wrong on the live site (UK time instead of India time) | All times now show in India time |
| Pages were slow because the website and store room were on different continents | Moved them next to each other |

## Not tested yet
- **Emails** (password reset, invitations). Email sending was kept off during testing to avoid sending to made-up addresses.
- **The paid "Grok" AI** option. We use the free Groq AI, which *was* fully tested.
- **Real WhatsApp chats from many different countries and phone languages.** Tested with common formats only.
- **Screen readers** for people with low vision.
