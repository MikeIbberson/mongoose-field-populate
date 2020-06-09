const get = require('lodash.get');

const isObject = (v) => typeof v === 'object' && v !== null;

const getPath = (v) =>
  isObject(v) && 'path' in v ? v.path : null;

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

const cleanPath = (v) => {
  if (typeof v !== 'string')
    throw new Error('Key must be a string');

  return v.replace('$', '').replace('..', '.');
};

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

exports.removeTrailing = (s) =>
  s.endsWith('.') ? s.substring(0, s.length - 1) : s;

exports.appendRef = (v) => {
  let key = cleanPath(v);
  if (!key.endsWith('.')) key += '.';
  key += 'ref';

  return key;
};

exports.findSyncOptions = (model) =>
  get(model, 'schema.childSchemas', [])
    .filter(hasSyncOption)
    .reduce(reduceByChildSchema, {});

exports.filterByPrivateProps = (v) =>
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

exports.reduceByContext = (ctx, key) => (a, next) =>
  !ctx
    ? a
    : Object.assign(a, {
        [`${key}.${next}`]: ctx[next],
      });

exports.cleanPath = cleanPath;
