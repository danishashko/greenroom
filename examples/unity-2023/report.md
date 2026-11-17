# 100% of the audience reacts negatively and 0% (0 to 11%) would leave or switch. Main objection: retroactive fee on released games.

**Change:** Starting January 1, 2024, Unity charges game developers a Runtime Fee for every new install of a game made with Unity: $0.20 per install on Unity Personal and Plus once a game passes $200,000 in revenue over 12 months and 200,000 lifetime installs, and a sliding fee from $0.15 down to $0.01 per install on Pro and Enterprise. Installs made before 2024 count toward the thresholds, and the fee applies to games already released.

If this ships as described, every developer in the audience reacts negatively. Almost nobody leaves right away, but 76% put things on hold: they keep live projects on Unity and stop making new Unity commitments while they price out Godot, Unreal and GameMaker. The main reason is that the fee reaches back to games already released and counts installs made before 2024. That breaks the royalty-free subscription deal people say they chose Unity for.

## Numbers

| Measure | Value |
| --- | --- |
| Samples | 3 (figures below are the median sample) |
| Negative across samples | 100% (100% to 100%) |
| Would leave across samples | 0% (0% to 11%) |
| Negative | 100% |
| Neutral | 0% |
| Positive | 0% |
| Would leave or switch | 0% |
| Changed stance after seeing others | 0% |
| Confidence | medium (31 quotes from 4 domains. 3 samples agree within 11 points. Backtest as of 2023-09-11: the model may already know the outcome, so compare against what really happened.) |

### Actions in the next 30 days

- delay: 76%
- ignore: 13%
- downgrade: 11%

## Objections

### Retroactive fee on released games (100% of audience)

> Unity is royalty-free altogether, you pay a subscription for the development tools (think Adobe CC or MS Office365) and get all upgrades during your subscription.
> [e4] https://news.ycombinator.com/item?id=18603031

> Unreal Engine is free, but there's a catch — you'll need to pay 5% in royalty fees on all game revenues include in-game purchases if your games ever make any money.
> [e9] https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html

> It appears that no free slots are included per project, so I'd have to pay for my other dev's slots. Gah.. that hurts.
> [e16] https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/

### Trust broken by changing terms (87% of audience)

> Unity is royalty-free altogether, you pay a subscription for the development tools (think Adobe CC or MS Office365) and get all upgrades during your subscription.
> [e4] https://news.ycombinator.com/item?id=18603031

> Unreal Engine is free, but there's a catch — you'll need to pay 5% in royalty fees on all game revenues include in-game purchases if your games ever make any money.
> [e9] https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html

> It appears that no free slots are included per project, so I'd have to pay for my other dev's slots. Gah.. that hurts.
> [e16] https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/

### Unpredictable, hard-to-budget costs (59% of audience)

> Unity is royalty-free altogether, you pay a subscription for the development tools (think Adobe CC or MS Office365) and get all upgrades during your subscription.
> [e4] https://news.ycombinator.com/item?id=18603031

> It appears that no free slots are included per project, so I'd have to pay for my other dev's slots. Gah.. that hurts.
> [e16] https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/

> I have no experience on networking, so I could be vastly misunderstanding resource usage but looking at the Unity Game Services pricing it feels like it could easily balloon out of control.
> [e20] https://www.reddit.com/r/Unity3D/comments/v44ntg/are_unity_game_services_as_expensive_as_i_think/

### Install counts unclear and open to fraud (40% of audience)

> Unity is royalty-free altogether, you pay a subscription for the development tools (think Adobe CC or MS Office365) and get all upgrades during your subscription.
> [e4] https://news.ycombinator.com/item?id=18603031

> Unreal Engine is free, but there's a catch — you'll need to pay 5% in royalty fees on all game revenues include in-game purchases if your games ever make any money.
> [e9] https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html

> For a lot of indie game devs Unity is a no-brainer. It's beginner-friendly, great for 3D and it supports more target platforms than any other engine.
> [e7] https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html

### Hurts low-revenue free mobile games (26% of audience)

> Unreal Engine is free, but there's a catch — you'll need to pay 5% in royalty fees on all game revenues include in-game purchases if your games ever make any money.
> [e9] https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html

> I have no experience on networking, so I could be vastly misunderstanding resource usage but looking at the Unity Game Services pricing it feels like it could easily balloon out of control.
> [e20] https://www.reddit.com/r/Unity3D/comments/v44ntg/are_unity_game_services_as_expensive_as_i_think/

### Fee stacks on other Unity costs (26% of audience)

> It appears that no free slots are included per project, so I'd have to pay for my other dev's slots. Gah.. that hurts.
> [e16] https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/

> I have no experience on networking, so I could be vastly misunderstanding resource usage but looking at the Unity Game Services pricing it feels like it could easily balloon out of control.
> [e20] https://www.reddit.com/r/Unity3D/comments/v44ntg/are_unity_game_services_as_expensive_as_i_think/

## What to change

1. **Remove the retroactive part. Games released before January 1, 2024 never pay the Runtime Fee, and installs made before 2024 don't count toward the thresholds.** Every persona objects to the fee on released games, and most say it breaks trust because developers signed up for a royalty-free subscription. Expected effect: This removes the objection everyone shares and the main reason developers are freezing new Unity commitments. (e4, e6)
2. **Promise in writing that a project keeps the terms of the Unity version it ships on, so future pricing changes only apply to new versions developers choose to upgrade to.** Most of the audience says the real damage is that Unity can change terms after the fact, which makes long-term engine commitments feel unsafe. Expected effect: Studios that are holding off on new Unity projects get a stable basis for committing again. (e4, e6, e23)
3. **Put a cap on the fee: let developers pay either the per-install amount or a stated small share of the game's revenue from that period, whichever is lower, and publish a calculator.** Costs that can't be predicted are a top objection, and producers are already comparing Unity's fee with Unreal's royalty, which is easier to understand. Expected effect: The fee becomes something developers can budget for and compare directly with Unreal, which weakens the argument for switching. (e9, e1, e20, e21)
4. **Spell out what counts as an install: exclude reinstalls, multiple devices, demos, pirated or fraudulent installs, and charity or subscription bundles, and give developers a way to dispute their install counts.** A large part of the audience thinks install counts are unclear and open to abuse, and free-to-play mobile developers worry that installs which earn little or nothing will create bills. Expected effect: Free-to-play and mobile studios no longer fear huge bills from installs they can't check or that don't bring in money. (e21)

**Most at risk:** Elena V., Mobile and multiplayer free-to-play developer. Elena runs a free-to-play multiplayer game that brings in little revenue per install, so a per-install fee, unclear install counts and Unity's other service costs hit her hardest, and she is already freezing new Unity-dependent work.

## Personas

| Persona | Share | Final stance | Action | Reason |
| --- | --- | --- | --- | --- |
| Marcus T., Founder and lead programmer of a small self-funded PC/console studio | 11% | -2 | delay | I chose Unity because it was a subscription with no revenue share, and I keep my revenue. This change breaks that and reaches back to titles I've already shipped. I can't switch engines in 30 days. I have released games to support and a codebase in C#. So I'll freeze any new Unity commitments, including renewals and upgrades, where possible. I'll check my installs and revenue against the thresholds. I'll prototype my next project in Godot and Unreal to compare costs. Unreal's 5% royalty after $1M is at least predictable and not retroactive. If Unity doesn't drop the retroactive part, I'll move new projects off Unity. Other buyers' reactions only confirm my view. The trust damage is the main issue, not the dollar amount. |
| Priya K., Business-minded indie producer who models how engine and storefront fees affect margins | 16% | -2 | delay | I'm not rewriting live projects within 30 days, so I'm not churning yet. But I'm freezing new Unity commitments. I'll build a spreadsheet comparing Unity's fee, Unreal's 5% royalty plus Epic's 12% store cut, and Godot's zero fee, across my pipeline. Any new project with low ARPU or a high install count will start in Unreal or Godot unless Unity clarifies and drops the retroactivity. Existing Unity projects stay put for now. Unreal's royalty at least follows revenue, which fits my goal of engine cost growing with revenue. |
| Jonas R., Studio lead of a three-to-five person indie team buying several seats | 16% | -2 | delay | We're a 3-5 person team on several Plus/Pro seats with annual commitments, so I can't leave in 30 days. We're probably under the $200k and 200k thresholds today, so there's no immediate bill. But I already pay for every collaborator's seat and get thin docs and support. Now Unity adds a retroactive fee on top, which tells me the terms can move at any time. In the next 30 days I will not renew or add seats, I'll prototype a small project in Godot and look at Unreal's 5% royalty model, and I'll wait for Unity to clarify. If the retroactive part stays, I'll plan to move new projects off Unity after the commitment ends. |
| Elena V., Mobile and multiplayer free-to-play developer | 10% | -2 | delay | I'm not switching engines in the next 30 days. A rewrite of a live multiplayer UGC game is expensive and I can't afford it right now. But I'm freezing new Unity-dependent commitments, including new UGS services and Asset Store spending, until Unity publishes details on how installs are counted, how reinstalls and fraud are handled, and who pays for free-to-play. In the meantime I'll model my install numbers against the thresholds and prototype a small project in Godot. I'm not at the thresholds today, but my goal is install growth, so I'd hit them with low revenue per install. The other buyers are all negative too, and the retroactivity and trust problem is what moves me most. |
| Sam O., Solo indie developer who has already shipped a commercial Unity game and now builds in Godot | 13% | -2 | ignore | I already shipped a PC/Xbox game on Unity and moved to Godot with GDScript for faster iteration. I'm not a Unity customer for new work, so this changes nothing in my workflow. It only validates my decision. Others are weighing a migration, but I've already made it. I'll keep building in Godot and won't come back. The most I'll do is check whether my old shipped Unity game is near the thresholds, which is a minor chore and not a decision. |
| Viktor L., Unity C# developer with 7 years of experience looking at migration options | 10% | -2 | delay | I'm not switching this week. Godot mono runs C#, but it isn't a drop-in for Unity scripts: the APIs, scene model and Asset Store plugins all differ. Still, retroactive fees are what move me from loyal to hedging. In the next 30 days I'll prototype one small existing project in Godot 4 with C#, hold any new Unity-only commitments, and watch whether Unity clarifies or walks back the retroactive terms. Unreal and GameMaker are less attractive for me because I want to keep C#. The other buyers are all negative, which matches my own view. I'm delaying and testing rather than leaving outright. |
| Aisha M., Beginner hobbyist learning to make games | 11% | -1 | downgrade | I'm a beginner on Unity Personal and I'm unlikely to hit $200k revenue and 200k installs, so the fee wouldn't hit me directly. But I'm already trying Godot. A fee that applies retroactively, plus thresholds I don't fully understand, makes Unity feel like a bad bet for a future commercial game. Over the next 30 days I'll shift most of my learning time to Godot. I'll keep Unity installed for tutorials I'm already following, because there are lots of Unity tutorials and it's still easy to get into. I'm not deleting it, but it's no longer my main engine. Starting free and having no pricing worries matters most to me right now. |
| Chris D., Committed Unity generalist developer on 2D and 3D indie projects | 13% | -1 | delay | I'm a Unity loyalist on Plus and I still think Unity is the most capable engine with the widest platform support, so I'm not jumping to Godot, Unreal or GameMaker this month. I'm probably under $200k and 200k installs, so the fee likely won't hit me directly. Still, the retroactive part is hard to defend, and every other buyer reacted negatively, which makes me less willing to be the one defending it. I'll keep working on my current projects, hold off on renewing or adding anything long-term, and wait for the final terms, a clear way to count installs, and written guarantees that small developers are exempt. I'll also try a small Godot prototype as a hedge. If the terms keep shifting, I'll turn critical and consider moving. |

## Basis

- Type: simulated reactions, not measured behavior
- Quotes: 31 from 4 sources via brightdata
- Audience shares: from how many quotes back each persona
- Cut-off: 2023-09-11, 3 later results or quotes left out
- Personas: 8, rounds: 3
- Models: claude-cli (sonnet / opus)
- Calls: 100, time: 613s, list-price equivalent: $1.7754

## Evidence

- [e1] (hackernews) "No bias. If you sell a Unity game, the fee to Epic is 12%. If you sell an Unreal Game, the fee would have been 12% for the store plus 5% for engine royalties for a total of 17%, which would strongly dis-incentivize developers from using Epic's own engine." https://news.ycombinator.com/item?id=18603031
- [e2] (hackernews) "Epic is certainly not making the store engine neutral. It costs less to use unreal than unity." https://news.ycombinator.com/item?id=18603031
- [e3] (hackernews) "It isn't Epic's fault that Unity doesn't have a royalty program." https://news.ycombinator.com/item?id=18603031
- [e4] (hackernews) "Unity is royalty-free altogether, you pay a subscription for the development tools (think Adobe CC or MS Office365) and get all upgrades during your subscription." https://news.ycombinator.com/item?id=18603031
- [e5] (hackernews) "Unity's license is if _your company_ makes >= $100k a year you're required to buy the $400 per seat license." https://news.ycombinator.com/item?id=18603031
- [e6] (hackernews) "Unity provides the tools on subscription, but does not charge a royalty anymore." https://news.ycombinator.com/item?id=18603031
- [e7] (web) "For a lot of indie game devs Unity is a no-brainer. It's beginner-friendly, great for 3D and it supports more target platforms than any other engine." https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html
- [e8] (web) "Unity has a free Personal Edition that is already quite powerful, but serious game creators will upgrade to either Unity Plus at 35$/month or Unity Pro at 123$/month depending on their revenues." https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html
- [e9] (web) "Unreal Engine is free, but there's a catch — you'll need to pay 5% in royalty fees on all game revenues include in-game purchases if your games ever make any money." https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html
- [e10] (web) "Unreal is usually considered as having the most advanced graphics capabilities and allowing the creation of photorealistic games." https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html
- [e11] (web) "So you guessed it I'm going go the unconventional route and I'm going to pick Godot to build my game. I'm not saying that it's better than the engines I mentioned previously, but it does have a few advantages." https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html
- [e12] (web) "The fact that it's free doesn't hurt but it's not the main reason, at least for me. It's very easy to get into and it's great for beginners." https://cyberglads.com/making-cyberglads-1-choosing-a-game-engine.html
- [e13] (web) "Unreal is VERY intuitive to use. I was actually quite surprised with Unreal’s low market share compared to what I thought it was. Unity is really gaining a strong fan base." https://aiinstitute.hbs.edu/platform-digit/submission/the-unreal-platform-for-game-developers/
- [e14] (web) "I knew they had effectively “open-sourced” the game engine, but I didn’t know they had built an easy to use interface to make it accessible to the masses…" https://aiinstitute.hbs.edu/platform-digit/submission/the-unreal-platform-for-game-developers/
- [e15] (reddit) "The price is not indie friendly being per-seat rather than per-project." https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/
- [e16] (reddit) "It appears that no free slots are included per project, so I'd have to pay for my other dev's slots. Gah.. that hurts." https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/
- [e17] (reddit) "If I'm going to pay that much, I need that fuzzy feeling of support." https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/
- [e18] (reddit) "it's somewhat demoralizing to pay a subscription for something that doesn't even have proper docs." https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/
- [e19] (reddit) "It looks like you can do quite a lot with just Unity Plus ($30/mo/slot), however it seems like you need a 12/mo commitment. But for 30/mo... not bad :)" https://www.reddit.com/r/gamedev/comments/5jjwwa/unity_3ds_new_price_model_thoughts_experiences/
- [e20] (reddit) "I have no experience on networking, so I could be vastly misunderstanding resource usage but looking at the Unity Game Services pricing it feels like it could easily balloon out of control." https://www.reddit.com/r/Unity3D/comments/v44ntg/are_unity_game_services_as_expensive_as_i_think/
- [e21] (reddit) "My main concern is that I don't monetize in a way that makes multiplayer match making and user generated content sustainable to maintain. (particularly relay seems like it could get expensive if there was a decent number of concurrent users)" https://www.reddit.com/r/Unity3D/comments/v44ntg/are_unity_game_services_as_expensive_as_i_think/
- [e22] (reddit) "The Unity huge asset store is a big advantage but what I see is that people often end up buying assets to plug holes in what should be a built in feature, and it could be very basic things like tilemaps or proper gamepad support." https://www.reddit.com/r/godot/comments/14e2o4w/give_me_your_honest_thoughts_on_godot_vs_unity/
- [e23] (reddit) "Unity on the other hand, while the current market leader, is slowly diversifying and acquiring all sorts of companies and pivoting away from gamedev." https://www.reddit.com/r/godot/comments/14e2o4w/give_me_your_honest_thoughts_on_godot_vs_unity/
- [e24] (reddit) "Made a commercial game with Unity before (pc/xbox) then I am now working on next game on Godot using gdscript . Game development knowledge is easily transferable between modern engines these days." https://www.reddit.com/r/godot/comments/14e2o4w/give_me_your_honest_thoughts_on_godot_vs_unity/
- [e25] (reddit) "Why I use Godot now? Making game is a very iterative process and Godot is way faster than Unity going from code to running your game back and forth." https://www.reddit.com/r/godot/comments/14e2o4w/give_me_your_honest_thoughts_on_godot_vs_unity/
- [e26] (reddit) "Yeah, people like to bitch and moan that Unity can run games in the editor and make adjustments and godot cant, however, godot can run individual scenes and the speed with which I can make minor adjustments is ridiculously faster compared to Unity." https://www.reddit.com/r/godot/comments/14e2o4w/give_me_your_honest_thoughts_on_godot_vs_unity/
- [e27] (reddit) "Iteration loop is the most important thing whenever you are building learning. Would love to see a side by side. I hate waiting for compilation in unity." https://www.reddit.com/r/godot/comments/14e2o4w/give_me_your_honest_thoughts_on_godot_vs_unity/
- [e28] (reddit) "So I developed with Unity over 7 years now, and well Unitys having his strength/weaknesses just like any other EngineHowever I saw something while downloading Godot today that I didnt know before" https://www.reddit.com/r/godot/comments/vsmrt3/moving_from_unity_to_godot/
- [e29] (reddit) "It says in the mono version that it supports C# is it possible to retrieve Unity scripts this way? If it's the case you can't imagine how it will save my time by x1000" https://www.reddit.com/r/godot/comments/vsmrt3/moving_from_unity_to_godot/
- [e30] (reddit) "I’m a Unity dev and have never given Godot a try, but from my little perspective on Godot, isn’t Unity more advanced in almost every way, or am I missing something?" https://www.reddit.com/r/godot/comments/11zmedg/why_choose_godot_over_unity/
- [e31] (reddit) "They’re both built as flexible 2D and 3D Game engines, but Unity is just bigger in terms of features and has a wider selection of documentation and tutorials, so why would game devs choose Godot over Unity?" https://www.reddit.com/r/godot/comments/11zmedg/why_choose_godot_over_unity/

Run 20261117-205623-425e65, 2026-11-17T18:56:23.700Z
