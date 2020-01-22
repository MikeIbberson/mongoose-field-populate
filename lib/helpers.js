const get = require('lodash.get');

const privates = ['_id', 'ref'];

const isObject = (v) => typeof v === 'object' && v !== null;

const getPath = (v) =>
  isObject(v) && 'path' in v ? v.path : null;

const first = (v) => (Array.isArray(v) ? v[0] : undefined);

const firstIn = (v, method) =>
  isObject(v) ? first(Object[method](v)) : undefined;

const firstKey = (v) => firstIn(v, 'keys');
const firstValue = (v) => firstIn(v, 'values');

const reduceByChildSchema = (curr, { schema, model }) =>
  Object.assign(curr, {
    [model.path]: Object.keys(schema.paths),
  });

const hasSyncOption = ({ schema }) =>
  Boolean(get(schema, 'options.sync'));

exports.setPrefix = (p, name) =>
  `${
    typeof p === 'string' && p.length ? `${p}.` : ''
  }${name}`;

exports.pushUniquely = (a, i) =>
  a.filter(Boolean).findIndex((item) => {
    const inbound = getPath(item);
    const target = getPath(i);
    return inbound === target || !inbound || !target;
  }) === -1
    ? a.push(i)
    : 0;

exports.getSync = (v) =>
  get(v, 'schema.options.sync', null);

exports.getSyncPaths = (v) =>
  Object.keys(get(v, 'schema.paths', {})).filter(
    (name) => !['ref', '_id', '__v'].includes(name),
  );

exports.getUpdateParams = (m, ctx) => {
  const res = get(m, 'schema.childSchemas', [])
    .filter(hasSyncOption)
    .reduce(reduceByChildSchema, {});

  const key = firstKey(res);
  const select = firstValue(res);

  try {
    return [
      key,
      select.reduce(
        (a, next) =>
          privates.includes(next) || !ctx
            ? a
            : Object.assign(a, {
                [`${key}.${next}`]: ctx[next],
              }),
        {},
      ),
    ];
  } catch (e) {
    return [];
  }
};
