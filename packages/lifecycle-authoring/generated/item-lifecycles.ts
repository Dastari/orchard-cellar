/* This file is generated from validated Orchard lifecycle source. Do not edit. */
import { defineItemOnUse, defineItemOnUseHandlers, type AnyHandlerRegistration } from '@orchard/sim';

export const AUTHORED_LIFECYCLE_BUNDLE_SHA256 = "ae8df218d8e82d118f7577b738bff25fcce78f6467c4b38eb880e2f24b8b5b75" as const;

export const AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS: readonly AnyHandlerRegistration[] = Object.freeze([
  ...defineItemOnUseHandlers({
    itemId: "item:anvil",
    id: "item:anvil.place",
    prompt: "PLACE ANVIL",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:anvil', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:apple",
    id: "item:apple.on_use",
    prompt: "EAT APPLE",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:apple_seed",
    id: "item.apple-seed.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:axe",
    id: "item:axe.world_tool",
    prompt: "USE AXE",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else if (target.definitionId === 'object:chest') {
          context.emit({ worldTool: { action: 'target' } });
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:barn",
    id: "item:barn.place",
    prompt: "PLACE BARN",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:barn', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:barrel",
    id: "item:barrel.place",
    prompt: "PLACE BARREL",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:barrel', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:beetroot",
    id: "item:beetroot.on_use",
    prompt: "EAT BEETROOT",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:beetroot_seeds",
    id: "item.beetroot-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:boat",
    id: "item:boat.place",
    prompt: "LAUNCH BOAT",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnNpc: { definitionId: 'npc:boat', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:bob_fast_strawberry_seeds",
    id: "item.bob-fast-strawberry-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:bow",
    id: "item:bow.on_use",
    prompt: "USE BOW",
    triggers: ["useWith","aimedUse"] as const,
    run(context) {
      if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else if (context.event.type === 'aimedUse') {
        if (context.event.phase === 'begin') context.emit({ bowAction: { phase: 'begin' } });
        else if (context.event.phase === 'cancel') {
          context.emit({ bowAction: { phase: 'cancel', chargeMs: context.event.chargeMs } });
        } else {
          context.emit({ bowAction: {
            phase: 'fire',
            aimX: context.event.aimX,
            aimY: context.event.aimY,
            chargeMs: context.event.chargeMs,
          } });
        }
      } else context.pass();
    },
  }),
  defineItemOnUse({
    itemId: "item:cabbage",
    id: "item:cabbage.on_use",
    prompt: "EAT CABBAGE",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:cabbage_seeds",
    id: "item.cabbage-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:camp_cooking_fire",
    id: "item:camp_cooking_fire.place",
    prompt: "PLACE CAMP COOKING FIRE",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:camp_cooking_fire', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:campfire",
    id: "item:campfire.place",
    prompt: "PLACE CAMPFIRE",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:campfire', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:carrot",
    id: "item:carrot.on_use",
    prompt: "EAT CARROT",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:carrot_seeds",
    id: "item.carrot-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:cherry",
    id: "item:cherry.on_use",
    prompt: "EAT CHERRIES",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:cherry_seed",
    id: "item.cherry-seed.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:chest",
    id: "item:chest.place",
    prompt: "PLACE CHEST",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:chest', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:cooked_beef",
    id: "item:cooked_beef.on_use",
    prompt: "EAT COOKED BEEF",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:cooked_chicken",
    id: "item:cooked_chicken.on_use",
    prompt: "EAT ROAST CHICKEN",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:cooked_fish",
    id: "item:cooked_fish.on_use",
    prompt: "EAT COOKED FISH",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:cooked_mutton",
    id: "item:cooked_mutton.on_use",
    prompt: "EAT ROAST MUTTON",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:cooked_pork",
    id: "item:cooked_pork.on_use",
    prompt: "EAT ROAST PORK",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:cooking_fire",
    id: "item:cooking_fire.place",
    prompt: "PLACE COOKING FIRE",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:cooking_fire', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:coop",
    id: "item:coop.place",
    prompt: "PLACE COOP",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:coop', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:copper_axe",
    id: "item:copper_axe.world_tool",
    prompt: "USE COPPER AXE",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else if (target.definitionId === 'object:chest') {
          context.emit({ worldTool: { action: 'target' } });
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:copper_hoe",
    id: "item:copper_hoe.on_use",
    prompt: "USE COPPER HOE",
    triggers: ["secondary","useWith","place"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else {
      if (context.event.type === 'place') {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ farmTool: { action: context.event.actionId === 'restore' ? 'restore' : 'use', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:copper_pickaxe",
    id: "item:copper_pickaxe.world_tool",
    prompt: "USE COPPER PICKAXE",
    triggers: ["secondary","useWith","useAt"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useAt') {
        const targetTile = context.tile;
        if (context.event.actionId !== 'dig_cellar' || targetTile === undefined) context.pass();
        else context.emit({ worldTool: { action: 'digCellar', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:copper_shovel",
    id: "item:copper_shovel.repair_at_anvil",
    prompt: "REPAIR COPPER SHOVEL",
    triggers: ["useWith"] as const,
    run(context) {
      if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
        || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
      else {
        const maximum = context.item.snapshot.state?.repairMaximum;
        const material = context.item.snapshot.state?.repairMaterial;
        const cost = context.item.snapshot.state?.repairCostBronze;
        const durability = context.item.snapshot.durability;
        if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
        else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
        else {
          context.player.consumeItem(material);
          context.emit({ chargeBronze: cost });
          context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:corn",
    id: "item:corn.on_use",
    prompt: "EAT CORN",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:corn_seeds",
    id: "item.corn-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:cucumber",
    id: "item:cucumber.on_use",
    prompt: "EAT CUCUMBER",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:cucumber_seeds",
    id: "item.cucumber-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:fence",
    id: "item:fence.place",
    prompt: "PLACE FENCE",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:fence', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:fence_gate",
    id: "item:fence_gate.place",
    prompt: "PLACE FENCE GATE",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:fence_gate', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:fermentation_cask",
    id: "item:fermentation_cask.place",
    prompt: "PLACE FERMENTATION CASK",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:fermentation_cask', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:fishing_handbook",
    id: "item:fishing_handbook.on_use",
    prompt: "READ",
    run(context) {
      const recipes = ['recipe:fishing_rod', 'process:cook_fish'];
      for (const recipe of recipes) {
        if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);
      }
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:fishing_rod",
    id: "item:fishing_rod.on_use",
    prompt: "FISH",
    triggers: ["useWith","useAt"] as const,
    run(context) {
      if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)
          || target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else if (context.event.type === 'useAt') {
        if (context.event.actionId === 'cast') {
          const targetTile = context.tile;
          if (targetTile === undefined) context.block('fishing_requires_water');
          else context.emit({ fishing: { action: 'cast', poolId: context.event.targetId, at: targetTile } });
        } else if (context.event.actionId === 'reel') context.emit({ fishing: { action: 'reel' } });
        else context.pass();
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:fruit_press",
    id: "item:fruit_press.place",
    prompt: "PLACE FRUIT PRESS",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:fruit_press', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:furnace",
    id: "item:furnace.place",
    prompt: "PLACE FURNACE",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:furnace', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:garlic",
    id: "item:garlic.on_use",
    prompt: "EAT GARLIC",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:garlic_seeds",
    id: "item.garlic-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:gold_axe",
    id: "item:gold_axe.world_tool",
    prompt: "USE GOLD AXE",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else if (target.definitionId === 'object:chest') {
          context.emit({ worldTool: { action: 'target' } });
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:gold_hoe",
    id: "item:gold_hoe.on_use",
    prompt: "USE GOLD HOE",
    triggers: ["secondary","useWith","place"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else {
      if (context.event.type === 'place') {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ farmTool: { action: context.event.actionId === 'restore' ? 'restore' : 'use', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:gold_pickaxe",
    id: "item:gold_pickaxe.world_tool",
    prompt: "USE GOLD PICKAXE",
    triggers: ["secondary","useWith","useAt"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useAt') {
        const targetTile = context.tile;
        if (context.event.actionId !== 'dig_cellar' || targetTile === undefined) context.pass();
        else context.emit({ worldTool: { action: 'digCellar', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:gold_shovel",
    id: "item:gold_shovel.repair_at_anvil",
    prompt: "REPAIR GOLD SHOVEL",
    triggers: ["useWith"] as const,
    run(context) {
      if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
        || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
      else {
        const maximum = context.item.snapshot.state?.repairMaximum;
        const material = context.item.snapshot.state?.repairMaterial;
        const cost = context.item.snapshot.state?.repairCostBronze;
        const durability = context.item.snapshot.durability;
        if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
        else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
        else {
          context.player.consumeItem(material);
          context.emit({ chargeBronze: cost });
          context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:grape",
    id: "item:grape.on_use",
    prompt: "EAT GRAPES",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:grape_seeds",
    id: "item.grape-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:green_pepper",
    id: "item:green_pepper.on_use",
    prompt: "EAT GREEN PEPPER",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:green_pepper_seeds",
    id: "item.green-pepper-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:greenhouse",
    id: "item:greenhouse.place",
    prompt: "PLACE GREENHOUSE",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:greenhouse', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hammer",
    id: "item:hammer.repair_at_anvil",
    prompt: "REPAIR IRON HAMMER (5 COPPER)",
    triggers: ["useWith"] as const,
    run(context) {
      if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
        || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
      else {
        const maximum = context.item.snapshot.state?.repairMaximum;
        const material = context.item.snapshot.state?.repairMaterial;
        const cost = context.item.snapshot.state?.repairCostBronze;
        const durability = context.item.snapshot.durability;
        if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
        else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
        else {
          context.player.consumeItem(material);
          context.emit({ chargeBronze: cost });
          context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_common_bow",
    id: "item:hearth_common_bow.on_use",
    prompt: "USE BOW",
    triggers: ["useWith","aimedUse"] as const,
    run(context) {
      if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else if (context.event.type === 'aimedUse') {
        if (context.event.phase === 'begin') context.emit({ bowAction: { phase: 'begin' } });
        else if (context.event.phase === 'cancel') {
          context.emit({ bowAction: { phase: 'cancel', chargeMs: context.event.chargeMs } });
        } else {
          context.emit({ bowAction: {
            phase: 'fire',
            aimX: context.event.aimX,
            aimY: context.event.aimY,
            chargeMs: context.event.chargeMs,
          } });
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_common_sword",
    id: "item:hearth_common_sword.on_use",
    prompt: "USE SWORD",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') {
        context.emit({ worldTool: { action: 'swing' } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_epic_bow",
    id: "item:hearth_epic_bow.on_use",
    prompt: "USE BOW",
    triggers: ["useWith","aimedUse"] as const,
    run(context) {
      if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else if (context.event.type === 'aimedUse') {
        if (context.event.phase === 'begin') context.emit({ bowAction: { phase: 'begin' } });
        else if (context.event.phase === 'cancel') {
          context.emit({ bowAction: { phase: 'cancel', chargeMs: context.event.chargeMs } });
        } else {
          context.emit({ bowAction: {
            phase: 'fire',
            aimX: context.event.aimX,
            aimY: context.event.aimY,
            chargeMs: context.event.chargeMs,
          } });
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_epic_sword",
    id: "item:hearth_epic_sword.on_use",
    prompt: "USE SWORD",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') {
        context.emit({ worldTool: { action: 'swing' } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_legendary_bow",
    id: "item:hearth_legendary_bow.on_use",
    prompt: "USE BOW",
    triggers: ["useWith","aimedUse"] as const,
    run(context) {
      if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else if (context.event.type === 'aimedUse') {
        if (context.event.phase === 'begin') context.emit({ bowAction: { phase: 'begin' } });
        else if (context.event.phase === 'cancel') {
          context.emit({ bowAction: { phase: 'cancel', chargeMs: context.event.chargeMs } });
        } else {
          context.emit({ bowAction: {
            phase: 'fire',
            aimX: context.event.aimX,
            aimY: context.event.aimY,
            chargeMs: context.event.chargeMs,
          } });
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_legendary_sword",
    id: "item:hearth_legendary_sword.on_use",
    prompt: "USE SWORD",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') {
        context.emit({ worldTool: { action: 'swing' } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_rare_bow",
    id: "item:hearth_rare_bow.on_use",
    prompt: "USE BOW",
    triggers: ["useWith","aimedUse"] as const,
    run(context) {
      if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else if (context.event.type === 'aimedUse') {
        if (context.event.phase === 'begin') context.emit({ bowAction: { phase: 'begin' } });
        else if (context.event.phase === 'cancel') {
          context.emit({ bowAction: { phase: 'cancel', chargeMs: context.event.chargeMs } });
        } else {
          context.emit({ bowAction: {
            phase: 'fire',
            aimX: context.event.aimX,
            aimY: context.event.aimY,
            chargeMs: context.event.chargeMs,
          } });
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_rare_sword",
    id: "item:hearth_rare_sword.on_use",
    prompt: "USE SWORD",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') {
        context.emit({ worldTool: { action: 'swing' } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_uncommon_bow",
    id: "item:hearth_uncommon_bow.on_use",
    prompt: "USE BOW",
    triggers: ["useWith","aimedUse"] as const,
    run(context) {
      if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else if (context.event.type === 'aimedUse') {
        if (context.event.phase === 'begin') context.emit({ bowAction: { phase: 'begin' } });
        else if (context.event.phase === 'cancel') {
          context.emit({ bowAction: { phase: 'cancel', chargeMs: context.event.chargeMs } });
        } else {
          context.emit({ bowAction: {
            phase: 'fire',
            aimX: context.event.aimX,
            aimY: context.event.aimY,
            chargeMs: context.event.chargeMs,
          } });
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hearth_uncommon_sword",
    id: "item:hearth_uncommon_sword.on_use",
    prompt: "USE SWORD",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') {
        context.emit({ worldTool: { action: 'swing' } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hoe",
    id: "item:hoe.on_use",
    prompt: "USE HOE",
    triggers: ["secondary","useWith","place"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else {
      if (context.event.type === 'place') {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ farmTool: { action: context.event.actionId === 'restore' ? 'restore' : 'use', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:homestead_deed",
    id: "item:homestead_deed.place",
    prompt: "ESTABLISH HOMESTEAD",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ foundHomestead: { at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:hot_pepper",
    id: "item:hot_pepper.on_use",
    prompt: "EAT HOT PEPPER",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:hot_pepper_seeds",
    id: "item.hot-pepper-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:iron_axe",
    id: "item:iron_axe.world_tool",
    prompt: "USE IRON AXE",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else if (target.definitionId === 'object:chest') {
          context.emit({ worldTool: { action: 'target' } });
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:iron_hoe",
    id: "item:iron_hoe.on_use",
    prompt: "USE IRON HOE",
    triggers: ["secondary","useWith","place"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else {
      if (context.event.type === 'place') {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ farmTool: { action: context.event.actionId === 'restore' ? 'restore' : 'use', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:iron_pickaxe",
    id: "item:iron_pickaxe.world_tool",
    prompt: "USE IRON PICKAXE",
    triggers: ["secondary","useWith","useAt"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useAt') {
        const targetTile = context.tile;
        if (context.event.actionId !== 'dig_cellar' || targetTile === undefined) context.pass();
        else context.emit({ worldTool: { action: 'digCellar', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:iron_shovel",
    id: "item:iron_shovel.repair_at_anvil",
    prompt: "REPAIR IRON SHOVEL",
    triggers: ["useWith"] as const,
    run(context) {
      if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
        || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
      else {
        const maximum = context.item.snapshot.state?.repairMaximum;
        const material = context.item.snapshot.state?.repairMaterial;
        const cost = context.item.snapshot.state?.repairCostBronze;
        const durability = context.item.snapshot.durability;
        if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
        else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
        else {
          context.player.consumeItem(material);
          context.emit({ chargeBronze: cost });
          context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:janes_gardening_book",
    id: "item:janes_gardening_book.on_use",
    prompt: "READ",
    run(context) {
      const recipes = ['recipe:barrel', 'recipe:fermentation_cask', 'recipe:fruit_press', 'recipe:orchard_tea', 'recipe:planks', 'recipe:workbench'];
      for (const recipe of recipes) {
        if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);
      }
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:lantern",
    id: "item:lantern.equipment_use",
    prompt: "TOGGLE LANTERN",
    triggers: ["equipmentUse","worldItemUse"] as const,
    run(context) {
      const lit = context.item.snapshot.state?.lit !== false;
      context.emit({ toggleState: 'lit' });
      context.emit({ setLight: { enabled: !lit } });
    },
  }),
  defineItemOnUse({
    itemId: "item:leek",
    id: "item:leek.on_use",
    prompt: "EAT LEEK",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:leek_seeds",
    id: "item.leek-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:marlow_book",
    id: "item:marlow_book.on_use",
    prompt: "READ",
    run(context) {
      const recipes = ['recipe:amethyst_ore', 'recipe:arrows', 'recipe:backpack', 'recipe:boat', 'recipe:camp_cooking_fire', 'recipe:campfire', 'recipe:chest', 'recipe:cooking_fire', 'recipe:copper_ore', 'recipe:emerald_ore', 'recipe:fence', 'recipe:fence_gate', 'recipe:fishing_rod', 'recipe:furnace', 'recipe:gold_ore', 'recipe:iron_ore', 'recipe:planks', 'recipe:ruby_ore', 'recipe:sapphire_ore', 'recipe:sign', 'recipe:standing_torch', 'recipe:sticks', 'recipe:stone', 'recipe:string', 'recipe:topaz_ore', 'recipe:torch', 'recipe:watch', 'recipe:workbench'];
      for (const recipe of recipes) {
        if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);
      }
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:onion",
    id: "item:onion.on_use",
    prompt: "EAT ONION",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:onion_seeds",
    id: "item.onion-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:orchard_tea",
    id: "item:orchard_tea.on_use",
    prompt: "DRINK ORCHARD TEA",
    run(context) {
      context.item.applyEffect('orchard_tea');
      context.item.consume();
      context.emit({ statistic: 'orchard_tea_consumed' });
    },
  }),
  defineItemOnUse({
    itemId: "item:parsley",
    id: "item:parsley.on_use",
    prompt: "EAT PARSLEY",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:parsley_seeds",
    id: "item.parsley-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:peach",
    id: "item:peach.on_use",
    prompt: "EAT PEACH",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:peach_seed",
    id: "item.peach-seed.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:pear",
    id: "item:pear.on_use",
    prompt: "EAT PEAR",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:pear_seed",
    id: "item.pear-seed.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:pickaxe",
    id: "item:pickaxe.world_tool",
    prompt: "USE PICKAXE",
    triggers: ["secondary","useWith","useAt"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useAt') {
        const targetTile = context.tile;
        if (context.event.actionId !== 'dig_cellar' || targetTile === undefined) context.pass();
        else context.emit({ worldTool: { action: 'digCellar', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  defineItemOnUse({
    itemId: "item:potato",
    id: "item:potato.on_use",
    prompt: "EAT POTATO",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:potato_seeds",
    id: "item.potato-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:pumpkin",
    id: "item:pumpkin.on_use",
    prompt: "EAT PUMPKIN",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:pumpkin_seeds",
    id: "item.pumpkin-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  defineItemOnUse({
    itemId: "item:red_pepper",
    id: "item:red_pepper.on_use",
    prompt: "EAT RED PEPPER",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:red_pepper_seeds",
    id: "item.red-pepper-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:shed",
    id: "item:shed.place",
    prompt: "PLACE ESTATE SHED",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:shed', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:shovel",
    id: "item:shovel.repair_at_anvil",
    prompt: "REPAIR WOODEN SHOVEL",
    triggers: ["useWith"] as const,
    run(context) {
      if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
        || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
      else {
        const maximum = context.item.snapshot.state?.repairMaximum;
        const material = context.item.snapshot.state?.repairMaterial;
        const cost = context.item.snapshot.state?.repairCostBronze;
        const durability = context.item.snapshot.durability;
        if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
        else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
        else {
          context.player.consumeItem(material);
          context.emit({ chargeBronze: cost });
          context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:sign",
    id: "item:sign.place",
    prompt: "PLACE SIGN",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:sign', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:silo",
    id: "item:silo.place",
    prompt: "PLACE SILO",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:silo', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:silver_axe",
    id: "item:silver_axe.world_tool",
    prompt: "USE SILVER AXE",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else if (target.definitionId === 'object:chest') {
          context.emit({ worldTool: { action: 'target' } });
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:silver_hoe",
    id: "item:silver_hoe.on_use",
    prompt: "USE SILVER HOE",
    triggers: ["secondary","useWith","place"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else {
      if (context.event.type === 'place') {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ farmTool: { action: context.event.actionId === 'restore' ? 'restore' : 'use', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:silver_pickaxe",
    id: "item:silver_pickaxe.world_tool",
    prompt: "USE SILVER PICKAXE",
    triggers: ["secondary","useWith","useAt"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useAt') {
        const targetTile = context.tile;
        if (context.event.actionId !== 'dig_cellar' || targetTile === undefined) context.pass();
        else context.emit({ worldTool: { action: 'digCellar', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:silver_shovel",
    id: "item:silver_shovel.repair_at_anvil",
    prompt: "REPAIR SILVER SHOVEL",
    triggers: ["useWith"] as const,
    run(context) {
      if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
        || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
      else {
        const maximum = context.item.snapshot.state?.repairMaximum;
        const material = context.item.snapshot.state?.repairMaterial;
        const cost = context.item.snapshot.state?.repairCostBronze;
        const durability = context.item.snapshot.durability;
        if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
        else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
        else {
          context.player.consumeItem(material);
          context.emit({ chargeBronze: cost });
          context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:sprinkler",
    id: "item:sprinkler.place",
    prompt: "PLACE SPRINKLER",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:sprinkler', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:standing_torch",
    id: "item:standing_torch.place",
    prompt: "PLACE STANDING TORCH",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:standing_torch', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:stone_axe",
    id: "item:stone_axe.world_tool",
    prompt: "USE STONE AXE",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else if (target.definitionId === 'object:chest') {
          context.emit({ worldTool: { action: 'target' } });
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:stone_hoe",
    id: "item:stone_hoe.on_use",
    prompt: "USE STONE HOE",
    triggers: ["secondary","useWith","place"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else {
      if (context.event.type === 'place') {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ farmTool: { action: context.event.actionId === 'restore' ? 'restore' : 'use', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:stone_pickaxe",
    id: "item:stone_pickaxe.world_tool",
    prompt: "USE STONE PICKAXE",
    triggers: ["secondary","useWith","useAt"] as const,
    run(context) {
      if (context.event.type === 'secondary') context.emit({ worldTool: { action: 'swing' } });
      else if (context.event.type === 'useAt') {
        const targetTile = context.tile;
        if (context.event.actionId !== 'dig_cellar' || targetTile === undefined) context.pass();
        else context.emit({ worldTool: { action: 'digCellar', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        const target = context.snapshot.target;
        if (target === undefined || !('entityType' in target)) context.pass();
        else if (target.definitionId === 'object:anvil') {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        } else context.emit({ worldTool: { action: 'target' } });
      } else context.pass();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:stone_shovel",
    id: "item:stone_shovel.repair_at_anvil",
    prompt: "REPAIR STONE SHOVEL",
    triggers: ["useWith"] as const,
    run(context) {
      if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
        || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
      else {
        const maximum = context.item.snapshot.state?.repairMaximum;
        const material = context.item.snapshot.state?.repairMaterial;
        const cost = context.item.snapshot.state?.repairCostBronze;
        const durability = context.item.snapshot.durability;
        if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
        else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
        else {
          context.player.consumeItem(material);
          context.emit({ chargeBronze: cost });
          context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:strawberry",
    id: "item:strawberry.on_use",
    prompt: "EAT STRAWBERRY",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:strawberry_seeds",
    id: "item.strawberry-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:sunflower_seeds",
    id: "item.sunflower-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:sword",
    id: "item:sword.on_use",
    prompt: "USE SWORD",
    triggers: ["secondary","useWith"] as const,
    run(context) {
      if (context.event.type === 'secondary') {
        context.emit({ worldTool: { action: 'swing' } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
    },
  }),
  defineItemOnUse({
    itemId: "item:tomato",
    id: "item:tomato.on_use",
    prompt: "EAT TOMATO",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:tomato_seeds",
    id: "item.tomato-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:torch",
    id: "item:torch.equipment_use",
    prompt: "TOGGLE TORCH",
    triggers: ["equipmentUse","worldItemUse"] as const,
    run(context) {
      const lit = context.item.snapshot.state?.lit !== false;
      context.emit({ toggleState: 'lit' });
      context.emit({ setLight: { enabled: !lit } });
    },
  }),
  defineItemOnUse({
    itemId: "item:turnip",
    id: "item:turnip.on_use",
    prompt: "EAT TURNIP",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:turnip_seeds",
    id: "item.turnip-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:watering_can",
    id: "item:watering_can.on_use",
    prompt: "WATER",
    triggers: ["useWith","place"] as const,
    run(context) {
      if (context.event.type === 'place') {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ farmTool: { action: 'use', at: targetTile } });
      } else if (context.event.type === 'useWith') {
        if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
          || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
        else {
          const maximum = context.item.snapshot.state?.repairMaximum;
          const material = context.item.snapshot.state?.repairMaterial;
          const cost = context.item.snapshot.state?.repairCostBronze;
          const durability = context.item.snapshot.durability;
          if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
          else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
          else {
            context.player.consumeItem(material);
            context.emit({ chargeBronze: cost });
            context.item.repair();
            context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
          }
        }
      } else context.pass();
    },
  }),
  defineItemOnUse({
    itemId: "item:watermelon",
    id: "item:watermelon.on_use",
    prompt: "EAT WATERMELON",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:watermelon_seeds",
    id: "item.watermelon-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:wheat_seeds",
    id: "item.wheat-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:workbench",
    id: "item:workbench.place",
    prompt: "PLACE WORKBENCH",
    triggers: ["place"] as const,
    run(context) {
      if (context.event.type !== 'place') context.block('placement_tile_required');
      else {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('placement_tile_required');
        else {
          context.emit({ spawnObject: { definitionId: 'object:workbench', at: targetTile } });
          context.item.consume();
        }
      }
    },
  }),
  defineItemOnUse({
    itemId: "item:yellow_pepper",
    id: "item:yellow_pepper.on_use",
    prompt: "EAT YELLOW PEPPER",
    run(context) {
      const restored = context.item.snapshot.state?.foodRestoreCenti;
      if (typeof restored !== 'number') context.block('item_food_state_unavailable');
      else {
        const fruit = context.item.snapshot.state?.fruit === true;
        if (context.player.snapshot.vitals.hunger >= 10_000 && !fruit) context.block('hunger_full');
        else {
          context.item.consume();
          context.player.restoreHunger(restored);
          context.emit({ statistic: { kind: 'food_eaten', subject: context.item.snapshot.kind } });
          if (fruit) context.item.applyEffect('fruitful_energy');
        }
      }
    },
  }),
  ...defineItemOnUseHandlers({
    itemId: "item:yellow_pepper_seeds",
    id: "item.yellow-pepper-seeds.on-use",
    prompt: "PLANT SEEDS",
    triggers: ["place"] as const,
    run(context) {
      const targetTile = context.tile;
      if (targetTile === undefined) context.block('farm_tile_required');
      else context.emit({ plantSeed: targetTile });
      context.item.consume();
    },
  })
]);

export const AUTHORED_ITEM_LIFECYCLE_METADATA = Object.freeze([
  Object.freeze({"itemId":"item:anvil","event":"onUse","id":"item:anvil.place","prompt":"PLACE ANVIL","triggers":["place"]}),
  Object.freeze({"itemId":"item:apple","event":"onUse","id":"item:apple.on_use","prompt":"EAT APPLE","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:apple_seed","event":"onUse","id":"item.apple-seed.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:axe","event":"onUse","id":"item:axe.world_tool","prompt":"USE AXE","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:barn","event":"onUse","id":"item:barn.place","prompt":"PLACE BARN","triggers":["place"]}),
  Object.freeze({"itemId":"item:barrel","event":"onUse","id":"item:barrel.place","prompt":"PLACE BARREL","triggers":["place"]}),
  Object.freeze({"itemId":"item:beetroot","event":"onUse","id":"item:beetroot.on_use","prompt":"EAT BEETROOT","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:beetroot_seeds","event":"onUse","id":"item.beetroot-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:boat","event":"onUse","id":"item:boat.place","prompt":"LAUNCH BOAT","triggers":["place"]}),
  Object.freeze({"itemId":"item:bob_fast_strawberry_seeds","event":"onUse","id":"item.bob-fast-strawberry-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:bow","event":"onUse","id":"item:bow.on_use","prompt":"USE BOW","triggers":["useWith","aimedUse"]}),
  Object.freeze({"itemId":"item:cabbage","event":"onUse","id":"item:cabbage.on_use","prompt":"EAT CABBAGE","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cabbage_seeds","event":"onUse","id":"item.cabbage-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:camp_cooking_fire","event":"onUse","id":"item:camp_cooking_fire.place","prompt":"PLACE CAMP COOKING FIRE","triggers":["place"]}),
  Object.freeze({"itemId":"item:campfire","event":"onUse","id":"item:campfire.place","prompt":"PLACE CAMPFIRE","triggers":["place"]}),
  Object.freeze({"itemId":"item:carrot","event":"onUse","id":"item:carrot.on_use","prompt":"EAT CARROT","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:carrot_seeds","event":"onUse","id":"item.carrot-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:cherry","event":"onUse","id":"item:cherry.on_use","prompt":"EAT CHERRIES","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cherry_seed","event":"onUse","id":"item.cherry-seed.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:chest","event":"onUse","id":"item:chest.place","prompt":"PLACE CHEST","triggers":["place"]}),
  Object.freeze({"itemId":"item:cooked_beef","event":"onUse","id":"item:cooked_beef.on_use","prompt":"EAT COOKED BEEF","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cooked_chicken","event":"onUse","id":"item:cooked_chicken.on_use","prompt":"EAT ROAST CHICKEN","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cooked_fish","event":"onUse","id":"item:cooked_fish.on_use","prompt":"EAT COOKED FISH","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cooked_mutton","event":"onUse","id":"item:cooked_mutton.on_use","prompt":"EAT ROAST MUTTON","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cooked_pork","event":"onUse","id":"item:cooked_pork.on_use","prompt":"EAT ROAST PORK","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cooking_fire","event":"onUse","id":"item:cooking_fire.place","prompt":"PLACE COOKING FIRE","triggers":["place"]}),
  Object.freeze({"itemId":"item:coop","event":"onUse","id":"item:coop.place","prompt":"PLACE COOP","triggers":["place"]}),
  Object.freeze({"itemId":"item:copper_axe","event":"onUse","id":"item:copper_axe.world_tool","prompt":"USE COPPER AXE","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:copper_hoe","event":"onUse","id":"item:copper_hoe.on_use","prompt":"USE COPPER HOE","triggers":["secondary","useWith","place"]}),
  Object.freeze({"itemId":"item:copper_pickaxe","event":"onUse","id":"item:copper_pickaxe.world_tool","prompt":"USE COPPER PICKAXE","triggers":["secondary","useWith","useAt"]}),
  Object.freeze({"itemId":"item:copper_shovel","event":"onUse","id":"item:copper_shovel.repair_at_anvil","prompt":"REPAIR COPPER SHOVEL","triggers":["useWith"]}),
  Object.freeze({"itemId":"item:corn","event":"onUse","id":"item:corn.on_use","prompt":"EAT CORN","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:corn_seeds","event":"onUse","id":"item.corn-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:cucumber","event":"onUse","id":"item:cucumber.on_use","prompt":"EAT CUCUMBER","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:cucumber_seeds","event":"onUse","id":"item.cucumber-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:fence","event":"onUse","id":"item:fence.place","prompt":"PLACE FENCE","triggers":["place"]}),
  Object.freeze({"itemId":"item:fence_gate","event":"onUse","id":"item:fence_gate.place","prompt":"PLACE FENCE GATE","triggers":["place"]}),
  Object.freeze({"itemId":"item:fermentation_cask","event":"onUse","id":"item:fermentation_cask.place","prompt":"PLACE FERMENTATION CASK","triggers":["place"]}),
  Object.freeze({"itemId":"item:fishing_handbook","event":"onUse","id":"item:fishing_handbook.on_use","prompt":"READ","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:fishing_rod","event":"onUse","id":"item:fishing_rod.on_use","prompt":"FISH","triggers":["useWith","useAt"]}),
  Object.freeze({"itemId":"item:fruit_press","event":"onUse","id":"item:fruit_press.place","prompt":"PLACE FRUIT PRESS","triggers":["place"]}),
  Object.freeze({"itemId":"item:furnace","event":"onUse","id":"item:furnace.place","prompt":"PLACE FURNACE","triggers":["place"]}),
  Object.freeze({"itemId":"item:garlic","event":"onUse","id":"item:garlic.on_use","prompt":"EAT GARLIC","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:garlic_seeds","event":"onUse","id":"item.garlic-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:gold_axe","event":"onUse","id":"item:gold_axe.world_tool","prompt":"USE GOLD AXE","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:gold_hoe","event":"onUse","id":"item:gold_hoe.on_use","prompt":"USE GOLD HOE","triggers":["secondary","useWith","place"]}),
  Object.freeze({"itemId":"item:gold_pickaxe","event":"onUse","id":"item:gold_pickaxe.world_tool","prompt":"USE GOLD PICKAXE","triggers":["secondary","useWith","useAt"]}),
  Object.freeze({"itemId":"item:gold_shovel","event":"onUse","id":"item:gold_shovel.repair_at_anvil","prompt":"REPAIR GOLD SHOVEL","triggers":["useWith"]}),
  Object.freeze({"itemId":"item:grape","event":"onUse","id":"item:grape.on_use","prompt":"EAT GRAPES","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:grape_seeds","event":"onUse","id":"item.grape-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:green_pepper","event":"onUse","id":"item:green_pepper.on_use","prompt":"EAT GREEN PEPPER","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:green_pepper_seeds","event":"onUse","id":"item.green-pepper-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:greenhouse","event":"onUse","id":"item:greenhouse.place","prompt":"PLACE GREENHOUSE","triggers":["place"]}),
  Object.freeze({"itemId":"item:hammer","event":"onUse","id":"item:hammer.repair_at_anvil","prompt":"REPAIR IRON HAMMER (5 COPPER)","triggers":["useWith"]}),
  Object.freeze({"itemId":"item:hearth_common_bow","event":"onUse","id":"item:hearth_common_bow.on_use","prompt":"USE BOW","triggers":["useWith","aimedUse"]}),
  Object.freeze({"itemId":"item:hearth_common_sword","event":"onUse","id":"item:hearth_common_sword.on_use","prompt":"USE SWORD","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:hearth_epic_bow","event":"onUse","id":"item:hearth_epic_bow.on_use","prompt":"USE BOW","triggers":["useWith","aimedUse"]}),
  Object.freeze({"itemId":"item:hearth_epic_sword","event":"onUse","id":"item:hearth_epic_sword.on_use","prompt":"USE SWORD","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:hearth_legendary_bow","event":"onUse","id":"item:hearth_legendary_bow.on_use","prompt":"USE BOW","triggers":["useWith","aimedUse"]}),
  Object.freeze({"itemId":"item:hearth_legendary_sword","event":"onUse","id":"item:hearth_legendary_sword.on_use","prompt":"USE SWORD","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:hearth_rare_bow","event":"onUse","id":"item:hearth_rare_bow.on_use","prompt":"USE BOW","triggers":["useWith","aimedUse"]}),
  Object.freeze({"itemId":"item:hearth_rare_sword","event":"onUse","id":"item:hearth_rare_sword.on_use","prompt":"USE SWORD","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:hearth_uncommon_bow","event":"onUse","id":"item:hearth_uncommon_bow.on_use","prompt":"USE BOW","triggers":["useWith","aimedUse"]}),
  Object.freeze({"itemId":"item:hearth_uncommon_sword","event":"onUse","id":"item:hearth_uncommon_sword.on_use","prompt":"USE SWORD","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:hoe","event":"onUse","id":"item:hoe.on_use","prompt":"USE HOE","triggers":["secondary","useWith","place"]}),
  Object.freeze({"itemId":"item:homestead_deed","event":"onUse","id":"item:homestead_deed.place","prompt":"ESTABLISH HOMESTEAD","triggers":["place"]}),
  Object.freeze({"itemId":"item:hot_pepper","event":"onUse","id":"item:hot_pepper.on_use","prompt":"EAT HOT PEPPER","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:hot_pepper_seeds","event":"onUse","id":"item.hot-pepper-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:iron_axe","event":"onUse","id":"item:iron_axe.world_tool","prompt":"USE IRON AXE","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:iron_hoe","event":"onUse","id":"item:iron_hoe.on_use","prompt":"USE IRON HOE","triggers":["secondary","useWith","place"]}),
  Object.freeze({"itemId":"item:iron_pickaxe","event":"onUse","id":"item:iron_pickaxe.world_tool","prompt":"USE IRON PICKAXE","triggers":["secondary","useWith","useAt"]}),
  Object.freeze({"itemId":"item:iron_shovel","event":"onUse","id":"item:iron_shovel.repair_at_anvil","prompt":"REPAIR IRON SHOVEL","triggers":["useWith"]}),
  Object.freeze({"itemId":"item:janes_gardening_book","event":"onUse","id":"item:janes_gardening_book.on_use","prompt":"READ","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:lantern","event":"onUse","id":"item:lantern.equipment_use","prompt":"TOGGLE LANTERN","triggers":["equipmentUse","worldItemUse"]}),
  Object.freeze({"itemId":"item:leek","event":"onUse","id":"item:leek.on_use","prompt":"EAT LEEK","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:leek_seeds","event":"onUse","id":"item.leek-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:marlow_book","event":"onUse","id":"item:marlow_book.on_use","prompt":"READ","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:onion","event":"onUse","id":"item:onion.on_use","prompt":"EAT ONION","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:onion_seeds","event":"onUse","id":"item.onion-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:orchard_tea","event":"onUse","id":"item:orchard_tea.on_use","prompt":"DRINK ORCHARD TEA","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:parsley","event":"onUse","id":"item:parsley.on_use","prompt":"EAT PARSLEY","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:parsley_seeds","event":"onUse","id":"item.parsley-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:peach","event":"onUse","id":"item:peach.on_use","prompt":"EAT PEACH","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:peach_seed","event":"onUse","id":"item.peach-seed.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:pear","event":"onUse","id":"item:pear.on_use","prompt":"EAT PEAR","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:pear_seed","event":"onUse","id":"item.pear-seed.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:pickaxe","event":"onUse","id":"item:pickaxe.world_tool","prompt":"USE PICKAXE","triggers":["secondary","useWith","useAt"]}),
  Object.freeze({"itemId":"item:potato","event":"onUse","id":"item:potato.on_use","prompt":"EAT POTATO","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:potato_seeds","event":"onUse","id":"item.potato-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:pumpkin","event":"onUse","id":"item:pumpkin.on_use","prompt":"EAT PUMPKIN","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:pumpkin_seeds","event":"onUse","id":"item.pumpkin-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:red_pepper","event":"onUse","id":"item:red_pepper.on_use","prompt":"EAT RED PEPPER","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:red_pepper_seeds","event":"onUse","id":"item.red-pepper-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:shed","event":"onUse","id":"item:shed.place","prompt":"PLACE ESTATE SHED","triggers":["place"]}),
  Object.freeze({"itemId":"item:shovel","event":"onUse","id":"item:shovel.repair_at_anvil","prompt":"REPAIR WOODEN SHOVEL","triggers":["useWith"]}),
  Object.freeze({"itemId":"item:sign","event":"onUse","id":"item:sign.place","prompt":"PLACE SIGN","triggers":["place"]}),
  Object.freeze({"itemId":"item:silo","event":"onUse","id":"item:silo.place","prompt":"PLACE SILO","triggers":["place"]}),
  Object.freeze({"itemId":"item:silver_axe","event":"onUse","id":"item:silver_axe.world_tool","prompt":"USE SILVER AXE","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:silver_hoe","event":"onUse","id":"item:silver_hoe.on_use","prompt":"USE SILVER HOE","triggers":["secondary","useWith","place"]}),
  Object.freeze({"itemId":"item:silver_pickaxe","event":"onUse","id":"item:silver_pickaxe.world_tool","prompt":"USE SILVER PICKAXE","triggers":["secondary","useWith","useAt"]}),
  Object.freeze({"itemId":"item:silver_shovel","event":"onUse","id":"item:silver_shovel.repair_at_anvil","prompt":"REPAIR SILVER SHOVEL","triggers":["useWith"]}),
  Object.freeze({"itemId":"item:sprinkler","event":"onUse","id":"item:sprinkler.place","prompt":"PLACE SPRINKLER","triggers":["place"]}),
  Object.freeze({"itemId":"item:standing_torch","event":"onUse","id":"item:standing_torch.place","prompt":"PLACE STANDING TORCH","triggers":["place"]}),
  Object.freeze({"itemId":"item:stone_axe","event":"onUse","id":"item:stone_axe.world_tool","prompt":"USE STONE AXE","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:stone_hoe","event":"onUse","id":"item:stone_hoe.on_use","prompt":"USE STONE HOE","triggers":["secondary","useWith","place"]}),
  Object.freeze({"itemId":"item:stone_pickaxe","event":"onUse","id":"item:stone_pickaxe.world_tool","prompt":"USE STONE PICKAXE","triggers":["secondary","useWith","useAt"]}),
  Object.freeze({"itemId":"item:stone_shovel","event":"onUse","id":"item:stone_shovel.repair_at_anvil","prompt":"REPAIR STONE SHOVEL","triggers":["useWith"]}),
  Object.freeze({"itemId":"item:strawberry","event":"onUse","id":"item:strawberry.on_use","prompt":"EAT STRAWBERRY","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:strawberry_seeds","event":"onUse","id":"item.strawberry-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:sunflower_seeds","event":"onUse","id":"item.sunflower-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:sword","event":"onUse","id":"item:sword.on_use","prompt":"USE SWORD","triggers":["secondary","useWith"]}),
  Object.freeze({"itemId":"item:tomato","event":"onUse","id":"item:tomato.on_use","prompt":"EAT TOMATO","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:tomato_seeds","event":"onUse","id":"item.tomato-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:torch","event":"onUse","id":"item:torch.equipment_use","prompt":"TOGGLE TORCH","triggers":["equipmentUse","worldItemUse"]}),
  Object.freeze({"itemId":"item:turnip","event":"onUse","id":"item:turnip.on_use","prompt":"EAT TURNIP","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:turnip_seeds","event":"onUse","id":"item.turnip-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:watering_can","event":"onUse","id":"item:watering_can.on_use","prompt":"WATER","triggers":["useWith","place"]}),
  Object.freeze({"itemId":"item:watermelon","event":"onUse","id":"item:watermelon.on_use","prompt":"EAT WATERMELON","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:watermelon_seeds","event":"onUse","id":"item.watermelon-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:wheat_seeds","event":"onUse","id":"item.wheat-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]}),
  Object.freeze({"itemId":"item:workbench","event":"onUse","id":"item:workbench.place","prompt":"PLACE WORKBENCH","triggers":["place"]}),
  Object.freeze({"itemId":"item:yellow_pepper","event":"onUse","id":"item:yellow_pepper.on_use","prompt":"EAT YELLOW PEPPER","triggers":["secondary"]}),
  Object.freeze({"itemId":"item:yellow_pepper_seeds","event":"onUse","id":"item.yellow-pepper-seeds.on-use","prompt":"PLANT SEEDS","triggers":["place"]})
] as const);
