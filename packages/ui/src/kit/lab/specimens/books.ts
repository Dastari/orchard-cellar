import type { UiLabSpecimen } from '../registry.js';
export const booksSpecimen: UiLabSpecimen = {
  id: 'books', title: 'Responsive books and safe Markdown', district: 'books', size: { width: 1080, height: 800 }, matrix: { mode: ['book','scroll'] },
  build(ui, props, mock) {
    const source = '# Orchard journal\n\n<!-- bookmark: harvest | Harvest | gold | left | harvest -->\n\nPlant trees, tend crops, and press fruit. Read about [apple](item:apple) or visit [the cellar](coord:cellar,4,8).\n\n## Harvest\n\n' + 'Keep harvested fruit cool and leave space in the barrel. '.repeat(props['longLabels'] ? 120 : 24) + '\n\n<!-- page: 4 -->\n\n# Cellar notes\n\n<!-- bookmark: cellar | Cellar | blue | right -->\n\n[item:apple]\n\n<!-- embed: item | apple | Apple -->\n\n[Return to harvest](page:harvest)\n\n<script>This is inert text.</script>';
    const options = { source, art: mock.art, onLink: (target: unknown) => mock.activate(JSON.stringify(target)), onPageChange: (page: number) => mock.activate(`spread:${page}`) };
    return props['mode'] === 'scroll' ? ui.frame({ header: { title: 'Markdown document' }, layout: { width: 'grow', height: 'grow' }, children: [ui.markdown(options)] }) : ui.book(options);
  },
};
