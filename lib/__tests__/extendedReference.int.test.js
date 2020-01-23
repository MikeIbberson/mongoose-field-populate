const mongoose = require('mongoose');
const { ExtendedReference } = require('..');

let TargetModel;
let LocalModel;
let ref;
let doc;

beforeAll(async () => {
  const Target = new mongoose.Schema({
    name: String,
    age: Number,
  });

  Target.plugin(ExtendedReference.plugin, ['ref']);
  TargetModel = mongoose.model('targets', Target);

  const LocalDocument = new mongoose.Schema({
    name: String,
    friend: new ExtendedReference(TargetModel)
      .on(['name', 'age'])
      .set('name', {
        searchable: true,
      })
      .done(),
  });

  LocalModel = mongoose.model('ref', LocalDocument);
  mongoose.connect(process.env.CONNECTION);

  ref = await TargetModel.create({
    name: 'Frank',
    age: 21,
  });

  doc = await LocalModel.create({
    name: 'Joe',
    friend: {
      ref: ref._id,
    },
  });
});

describe('ExtendedReference plugin strategy', () => {
  it('should copy properties', () =>
    expect(doc.friend).toHaveProperty('name', 'Frank'));

  it('should update properties', async () => {
    await ref.set({ name: 'Bob' }).save();
    const changes = await LocalModel.findById(
      doc._id,
    ).exec();

    expect(changes.friend).toHaveProperty('name', 'Bob');
  });

  it('should ignore no-matching refs', async () => {
    doc.set({
      friend: { ref: mongoose.Types.ObjectId() },
    });

    await doc.save();
    expect(doc.friend.name).toBeUndefined();
  });
});
