const { model } = require('mongoose');
const { pushUniquely, setPrefix } = require('./helpers');

module.exports = (schema) => {
  let paths = [];

  function setPaths() {
    const getPaths = (s, p) =>
      s.eachPath(
        (pathname, { options, schema: embedded }) => {
          if (embedded) getPaths(embedded, pathname);
          if (options.autopopulate)
            pushUniquely(paths, {
              path: setPrefix(p, pathname),
              model: model(options.ref),
              select: options.autopopulateSelect,
            });
        },
      );

    getPaths(schema);

    if (schema.discriminators)
      Object.values(schema.discriminators).forEach(
        getPaths,
      );

    paths = paths.flat();
  }

  async function autopopulate(doc) {
    const exec = async (d) =>
      !('parent' in this)
        ? Promise.all(
            paths.map(async (o) => {
              try {
                return d.populate(o).execPopulate();
              } catch (e) {
                return null;
              }
            }),
          )
        : null;

    if (Array.isArray(doc)) {
      await Promise.all(doc.map(exec));
    } else {
      await exec(doc);
    }
  }

  schema
    .pre('init', setPaths)
    .post('find', autopopulate)
    .post('findOne', autopopulate)
    .post('findOneAndUpdate', autopopulate)
    .post('save', autopopulate);
};
