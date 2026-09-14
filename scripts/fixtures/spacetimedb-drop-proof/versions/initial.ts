import { schema, table, t } from 'spacetimedb/server';
const empty_probe = table({ name: 'empty_probe', public: true }, { id: t.u8().primaryKey() });
const filled_probe = table({ name: 'filled_probe', public: true }, {
  id: t.u8().primaryKey(), value: t.string(),
});
const spacetimedb = schema({ empty_probe, filled_probe });
export default spacetimedb;
export const init = spacetimedb.init((ctx) => {
  ctx.db.filled_probe.insert({ id: 1, value: 'must-survive' });
});
