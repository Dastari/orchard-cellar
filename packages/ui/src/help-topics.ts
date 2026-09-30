export interface HelpIllustration {
  readonly itemKind: string;
  readonly caption: string;
}
export interface HelpTopic {
  readonly title: string;
  readonly entries: readonly string[];
  readonly illustrations?: readonly HelpIllustration[];
}

/** Player instructions only. Patterns and ingredient lists belong in the recipe book. */
export const HELP_TOPICS: readonly HelpTopic[] = [
  { title: 'MOVEMENT', entries: [
    'WASD or arrows: move in eight directions. On touch devices, drag the left thumb pad.',
    'Hold Shift while moving to sprint. Sprinting spends Vigour; pause to recover when you run low.',
    '1-0: select a hotbar slot; 0 is the tenth slot.',
    '- / + or the world mouse wheel: change world zoom. Shift - / + changes interface scale.',
    'Use Settings to adjust sound, display and touch controls. The menu offers full screen on supported browsers.',
  ] },
  { title: 'ACTIONS', entries: [
    'E: use a nearby interaction, such as a chest, NPC, workbench, horse, doorway or pickup.',
    'F: swing an axe, sword, pickaxe or hoe toward where you face. Other selected items use their highlighted target.',
    'The touch E and F buttons perform the same actions. Read the nearby action hint when several interactions are available.',
    'Left-click a player or NPC to select them; click empty ground to clear the selection.',
    'Q: drop the selected hotbar item. Tools, food and placeables have different uses; their descriptions explain them.',
  ] },
  { title: 'WINDOWS', entries: [
    'I: inventory. C: crafting. P: Character. K: Skills. L: Quest Log. O: Expedition Rewards.',
    'Hold Tab to show online players; release it to close the list. The player-list button keeps the list open for interaction.',
    'Enter or / opens chat. N: toggle nameplates. Z: hide or restore the interface.',
    'Esc: close the current window, go back, or open the menu when no window is open.',
    'Scroll a page with the wheel or its scrollbar. Page Up and Page Down move by a page; Home and End move to its ends.',
    'Stone-tinted players with a pulsing lightning nameplate are offline and cannot interact.',
  ] },
  { title: 'CHAT AND COMMANDS', entries: [
    'Plain messages go to general chat. /say makes a nearby speech bubble; /shout or /yell carries a bubble farther.',
    '/whisper, /tell or /w followed by a player name sends a private message. /reply or /r answers the last incoming whisper.',
    'Tab completes chat predictions; Up and Down choose between them. Tab used inside chat belongs to chat, not the player list.',
    'The speech-bubble button collapses chat and turns green for unread messages.',
    '/baltop shows the leading player balances privately in your chat.',
  ] },
  { title: 'HELP BOOK', entries: [
    'Choose a chapter tab, then a topic on the left page. The right page explains that topic and shows relevant tools or machines.',
    'Up and Down choose topics. Left and Right, or Q and E, turn to the previous or next topic. Scroll long pages to read the rest.',
    'Escape or the close button returns to the menu. This guide covers the activities available now.',
    'Recipe patterns live in the separate recipe book opened from crafting. This guide explains activities without listing recipes.',
  ] },
  { title: 'INVENTORY', entries: [
    'Click a stack to hold it, then click a valid slot to place or swap it. Right-click takes half a stack or places one held item.',
    'A held stack stays on the cursor after mouse release. Left-drag over slots splits it evenly; right-drag places one in each.',
    'Shift-click moves a stack between the available containers. Double-click gathers matching items; double Shift-click moves matching stacks.',
    'Hover a slot and press 1-0 to swap it with that hotbar slot. Q drops one item; Control-Q drops the stack.',
    'Use the filter to find carried items and the sort button to tidy them. A backpack adds carried storage; equipment slots accept their matching item types.',
  ], illustrations: [{ itemKind: 'backpack', caption: 'A backpack expands your carried storage.' }, { itemKind: 'chest', caption: 'Placed chests hold goods separately from your pack.' }] },
  { title: 'CRAFTING', entries: [
    'Press C to open the crafting grid, or use a placed workbench with E. The small book button opens your recipe guide.',
    'Choose a known pattern in the recipe book to fill an empty grid from carried materials. You can also arrange items yourself.',
    'A recipe book teaches and records patterns; carrying a book is not permission to craft. Ordinary patterns work even before they appear in your guide.',
    'Some special recipes require learned knowledge or a skill. Their requirement still applies, as do nearby stations and materials.',
    'Take the result to craft one item. Shift-click the result repeats while materials and storage allow. If the result is unavailable, read the requirement below the grid.',
    'New farmers begin with basic wooden-tool and workbench patterns in their guide. Books, plans and discoveries add more patterns as you explore.',
  ], illustrations: [{ itemKind: 'workbench', caption: 'Workbench: stand nearby to make items that need this station.' }] },
  { title: 'TOOLS AND REPAIR', entries: [
    'Use an axe for trees, a pickaxe for ore, a hoe for soil, a watering can for crops, and a rod for fishing.',
    'A successful tool contact spends Vigour and durability. Misses and rejected actions do not wear the tool.',
    'Durability bars change from green to gold to red. A broken tool stays in its slot until repaired.',
    'Select a damaged tool and press E while facing an anvil. A full repair costs 5 copper coins; it does not consume the tool.',
    'Read item descriptions for tool strength, equipment slots and special uses. Better mining tools can work harder veins.',
  ], illustrations: [{ itemKind: 'axe', caption: 'Select the tool for the job.' }, { itemKind: 'anvil', caption: 'Anvil: repair your selected worn tool here.' }] },
  { title: 'FURNACE', entries: [
    'Place a furnace and press E nearby to open it. Put a supported material in its input slot and fuel in the fuel slot.',
    'The furnace works automatically when it has a valid input and fuel. Its progress display shows the current conversion.',
    'Collect finished goods from the output slot and keep inputs supplied for further work. Output slots are for collecting, not storing unrelated items.',
    'Smelting turns suitable ore into metal bars. The furnace also processes its supported clay and sand materials.',
  ], illustrations: [{ itemKind: 'furnace', caption: 'Furnace: input and fuel become finished goods in the output slot.' }] },
  { title: 'COOKING FIRES', entries: [
    'Campfires, cooking fires and the cooking range provide cooking slots. Press E nearby to open the station.',
    'Put suitable raw meat or fish in the input slot. Cooking starts automatically; take cooked food from the output when it is ready.',
    'Read the progress display before collecting. Keep the output clear to make room for more food.',
    'Food descriptions explain what eating it restores. Cooking and crafting are separate activities; their guides and slots show what they accept.',
  ], illustrations: [
    { itemKind: 'campfire', caption: 'Campfire: cook supported meat and fish.' },
    { itemKind: 'camp_cooking_fire', caption: 'Camp cooking fire: another cooking station.' },
    { itemKind: 'cooking_fire', caption: 'Cooking fire: collect meals from its output.' },
    { itemKind: 'furniture_rustic_cooking_range', caption: 'Cooking range: a cooking station for the home.' },
  ] },
  { title: 'FRUIT PRESS', entries: [
    'Bring harvested fruit to a placed fruit press and open it with E. Put supported fruit into its input.',
    'Pressing starts automatically. When it finishes, collect the must and pomace from their output slots.',
    'Must continues the cellar chain in a fermentation cask. Pomace is useful for composting and crop care.',
    'Watch the progress display, supply input and clear output slots to keep production moving.',
  ], illustrations: [{ itemKind: 'fruit_press', caption: 'Fruit → fruit press → must and pomace.' }] },
  { title: 'FERMENTATION CASK', entries: [
    'A fermentation cask turns suitable must into bottled goods. Place it, open it with E and add must to its input.',
    'Fermentation starts automatically when enough input is present. It takes time; the progress display shows the current work.',
    'Collect finished bottles from the output. You can leave the station while it works and return later.',
    'Bottled goods can be useful for selling and fulfilling requests. Read merchants and quest objectives to find where your produce is wanted.',
  ], illustrations: [{ itemKind: 'fermentation_cask', caption: 'Must → fermentation cask → bottled goods.' }] },
  { title: 'PRESERVING BARREL', entries: [
    'Open a placed preserving barrel with E and fill it with goods accepted by its processing slots.',
    'Use its batch action to begin preserving. The station shows the allowed batch size and progress; input must fit the same supported process.',
    'Preserved crops are food and trade goods. A barrel can also process supported hides into leather.',
    'Read the station buttons before collecting or cancelling a batch. Make pack space for finished goods and do not mix incompatible inputs.',
  ], illustrations: [{ itemKind: 'barrel', caption: 'Preserving barrel: load a supported batch, start it, then collect the result.' }] },
  { title: 'BUILDING AND HOMESTEADS', entries: [
    'Buy a homestead deed from Marlow. Each farmer can claim one; deeds cannot be dropped or sold.',
    'On the overworld, select the homestead deed, aim at a clear grass site and press F. A white footprint is valid; red means the site is blocked.',
    'The deed is used only when founding succeeds. Enter through your homestead marker and use its exit to return.',
    'Select a placeable from your pack, aim at a valid highlighted tile and press F. Buildings, furniture and stations need room and suitable ground.',
    'Your estate includes a garden, residence and cellar. Home improvements add useful space. Use the player list to manage the visitor roles available at your homestead.',
  ], illustrations: [{ itemKind: 'workbench', caption: 'Place stations where you can reach them and work nearby.' }] },
  { title: 'FARMING', entries: [
    'Select a hoe and target grass to till a plot. Right-click tilled soil to restore grass when the plot is clear.',
    'Plant suitable seeds on your prepared soil, then water it with the watering can. Read seed descriptions and shops for what you can grow.',
    'Watch your crops as they grow and harvest them when ready. Rain helps water plots; winter pauses ordinary crop growth.',
    'Compost supports crop care. Crops can become food, preserving batches, merchant goods or village-order deliveries.',
    'Neighbouring soil joins into larger plots, so leave room to tend the garden and reach every crop.',
  ], illustrations: [{ itemKind: 'hoe', caption: 'Prepare soil, plant, water and harvest.' }, { itemKind: 'watering_can', caption: 'Water your growing plots.' }] },
  { title: 'ORCHARD', entries: [
    'Ripe fruit trees can be picked for fruit without chopping them down. After picking, a mature tree ripens again.',
    'Harvesting fruit can also yield a matching seed. Plant tree seeds on suitable grass or tilled ground and give the tree room to grow.',
    'An axe fells a tree for wood; a ripe tree also yields its fruit when felled. Keeping mature trees gives you a renewable orchard.',
    'Eat fruit, sell it, use it for requests, or take supported fruit to the press to begin cellar production.',
  ], illustrations: [{ itemKind: 'apple', caption: 'Fruit trees support a repeating harvest and cellar production.' }] },
  { title: 'MINING AND CELLARS', entries: [
    'Use a pickaxe on a rock or ore vein. Ore veins take repeated work; harder deposits need a suitable mining tool.',
    'Mining yields stone, ore or fragments. The recipe guide shows available material patterns; furnaces process supported ore.',
    'Surface deposits become depleted and later return elsewhere, so explore for new places to mine.',
    'In your homestead cellar, select a pickaxe and left-click an exposed wall to excavate it. Clear walls to expand your useful underground space.',
    'Successful mining develops your Farming track, which includes the mining profession.',
  ], illustrations: [{ itemKind: 'pickaxe', caption: 'Mine surface deposits and excavate your cellar.' }] },
  { title: 'FISHING', entries: [
    'Select a fishing rod and target a nearby clear water tile. Fish shadows mark productive pools.',
    'Cast at a pool and wait for the fishing progress bar. There is no timing minigame: complete the cast to reel in your catch.',
    'Pools hold a limited number of catches and later appear elsewhere. Other farmers can use the same pools.',
    'Fish can be sold or cooked. Successful catches develop the Farming track.',
  ], illustrations: [{ itemKind: 'fishing_rod', caption: 'Find fish shadows, cast, wait and collect your catch.' }] },
  { title: 'WILDLIFE AND ANIMALS', entries: [
    'Wildlife lives around its preferred habitats. Animals and birds settle at night; bees return to their hives.',
    'Some animals provide useful meat, hides or other goods. Read item and interaction hints to see what you can gather.',
    'Hives slowly gather honey. Give wildlife room and pay attention to creatures that can hurt you.',
    'Horses provide travel rather than tool use; dismount when you want to gather, craft or enter an interior.',
  ] },
  { title: 'WEATHER AND TIME', entries: [
    'Days, nights and seasons pass as you play. The time and weather display helps you plan work and travel.',
    'Rain waters crops and helps tree regrowth. Winter pauses ordinary crop growth, so plan supplies for the season.',
    'Daylight changes through the seasons. Wind moves trees, grass and leaves; clouds and rain can make the world darker.',
    'Carry a light for dark places. Equip a lantern or torch in the Off Hand slot and press F to switch it on or off.',
  ], illustrations: [{ itemKind: 'torch', caption: 'Carry light for nights, interiors and cellars.' }] },
  { title: 'HORSES AND TRAVEL', entries: [
    'Use a horse to ride; only one player can mount it at a time. Riding is faster than walking.',
    'Space: jump while mounted. Horses can cross short freshwater gaps but cannot jump unsafe landings, cliffs, waterfalls or ocean.',
    'Tools and dropping items are unavailable while mounted. Dismount before entering tents, interiors, caves or underground spaces.',
    'Use nearby doors, gates, portals and travel interactions with E. Read a ferry or doorway prompt before choosing a destination.',
    'Press E at a fence gate to open or close it. Keep paths and entrances clear when placing things.',
  ] },
  { title: 'DIALOGUE AND TRADE', entries: [
    'Press E near an NPC to talk. Read responses and choose with their buttons or the numbered conversation keys.',
    'In a shop, switch between Buy and Sell, choose an item and quantity, then confirm. Check the price and your available goods before committing.',
    'Shift-click quantity controls to change ten at once; Control-click jumps to the minimum or maximum.',
    'Coins are kept in your purse as gold, silver and bronze, rather than occupying inventory slots.',
    'Nearby players can trade goods and coins through a trade window. Review both offers before confirming; changing an offer requires confirmation again.',
  ] },
  { title: 'QUESTS AND ORDERS', entries: [
    'Talk to NPCs to find quests and useful requests. L opens your Quest Log with objectives, progress and rewards.',
    'Select a quest to inspect it, track it on screen or abandon it. Some quests become available after earlier tasks.',
    'Village orders are repeatable requests for useful farm and cellar goods. Deliver the requested goods to the appropriate merchant.',
    'Delivering a variety of goods reaches milestones that can teach special meal patterns. Read your progress and objectives to see what remains.',
    'Your Records chapter tracks activities over your character\'s lifetime and helps you see your progress.',
  ] },
  { title: 'VITALS AND FOOD', entries: [
    'Health measures how much harm you can take. Vigour powers effort such as sprinting and successful tool work; Hunger supports that effort.',
    'Food restores Hunger. Read an item\'s description before eating it; fruit and prepared foods can provide additional benefits.',
    'Select food and use its action to eat or drink it. Take breaks and carry provisions before a long gathering trip or expedition.',
    'Character shows your vitals, attributes and equipment. Gear and learned skills can affect your abilities; their descriptions explain their benefits.',
    'Losing all Health knocks you out. You keep your items, so recover and prepare before returning to danger.',
  ] },
  { title: 'SKILLS AND EQUIPMENT', entries: [
    'Doing activities and completing quests develops Farming, Explorer and Combat experience. Each track has its own levels and skill points.',
    'K opens Skills. Choose a track and read a node\'s effects, prerequisites and cost before learning a rank.',
    'P opens Character for appearance, equipment, attributes, vitals and experience. Equip gear only in its matching slot.',
    'Skills and equipment can improve gathering, travel, combat and estate work. Read any preview labels rather than assuming an unavailable effect is active.',
    'Records and your quest progress show what you have achieved; progression comes from doing things rather than waiting.',
  ] },
  { title: 'COMBAT AND EXPEDITIONS', entries: [
    'Hostile creatures live in danger regions and expeditions. There is no player-versus-player combat; prepare tools, weapons and provisions before entering danger.',
    'Select a melee weapon and use F to swing where you face. Hold the left mouse button with a bow to draw, then release toward your target.',
    'Bows need arrows in carried storage. Keep enough ammunition and check weapon durability before setting out.',
    'Clearing an outdoor camp grants Combat experience and saves its material rewards until collected. Press O to collect them; make pack space and retry if needed.',
    'Read enemy movement and attack warnings, avoid getting surrounded and recover between fights.',
  ] },
  { title: 'DELVES', entries: [
    'A Delve is a private run entered through its travel prompt. Confirm when you are ready, then clear rooms, choose a boon and pick the next door.',
    'Run boons help during that run. Guardian rooms test your preparation and choices.',
    'Run-only items and boons do not leave the Delve. Your normal vitals and supplies return when you exit, rather than becoming expedition loot.',
    'A first complete victory teaches a lasting decorative keepsake pattern for your residence. The recipe book records that discovery.',
    'Use the exit action if you want to leave a run. Read room and reward prompts before choosing.',
  ] },
];
