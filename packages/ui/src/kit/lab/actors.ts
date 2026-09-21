import type { LoadedAsset } from '../../assets.js';
import { ui } from '../components/index.js';
import { uiFixed } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
export interface UiLabActor {
  readonly id: string; readonly label: string; readonly asset: string;
  readonly kind: 'npc' | 'faction' | 'enemy' | 'effect'; readonly animations: readonly string[];
  readonly companions: readonly string[];
}
export interface UiLabActorOptions {
  readonly actors: readonly UiLabActor[]; readonly assets: ReadonlyMap<string, LoadedAsset>;
  readonly request: (name: string) => void; readonly activate: (id: string) => void;
}
export function uiActorLibrary(options: UiLabActorOptions): UiElement {
  let kind: UiLabActor['kind'] | 'all' = 'all', selected = 0, page = 0;
  const library = ui.frame({ style: 'parchment_plain', header: { title: 'Actor library' }, layout: { width: 'grow', height: 'grow', gap: 8 } });
  const content = library.children.at(-1)!;
  const choose = (delta: number) => { const count = entries().length; selected = count ? (selected + delta + count) % count : 0; page = Math.floor(selected / 30); rebuild(); options.activate('actor-selection'); };
  const entries = () => options.actors.filter(actor => kind === 'all' || actor.kind === kind);
  const preview = (name: string, animation: string): UiElement => {
    const asset = options.assets.get(name);
    if (asset) return ui.sprite(asset, { animation, loop: true, label: `${name}/${animation}`, layout: { width: 'grow', height: uiFixed(48) } });
    options.request(name); return ui.text(`Loading ${name}`);
  };
  const rebuild = () => {
    const actors = entries(), actor = actors[selected];
    library.setProps({ selectedActor: actor?.id ?? '', actorKind: kind, actorPage: page }, false);
    const children: UiElement[] = [ui.flex({ direction: 'row', gap: 4, wrap: true }, (['all', 'npc', 'faction', 'enemy', 'effect'] as const).map(filter =>
      ui.button({ label: filter, tone: filter === kind ? 'success' : 'neutral', size: 'sm', onPress: () => { kind = filter; selected = 0; page = 0; rebuild(); options.activate(filter); } }))),
    ui.flex({ direction: 'row', gap: 4 }, [
      ui.button({ label: 'Previous', size: 'sm', disabled: page === 0, onPress: () => { page--; selected = page * 30; rebuild(); } }),
      ui.text(`Page ${page + 1}/${Math.max(1, Math.ceil(actors.length / 30))}`),
      ui.button({ label: 'Next', size: 'sm', disabled: (page + 1) * 30 >= actors.length, onPress: () => { page++; selected = page * 30; rebuild(); } }),
    ]),
    ui.flex({ direction: 'row', gap: 8, height: 'grow' }, [
      ui.scrollArea({ width: uiFixed(220), gap: 4 }, [ui.grid({ columns: 3, gap: 4, rowHeight: uiFixed(76) }, actors.slice(page * 30, (page + 1) * 30).map((entry, index) =>
        ui.flex({ gap: 2 }, [preview(entry.asset, entry.animations[0] ?? 'idle'), ui.button({ label: entry.label, size: 'sm', tone: page * 30 + index === selected ? 'success' : 'neutral', onPress: () => { selected = page * 30 + index; rebuild(); options.activate(entry.id); } })])))]),
      ui.scrollArea({ width: 'grow', gap: 8 }, actor ? [ui.text(actor.label, { role: 'header' }),
        ui.grid({ columns: 'auto', minColumnWidth: uiFixed(72), gap: 4, rowHeight: uiFixed(80) }, actor.animations.map(animation => ui.flex({ gap: 2 }, [preview(actor.asset, animation), ui.text(animation)]))),
        ...actor.companions.map(name => ui.flex({ gap: 4 }, [ui.text(name), preview(name, options.assets.get(name) ? Object.keys(options.assets.get(name)!.metadata.animations)[0] ?? 'idle' : 'idle')])),
      ] : [ui.text('No actors match this filter.')]),
    ]),
    ui.flex({ direction: 'row', gap: 4 }, [ui.button({ label: '[ Previous actor', size: 'sm', onPress: () => choose(-1) }),
      ui.button({ label: 'Next actor ]', size: 'sm', onPress: () => choose(1) })]),
    ];
    for (const child of [...content.children]) child.dispose(); content.replaceChildren(children);
  };
  library.setProps({ refresh: rebuild, stepActor: choose }); rebuild(); return library;
}
