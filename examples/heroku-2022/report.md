# 59% (58 to 81%) of the audience reacts negatively and 36% (32 to 57%) would leave or switch. Main objection: paid plans cost too much.

**Change:** Heroku ends all free dynos, free Postgres and free Redis on November 28, 2022 and deletes inactive accounts

If this ships as announced, roughly a third of the hobby audience moves to Render, Railway or Fly.io before November 28. Most of the rest are already elsewhere or on paid plans, and they mostly shrug. No one is pleased. The main reasons are that paid plans feel too expensive for projects that earn nothing, and that deleting inactive accounts raises the fear of losing data. Rivals with generous free tiers and smooth migrations make leaving easy, and this year's security incidents and outages had already worn down trust in Heroku.

## Numbers

| Measure | Value |
| --- | --- |
| Samples | 3 (figures below are the median sample) |
| Negative across samples | 59% (58% to 81%) |
| Would leave across samples | 36% (32% to 57%) |
| Negative | 59% |
| Neutral | 41% |
| Positive | 0% |
| Would leave or switch | 36% |
| Changed stance after seeing others | 20% |
| Confidence | medium (32 quotes from 4 domains. 3 samples agree within 25 points. Backtest as of 2022-08-24: the model may already know the outcome, so compare against what really happened.) |

### Actions in the next 30 days

- switch competitor: 36%
- stay: 34%
- ignore: 30%

## Objections

### Paid plans cost too much (71% of audience)

> Heroku became a focal point of education for anyone working with Rails and Node.js due to its free tier. Hobby developers and students could turn their ideas into production code extremely fast, without needing access to a credit card.
> [e12] https://leerob.com/heroku

> With a row limit of 10,000 and a storage capacity of 1 GB, I thought that it would last me for at least a year — it didn’t.
> [e15] https://jerrynsh.com/saying-goodbye-to-heroku-postgres/

> I chose Railway because it makes the most economical sense for my use case.
> [e17] https://jerrynsh.com/saying-goodbye-to-heroku-postgres/

### Migration takes time and effort (63% of audience)

> Heroku became a focal point of education for anyone working with Rails and Node.js due to its free tier. Hobby developers and students could turn their ideas into production code extremely fast, without needing access to a credit card.
> [e12] https://leerob.com/heroku

> With a row limit of 10,000 and a storage capacity of 1 GB, I thought that it would last me for at least a year — it didn’t.
> [e15] https://jerrynsh.com/saying-goodbye-to-heroku-postgres/

> Have a POC running on render.com’s free plan. Been very positive experience so far.
> [e25] https://news.ycombinator.com/item?id=31293451

### Risk of losing inactive apps and data (59% of audience)

> Heroku became a focal point of education for anyone working with Rails and Node.js due to its free tier. Hobby developers and students could turn their ideas into production code extremely fast, without needing access to a credit card.
> [e12] https://leerob.com/heroku

> With a row limit of 10,000 and a storage capacity of 1 GB, I thought that it would last me for at least a year — it didn’t.
> [e15] https://jerrynsh.com/saying-goodbye-to-heroku-postgres/

> Have a POC running on render.com’s free plan. Been very positive experience so far.
> [e25] https://news.ycombinator.com/item?id=31293451

### Distrust of Heroku and vendor free tiers (59% of audience)

> Have a POC running on render.com’s free plan. Been very positive experience so far.
> [e25] https://news.ycombinator.com/item?id=31293451

> I'm leaning towards just paying for heroku, because it's managed.
> [e1] https://news.ycombinator.com/item?id=26587637

> It feels like the open-source PaaS space is littered with attempts that then went away as fast as they came.
> [e5] https://news.ycombinator.com/item?id=26587637

### Rivals look better than Heroku (39% of audience)

> With a row limit of 10,000 and a storage capacity of 1 GB, I thought that it would last me for at least a year — it didn’t.
> [e15] https://jerrynsh.com/saying-goodbye-to-heroku-postgres/

> Have a POC running on render.com’s free plan. Been very positive experience so far.
> [e25] https://news.ycombinator.com/item?id=31293451

> I know others have suggested this too but https://fly.io is great! Very generous free tier, and it feels as magical as Heroku did when I first used it years ago.
> [e24] https://news.ycombinator.com/item?id=31293451

### Not affected by the change (30% of audience)

> I chose Railway because it makes the most economical sense for my use case.
> [e17] https://jerrynsh.com/saying-goodbye-to-heroku-postgres/

> The services are affordable and value for money.
> [e6] https://www.trustpilot.com/review/dreamtera.com

## What to change

1. **Announce a low-cost hobby tier at the same time as the free tier ends, with dyno, Postgres and Redis bundled into one small monthly price, rather than only removing free plans.** The top objection, raised by 71% of the audience, is that paid plans cost too much for side projects. Rivals use usage-based or generous free pricing to win these buyers. Expected effect: Hobbyists like Marcus, who like Heroku but won't pay current prices, get a reason to stay, so fewer of them switch. (e2, e17, e18, e24, e1)
2. **Replace 'deletes inactive accounts' with 'archives inactive apps.' Before anything is removed, send an emailed one-click Postgres export, offer a longer grace period, and allow a paid restore.** 59% of the audience fear losing inactive apps and data. Deletion wording also feeds the existing distrust. Expected effect: The data-loss objection shrinks, and the announcement reads as a policy change rather than a threat. (e15, e16, e19, e13)
3. **Launch a student and education program with free credits and no credit card required, verified through a school email or a bootcamp partner.** Students chose Heroku because no card was needed, and that free tier made Heroku a hub for teaching Rails and Node.js. Expected effect: Students like Priya keep learning on Heroku and don't have to find a new home before November 28. (e12, e30, e11)
4. **Explain plainly why the change is happening (abuse, security, reliability investment) and pair it with concrete commitments and an in-dashboard upgrade path, so users aren't left to migrate on their own.** 59% of the audience distrust Heroku and vendor free tiers, and rivals already have a reputation for smooth first-push migrations. Expected effect: Fewer people read the change as neglect, and more of those already considering a switch stay and upgrade. (e13, e23, e26, e27, e22)

**Most at risk:** Elena R., Full-stack freelancer deploying client prototypes. Elena is the largest segment (19%), already runs new deploys smoothly on Render's free plan and takes this announcement as the push to move all her client prototypes away.

## Personas

| Persona | Share | Final stance | Action | Reason |
| --- | --- | --- | --- | --- |
| Priya S., Computer science student and bootcamp learner | 7% | -1 | switch competitor | I'm a student and I deployed to Heroku because it needed no credit card. After Nov 28 that's gone, and I can't justify paying for hobby apps. Other buyers say Render and Railway migrations are smooth, which lowers my worry about switching. I'll wait until I've finished the current assignments, then do the move over the next few weeks. First I'll back up my Postgres data and check which of my portfolio apps are still worth keeping. I'll move the best ones to Render's free web service and free Postgres. I'll check their limits first, such as sleeping services and database expiry, and I'll also look at Fly.io and Railway. I'm not hostile to Heroku, since it taught me a lot, but it is no longer free, so I'm leaving. Moving also means I'll learn more about what happens behind git push, because I'll have to configure it myself. |
| Marcus L., Long-time hobbyist developer running side projects | 10% | -1 | switch competitor | I'm fond of Heroku, but my apps already outgrew the free Postgres, and I won't pay monthly for projects that earn nothing. The deadline is Nov 28, so I won't rush. Over the next 30 days I'll back up my databases with pg_dump. Then I'll move the most active app and its housekeeping job to Render or Railway as a trial. Anything I can't justify paying for stays dormant or gets archived. I may keep one app on Heroku's cheapest paid tier only if the cost is tiny. Heroku's loyalty gets it a look, not my money. |
| Jerry N., Indie developer optimising hosting cost per project | 14% | 0 | ignore | I already moved to Railway after Heroku's free Postgres row limit stopped working for me. Heroku ending free dynos, Postgres and Redis on Nov 28 doesn't force any action from me. It confirms my decision. I pay only for what I use on Railway, and that's cheaper than any Heroku paid plan for my low-risk hobby projects. I accept some reliability uncertainty. I won't move anything in the next 30 days. I'll keep an eye on Railway pricing changes and on Render and Fly.io, but nothing here makes me act. |
| Elena R., Full-stack freelancer deploying client prototypes | 19% | -1 | switch competitor | I already run new deploys on Render's free plan and it has been smooth, so this announcement just gives me the push. Over the next 30 days I'll take stock of my legacy Heroku apps and back up their databases with pg:backups. I'll move the active prototypes to Render first, since past migrations worked on the first push. Anything dormant I'll archive or delete. I won't pay Heroku's new minimum for hobby prototypes. I'm not going all-in on Render's free tier either, because Fly.io and Railway are fallbacks if Render changes its terms. The other buyers' reactions don't change this. The paying cofounder and the Dokku user aren't in my position, and the student's reaction matches mine. |
| Tomás F., Backend engineer at a small startup building global services | 10% | -1 | stay | I already run production and side projects on Fly.io, so this announcement doesn't force a migration on me. It confirms what I've been telling my team. My only Heroku exposure is a few legacy hobby apps. In the next 30 days I'll export anything I care about from them and leave the rest to lapse. I won't move anything to paid Heroku. Fly.io remains my default for monoliths close to users, with a generous free tier and a Heroku-like developer experience. Render and Railway are fine fallbacks, but I have no reason to switch to them. 'Stay' here means staying on Fly.io. My Heroku usage was already minimal, so this isn't a switch in any real sense. |
| Nadia K., Technical cofounder of a small bootstrapped SaaS | 11% | 0 | stay | My production app is already on paid dynos and paid Postgres, so the free-tier shutdown barely touches it. I may need to move a few staging or test apps to paid plans, which is a small cost increase. Other buyers say Render and Railway migrations are smooth, but I've been through AWS before. Moving saved about 35% and still wasn't worth hiring DevOps, so I won't gamble production to save a little. I'll stay on Heroku because it's managed. I'll audit my free resources, then price Render as a fallback without committing to it. I'm mildly annoyed about costs but not hostile. |
| Viktor P., Self-hosting developer and open-source tinkerer | 13% | -1 | stay | I already run Dokku on a VPS, so Heroku ending free dynos barely touches me. I'll keep doing what I do now. Over the next 30 days I'll check that my Dokku backups and CI deploy scripts still work, and I'll probably write up or share migration notes for friends leaving Heroku. I won't move to Render, Fly.io or Railway, because they could pull their free tiers the same way, and I want to avoid that dependency. The announcement mostly confirms my choice. My remaining worry is Dokku's long-term maintenance, and I have no sign of trouble there yet. The other buyers' reactions don't change my plan. Some of them are moving to managed platforms, but that is a different path from mine. |
| Ravi D., Small online-shop owner with a simple website | 16% | 0 | ignore | This doesn't affect me. I run a simple online shop on Dreamtera shared hosting. It's cheap, it has been up, and the support is friendly. Heroku's free dynos ending on Nov 28 matters to developers and students, not to me. I'd never have moved my store to a developer platform like Heroku, and Render, Fly.io, Railway and Vercel aren't for me either. Moving my store would risk downtime and lost sales, and I don't want that. I'll keep paying Dreamtera and check that my uptime and support stay good. I won't act on this news. |

## Basis

- Type: simulated reactions, not measured behavior
- Quotes: 32 from 4 domains via brightdata
- Cut-off: 2022-08-24, 1 later results or quotes left out
- Personas: 8, rounds: 3
- Models: claude-cli (sonnet / opus)
- Calls: 90, time: 395s, list-price equivalent: $1.6187

## Evidence

- [e1] (hackernews) "I'm leaning towards just paying for heroku, because it's managed." https://news.ycombinator.com/item?id=26587637
- [e2] (hackernews) "As someone working on a small team and trying not to burn cash, it feels like so much has become expensive since the "old" days of VPSs." https://news.ycombinator.com/item?id=26587637
- [e3] (hackernews) "I stopped reading the docs almost immediately when right away they indicated I had to paste (and more importantly understand) a massive piece of text for AWS IAM. If that's the starting point, it's a poor introduction. I'm still interested, but dokku is still the gold standard for a Heroku replacement for me." https://news.ycombinator.com/item?id=26587637
- [e4] (hackernews) "CapRover is cool, although at least last time I looked at it, it felt more suitable for personal hosting. In a way it promoted point-and-click interactions over scriptable, CD-type deployments." https://news.ycombinator.com/item?id=26587637
- [e5] (hackernews) "It feels like the open-source PaaS space is littered with attempts that then went away as fast as they came." https://news.ycombinator.com/item?id=26587637
- [e6] (review) "The services are affordable and value for money." https://www.trustpilot.com/review/dreamtera.com
- [e7] (review) "Best services with fast response times and the server is Not overloaded as other cheap hosts do." https://www.trustpilot.com/review/dreamtera.com
- [e8] (review) "when comparing there are many hosts with high pricing but dreamtera is cheap and best , i get more than the high priced ones with them" https://www.trustpilot.com/review/dreamtera.com
- [e9] (review) "Excellent service for the unbelievable low prices, Something more than expected for me, I am amazed with the 100% Uptime, 24/7 Support staff and all of them are very friendly to talk and Superb Service too" https://www.trustpilot.com/review/dreamtera.com
- [e10] (review) "How am I supposed to sell stuff, if people can't even reach my page?" https://www.trustpilot.com/review/dreamtera.com
- [e11] (web) "I’m personally inspired by Heroku and have used the platform since 2012 for some side projects." https://leerob.com/heroku
- [e12] (web) "Heroku became a focal point of education for anyone working with Rails and Node.js due to its free tier. Hobby developers and students could turn their ideas into production code extremely fast, without needing access to a credit card." https://leerob.com/heroku
- [e13] (web) "Heroku has had a tough 2022 with multiple security incidents and ongoing outages." https://leerob.com/heroku
- [e14] (web) "Some developers still deploy monolithic applications to Heroku or other services like Fly.io, Railway, and Render to colocate their backend and frontend. They don’t need (or want) to have microservices." https://leerob.com/heroku
- [e15] (web) "With a row limit of 10,000 and a storage capacity of 1 GB, I thought that it would last me for at least a year — it didn’t." https://jerrynsh.com/saying-goodbye-to-heroku-postgres/
- [e16] (web) "Despite having a garbage collector service that runs every week to remove staled rows, Heroku Postgres’s free tier simply wasn’t enough." https://jerrynsh.com/saying-goodbye-to-heroku-postgres/
- [e17] (web) "I chose Railway because it makes the most economical sense for my use case." https://jerrynsh.com/saying-goodbye-to-heroku-postgres/
- [e18] (web) "Incredibly generous pricing, where you would only start paying for resource usage after $10. In my case, this is a lot cheaper than using Heroku." https://jerrynsh.com/saying-goodbye-to-heroku-postgres/
- [e19] (web) "Now, I’ll either have to generate my CSV on another server or pray that the SaaS that I’m using has PostgreSQL integration (hint: most don’t)." https://jerrynsh.com/saying-goodbye-to-heroku-postgres/
- [e20] (web) "On the contrary, I can’t speak for the reliability and uptime of the Railway. Having that said, the projects that I am running allow me to take on this level of risk, and my experience so far has been great." https://jerrynsh.com/saying-goodbye-to-heroku-postgres/
- [e21] (hackernews) "I switched from Heroku to AWS, then eventually back to Heroku. Heroku to AWS was for cost reasons (cut monthly costs by roughly 35%) but wasn't enough savings to justify hiring a devops person." https://news.ycombinator.com/item?id=30951640
- [e22] (hackernews) "I would checkout Render and DO App Platform. Heroku has actual competition now." https://news.ycombinator.com/item?id=30951640
- [e23] (hackernews) "Recent events have made me realize I should at least consider switching away from Heroku." https://news.ycombinator.com/item?id=31293451
- [e24] (hackernews) "I know others have suggested this too but https://fly.io is great! Very generous free tier, and it feels as magical as Heroku did when I first used it years ago." https://news.ycombinator.com/item?id=31293451
- [e25] (hackernews) "Have a POC running on render.com’s free plan. Been very positive experience so far." https://news.ycombinator.com/item?id=31293451
- [e26] (hackernews) "Just deployed a new app to Render this week. Was dreading it but the experience was really smooth. Was a fan of Heroku but it seems neglected and is overpriced." https://news.ycombinator.com/item?id=31293451
- [e27] (hackernews) "I’ve migrated 2 apps from Heroku to Render and both worked on my first push. One was node.js job, other was React SPA + Postgrest." https://news.ycombinator.com/item?id=31293451
- [e28] (hackernews) "Seconding fly.io. We moved a major global service to them and have been very pleased." https://news.ycombinator.com/item?id=31293451
- [e29] (hackernews) "So far I'm still within the free tier, so nothing at all." https://news.ycombinator.com/item?id=23170881
- [e30] (hackernews) "I have always wanted to learn DevOps. I use Heroku for almost all my apps, but I wanted to learn what is happening every time I do git push heroku master." https://news.ycombinator.com/item?id=23170881
- [e31] (hackernews) "Deployed on heroku with python/django, postgres and react. Stripe for payments too." https://news.ycombinator.com/item?id=23170881
- [e32] (hackernews) "I convinced a bunch of friends to use WL a few years ago and now they're mad at ME for the acquisition! Not really mad, but despondent and looking for alternatives. I migrated to Apple's todo list app (which has +ves and -ves), but it was funny getting a bunch of texts within a week blaming me for getting them hooked on WunderList!" https://news.ycombinator.com/item?id=23170881

Run 20261114-092929-26c4d3, 2026-11-14T07:29:29.314Z
