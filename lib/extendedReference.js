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
  reduceByContext,
  removeTrailing,
} = require('./helpers');

const { ObjectId } = mongoose.Types;

async function populateRef() {
  const sync = getSync(this);
  const fn = getPreSync(this);
  const paths = getSyncPaths(this);

  // allow for empty refs (i.e. removed/unset by user)
  if (!sync || (fn && !fn(this)) || !this.ref) return;

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

const updateSubdocument = (path, params, id) => (doc) => {
  if (Array.isArray(doc[path])) {
    const subdoc = doc[path]
      .filter((v) => {
        return id.equals(v.ref);
      })
      .pop();

    if (!params) {
      subdoc.remove();
    } else {
      subdoc.set(params);
    }
  } else if (params) {
    doc.set(params);
  } else {
    doc.set({
      [path]: undefined,
    });
  }

  return doc.save();
};

function updateRef(collections = []) {
  return async function collectionRunner() {
    // couldn't possible have references if it's new
    // so we'll save the resources
    if (this.$locals && this.$locals.wasNew) return null;

    return Promise.all(
      collections.map(async (collection) => {
        const m = mongoose.model(collection);

        await Promise.all(
          Object.entries(findSyncOptions(m)).map(
            async ([key, value]) => {
              const ref = appendRef(key);
              const path = removeTrailing(cleanPath(key));

              // active is used for archiving
              // needs to be made more flexible in future iterations....
              const updateParams = this.active
                ? filterByPrivateProps(value).reduce(
                    reduceByContext(this, key),
                    {},
                  )
                : undefined;

              const docs = await m.find({
                $or: [
                  { [ref]: ObjectId(this._id) },
                  { [ref]: this._id.toString() },
                ],
              });

              return Promise.all(
                docs.map(
                  updateSubdocument(
                    path,
                    updateParams,
                    this._id,
                  ),
                ),
              );
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
      ref: mongoose.Schema.Types.Mixed,
    };

    return this;
  }

  static plugin(s, collections) {
    s.pre('save', function markAsNew() {
      this.$locals.wasNew = this.isNew;
    });

    s.post('save', updateRef(collections));
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

  done(globalOptions = {}) {
    const output = new mongoose.Schema(this.$opts, {
      sync: get(this, '$ref.collection.collectionName'),
      timestamps: false,
      ...globalOptions,
    });

    output.pre('save', populateRef);
    return output;
  }
};
