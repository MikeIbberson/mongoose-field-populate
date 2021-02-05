const mongoose = require('mongoose');
const get = require('lodash.get');
const {
  findSyncOptions,
  filterByPrivateProps,
  getSync,
  getSyncPaths,
  getPreSync,
  appendRef,
  cleanPath,
  removeTrailing,
  isDefined,
} = require('./helpers');

const { ObjectId } = mongoose.Types;

async function populateRef() {
  const sync = getSync(this);
  const fn = getPreSync(this);
  const paths = getSyncPaths(this);

  // allow for empty refs (i.e. removed/unset by user)
  if (
    this.$locals.populated ||
    !sync ||
    (fn && !fn(this)) ||
    !this.ref
  )
    return;

  // since we've attached both validate and save middleware
  // we need to ensure only one runs -- ideally validate
  this.$locals.populated = true;

  const lookup = await mongoose
    .model(sync)
    .findById(this.ref)
    .select(paths.join(' '))
    .lean()
    .exec();

  if (!lookup) return;

  this.set(
    paths.reduce(
      (curr, next) =>
        Object.assign(curr, {
          [next]: lookup[next],
        }),
      {},
    ),
  );
}

function updateRef(
  collections = [],
  resolveQueryByCollectionName,
) {
  return async function collectionRunner() {
    // couldn't possible have references if it's new
    // so we'll save the resources
    if (this.$locals && this.$locals.wasNew) return null;

    const makeReferenceObject = (name = 'ref') => ({
      $or: [
        { [name]: ObjectId(this._id) },
        { [name]: this._id.toString() },
      ],
    });

    return Promise.all(
      collections.map(async (collection) => {
        const m = mongoose.model(collection);

        await Promise.all(
          Object.entries(findSyncOptions(m)).map(
            async ([key, value]) => {
              const ref = appendRef(key);
              const path = removeTrailing(cleanPath(key));
              const isEmbedded = key.endsWith('.$');

              const op = filterByPrivateProps(value).filter(
                (item) =>
                  get(
                    this,
                    '$locals.wasModifiedPaths',
                    [],
                  ).includes(item),
              );

              const getTargets = (prefix = '') =>
                op.reduce((acc, curr) => {
                  acc[`${prefix}${curr}`] = this[curr];
                  return acc;
                }, {});

              const maekKey = () => {
                const s = key.replace(/\$/g, '$[]');
                const n = s.substring(0, s.length - 2);
                return n.concat('[ref].');
              };

              const makeElemKey = () =>
                key.substring(0, key.length - 2);

              const withCollectionNameQuery = (query) => ({
                ...query,
                ...(resolveQueryByCollectionName
                  ? resolveQueryByCollectionName(collection)
                  : {}),
              });

              const runUpdateOpOnMany = async (
                selector,
                options = {},
              ) =>
                m.updateMany(
                  withCollectionNameQuery({
                    $or: [
                      { [ref]: ObjectId(this._id) },
                      { [ref]: this._id.toString() },
                    ],
                  }),
                  selector,
                  {
                    multi: true,
                    ...options,
                  },
                );

              const runUpdateOpOnManyWithArrayFilters = (
                filter,
              ) =>
                runUpdateOpOnMany(
                  { $set: getTargets(maekKey()) },
                  { arrayFilters: [filter] },
                );

              const runUpdateToUnsetValues = () =>
                runUpdateOpOnMany({
                  $unset: {
                    [key]: '',
                  },
                });

              const runUpdateToModifyEmbeddedValues = () =>
                Promise.allSettled([
                  runUpdateOpOnManyWithArrayFilters({
                    'ref.ref': this._id,
                  }),
                  runUpdateOpOnManyWithArrayFilters({
                    'ref.ref': this._id.toString(),
                  }),
                ]);

              const runUpdateToPullValues = () =>
                m.updateMany(
                  withCollectionNameQuery({
                    [path]: {
                      $elemMatch: makeReferenceObject(),
                    },
                  }),
                  {
                    $pull: {
                      [makeElemKey()]: makeReferenceObject(),
                    },
                  },
                  {
                    multi: true,
                  },
                );

              if (this.active && !op.length) return null;

              if (!this.active && isEmbedded)
                return runUpdateToPullValues();

              if (!this.active)
                return runUpdateToUnsetValues();

              if (!isEmbedded)
                return runUpdateOpOnMany({
                  $set: {
                    [key]: getTargets(),
                  },
                });

              return runUpdateToModifyEmbeddedValues();
            },
          ),
        );
      }),
    );
  };
}

module.exports = class Builder {
  constructor(model) {
    this.$ref = model;
    this.$opts = {
      // latest versions of mongoose not interpretting this correctly
      // using plain string for now
      ref: {
        type: mongoose.Schema.Types.Mixed,
      },
    };

    return this;
  }

  static plugin(
    s,
    collections,
    resolveQueryByCollectionName,
  ) {
    s.pre('save', function markAsNew() {
      this.$locals.wasNew = this.isNew;
      this.$locals.wasModifiedPaths = this.modifiedPaths();
    });

    s.post(
      'save',
      updateRef(collections, resolveQueryByCollectionName),
    );
    return s;
  }

  on(paths = []) {
    const s = get(this, '$ref.schema.paths', {});
    const getInstance = (v) => {
      try {
        if (v.instance === 'Embedded')
          throw new Error('Embedded schemas disallowed');
        return v.instance;
      } catch (e) {
        return mongoose.Schema.Types.Mixed;
      }
    };

    paths.forEach((next) =>
      s[next]
        ? Object.assign(this.$opts, {
            [next]: {
              type: getInstance(s[next]),
            },
          })
        : null,
    );

    return this;
  }

  set(name, options = {}) {
    if (!this.$opts || !this.$opts[name])
      throw new Error(
        `${name} not included in reference object`,
      );

    Object.assign(this.$opts[name], options);
    return this;
  }

  isRequired() {
    Object.assign(this.$opts.ref, {
      required: true,
      validate: {
        message: () => 'Reference cannot be an empty value',
        validator: isDefined,
      },
    });

    return this;
  }

  done(globalOptions = {}) {
    const output = new mongoose.Schema(this.$opts, {
      sync: get(this, '$ref.collection.collectionName'),
      timestamps: false,
      ...globalOptions,
    });

    output.pre('validate', populateRef);
    output.pre('save', populateRef);

    return output;
  }
};
