const get = require('lodash.get');

const filterByPrivateProps = (v) =>
  Array.isArray(v)
    ? v.filter(
        (val) =>
          ![
            '_id',
            'ref',
            'updatedAt',
            'createdAt',
            'createdBy',
          ].includes(val),
      )
    : v;

const isObject = (v) => typeof v === 'object' && v !== null;

const getPath = (v) =>
  isObject(v) && 'path' in v ? v.path : null;

const first = (v) => (Array.isArray(v) ? v[0] : undefined);

const firstIn = (v, method) =>
  isObject(v) ? first(Object[method](v)) : undefined;

const firstKey = (v) => firstIn(v, 'keys');
const firstValue = (v) => firstIn(v, 'values');

const reduceByChildSchema = (curr, { schema, model }) => {
  const { path, name } = model;
  const key =
    name === 'EmbeddedDocument' ? `${path}.$` : path;

  return Object.assign(curr, {
    [key]: Object.keys(schema.paths),
  });
};

const hasSyncOption = ({ schema }) =>
  Boolean(get(schema, 'options.sync'));

const reduceByContext = (ctx, key) => (a, next) =>
  !ctx
    ? a
    : Object.assign(a, {
        [`${key}.${next}`]: ctx[next],
      });

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

const cleanPath = (v) => {
  if (typeof v !== 'string')
    throw new Error('Key must be a string');

  return v.replace('$', '').replace('..', '.');
};

exports.cleanPath = cleanPath;

exports.removeTrailing = (s) =>
  s.endsWith('.') ? s.substring(0, s.length - 1) : s;

exports.appendRef = (v) => {
  let key = cleanPath(v);
  if (!key.endsWith('.')) key += '.';
  key += 'ref';

  return key;
};

exports.getUpdateParams = (m, ctx) => {
  const res = get(m, 'schema.childSchemas', [])
    .filter(hasSyncOption)
    .reduce(reduceByChildSchema, {});

  const key = firstKey(res);
  const select = filterByPrivateProps(firstValue(res));

  const out = [];
  out.push(key);

  // for plugins that use soft deleting
  // might need to make this key configurable eventually
  if (ctx && ctx.active === false) return out;

  try {
    return out.concat(
      select.reduce(reduceByContext(ctx, key), {}),
    );
  } catch (e) {
    return [];
  }
};
