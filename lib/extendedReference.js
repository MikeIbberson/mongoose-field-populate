const mongoose = require('mongoose');
const get = require('lodash.get');
const {
  getSync,
  getSyncPaths,
  getUpdateParams,
  appendRef,
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

function updateRef(collections = []) {
  return function collectionRunner() {
    return Promise.all(
      collections.map(async (collection) => {
        const m = mongoose.model(collection);
        const [key, $set] = getUpdateParams(m, this);

        return key
          ? m.findOneAndUpdate(
              {
                [appendRef(key)]: this._id,
              },
              { $set },
            )
          : {};
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
    });

    output.pre('save', populateRef);
    return output;
  }
};
