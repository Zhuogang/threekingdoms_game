# First-hour playtest (QA-01)

Use a fresh browser profile, scenario 190, Cao Cao and the default manual battle setting. Do not open the Wiki during the task. Repeat in Chinese. The observer records answers and pauses without coaching the player.

1. Read the house cards. Explain why you chose Cao Cao and identify his starting cities.
2. Click Chenliu on the map, open **City affairs → Improve farmland**, review the resource changes, and **Confirm order**. Verify the return to affairs. Go back to the city and open **Officers in the city → choose an officer → Train**; confirm and verify the return to that officer. Try opening another order and pressing Esc without confirming: no resource or work point should be spent. Explain the monthly work quota and what happens to it when officers leave.
3. Return to the city overview and open **March out**. Choose officers, select Luoyang, review defenders and provisions, and **Confirm march**. Verify that the window closes, the map position stays fixed, and an army marker appears. A capital march must depart directly.
4. Open **Marches & orders** from the map dock. Identify the marching force, its ETA, and its source. Advance to an event. Explain each pause before acknowledging it.
5. During a battle, return to the campaign and work in an uncommitted city. Open the army's order card to return to the battle.
6. Move, attack and wait with individual officers. Use a tactic, inspect water and weather, and end a battle day with one ready unit. Confirm that the warning makes sense.
7. Repeat a battle day with the keyboard: select the map, use arrows and Enter to move, Tab to cycle ready officers, W to wait, E to end the day and Esc to cancel.
8. Read the aftermath. Account for starting troops, losses, surviving troops, every officer's fate, the city result, loot and the return ETA. Dismiss it and find the order again.
9. Continue through two campaign months. Review the monthly net changes in the inbox. Find a rival battle in the world chronicle; it must not require acknowledgement to advance.
10. Save, reload, export, switch language, and resume. Confirm that no resources, officers, orders or battle submissions disappear or repeat.

Pass only if the player captures or seriously contests a city, encounters no state in which every useful action is blocked, and can explain every pause without help. Record elapsed time, campaign dates, pauses, unexpected outcomes and the player's explanations in the [player test record](../next-steps.md#player-test-record).

The development Campaign menu provides `battle`, `rival-battle`, `ruler-captured`, `shortage` and `many-reports` fixtures for targeted follow-up. `?debug=1` exposes a frozen state snapshot and the real command boundary as `window.__V03_PLAYTEST__`. These facilities are excluded from production.

This script and the automated browser walkthrough are preparation for a fresh-player test. They do not certify comprehension, four human twelve-month sessions, actual low-end hardware, or artwork approval.
