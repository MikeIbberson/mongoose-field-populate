const get = require('lodash.get');
const set = require('lodash.set');
const flat = require('flat');
const { model } = require('mongoose');
const { pushUniquely, setPrefix } = require('./helpers');

const getCollectionName = (m) =>
  get(m, 'collection.collectionName');

const isolateSelectStatements = (a) =>
  typeof a === 'string'
    ? a
        .split(' ')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const mergeSelectStatements = (a, b) => {
  const out = [...a];
  b.forEach((item) => {
    if (!out.includes(item)) out.push(item);
  });

  return out;
};

class BatchQueryLoader {
  constructor() {
    this.$__datasources = {};
  }

  get isReady() {
    return Object.keys(this.$__datasources).length > 0;
  }

  init(schema) {
    const paths = [];

    const getPaths = (s, p) =>
      s.eachPath(
        (pathname, { options, schema: embedded }) => {
          if (embedded) getPaths(embedded, pathname);
          if (options.autopopulate) {
            pushUniquely(paths, {
              path: setPrefix(p, pathname),
              model: model(options.ref),
              select: options.autopopulateSelect,
            });
          }
        },
      );

    getPaths(schema);

    if (schema.discriminators)
      Object.values(schema.discriminators).forEach(
        getPaths,
      );

    this.$__datasources = paths
      .flat()
      .reduce((acc, { select, path, model: source }) => {
        const name = getCollectionName(source);
        const projection = isolateSelectStatements(select);

        if (name && !acc[name]) {
          acc[name] = {
            ids: [],
            cache: [],
            path: [path],
            projection,
            source,
          };
        } else if (acc[name]) {
          acc[name].path = acc[name].path.concat(path);
          acc[name].projection = mergeSelectStatements(
            acc[name].projection,
            projection,
          );
        }

        return acc;
      }, {});

    return this;
  }

  async fetch() {
    return Promise.all(
      Object.entries(this.$__datasources).map(
        // each source will lookup all unique ids
        async ([key, { source, projection, ids }]) => {
          if (ids && ids.length) {
            const res = await source
              .find({ _id: ids })
              .select(projection)
              .lean()
              .exec();

            // store it so we can assign back to the documents
            this.$__datasources[key].cache = res;
          }
        },
      ),
    );
  }

  load(doc, cb) {
    const bt = '._bsontype';
    const flattened = flat(
      'toJSON' in doc ? doc.toJSON() : doc,
    );

    Object.entries(this.$__datasources).forEach(
      ([Key, { path, ...rest }]) => {
        path.forEach((p) => {
          const matched = Object.keys(flattened).reduce(
            (acc, next) => {
              const isMatch = new RegExp(
                `${p.replace(
                  /\./gi,
                  '(\\.\\d+\\.|\\.)',
                )}${bt}`,
              ).test(next);

              if (isMatch) return next.replace(bt, '');
              return acc;
            },
            '',
          );

          if (matched)
            cb(get(doc, matched), matched, Key, rest);
        });
      },
    );

    return this;
  }

  registerIds(doc) {
    return this.load(doc, (val, pathKey, sourceKey) => {
      if (val) this.$__datasources[sourceKey].ids.push(val);
    });
  }

  assign(doc) {
    return this.load(
      doc,
      (
        val,
        pathKey,
        sourceKey,
        { cache, source: Source },
      ) => {
        const match = cache.find((d) => {
          return d._id && d._id.equals
            ? d._id.equals(val)
            : d._id === val;
        });

        if (match) set(doc, pathKey, new Source(match));
      },
    );
  }
}

module.exports = BatchQueryLoader;
