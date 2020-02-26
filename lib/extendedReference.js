const mongoose = require('mongoose');
const get = require('lodash.get');
const {
  getSync,
  getSyncPaths,
  getUpdateParams,
  appendRef,
  cleanPath,
  removeTrailing,
} = require('./helpers');

async function populateRef() {
  const sync = getSync(this);
  const paths = getSyncPaths(this);

  if (!sync) return;

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
    doc.set({ path: null });
  }

  return doc.save();
};

function updateRef(collections = []) {
  return function collectionRunner() {
    return Promise.all(
      collections.map(async (collection) => {
        const m = mongoose.model(collection);
        const [key, params] = getUpdateParams(m, this);
        const ref = appendRef(key);
        const path = removeTrailing(cleanPath(key));

        const docs = await m.find({
          [ref]: this._id,
        });

        return Promise.all(
          docs.map(
            updateSubdocument(path, params, this._id),
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
      ref: mongoose.Schema.Types.ObjectId,
    };

    return this;
  }

  static plugin(s, collections) {
    s.post('save', updateRef(collections));
    return s;
  }

  on(paths = []) {
    const s = get(this, '$ref.schema.paths', {});
    paths.forEach((next) =>
      s[next]
        ? Object.assign(this.$opts, {
            [next]: {
              type: s[next].instance,
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

  done() {
    const output = new mongoose.Schema(this.$opts, {
      sync: get(this, '$ref.collection.collectionName'),
      timestamps: false,
    });

    output.pre('save', populateRef);
    return output;
  }
};
