import { schema, table, t } from 'spacetimedb/server';
const keeper = table({ name: 'keeper', public: true }, { id: t.u8().primaryKey() });
const spacetimedb = schema({ keeper });
export default spacetimedb;
export const init = spacetimedb.init((ctx) => { ctx.db.keeper.insert({ id: 1 }); });
