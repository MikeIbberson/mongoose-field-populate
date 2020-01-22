const {
  setPrefix,
  pushUniquely,
  getSync,
  getSyncPaths,
  getUpdateParams,
} = require('../helpers');

const schemaFixture = (paths, path) => ({
  schema: {
    paths,
    options: {
      sync: true,
    },
  },
  model: {
    path,
  },
});

describe('Helpers', () => {
  describe('"setPrefix"', () => {
    it('should convert into dot notation', () =>
      expect(setPrefix('hello', 'dolly')).toBe(
        'hello.dolly',
      ));

    it('should disregard the first parameter if undefined', () =>
      expect(setPrefix(undefined, 'dolly')).toBe('dolly'));

    it('should disregard the first parameter if empty', () =>
      expect(setPrefix('', 'dolly')).toBe('dolly'));
  });

  describe('"pushUniquely"', () => {
    it('should not add to array on path match', () => {
      const stub = [{ path: 1 }, { path: 2 }];
      expect(pushUniquely(stub, { path: 1 })).toBeFalsy();
      expect(stub).toHaveLength(2);
    });

    it('should add to the array', () => {
      const stub = [{ path: 1 }];

      expect(pushUniquely(stub, { path: 2 })).toEqual(
        expect.any(Number),
      );
      expect(stub).toHaveLength(2);
    });

    it('should handle malformated array', () => {
      const stub = ['', { path: 2 }];
      expect(pushUniquely(stub)).toBeFalsy();
    });
  });

  describe('"getSync"', () => {
    it('should return null', () =>
      expect(getSync()).toBeNull());

    it('should options value', () =>
      expect(
        getSync({
          schema: { options: { sync: 1 } },
        }),
      ).toBe(1));
  });

  describe('"getSyncPaths"', () => {
    it('should return empty array', () =>
      expect(
        getSyncPaths({
          schema: {},
        }),
      ).toHaveLength(0));

    it('should return schema paths', () =>
      expect(
        getSyncPaths({
          schema: {
            paths: { foo: 1 },
          },
        }),
      ).toHaveLength(1));

    it('should filter out restricted properties', () =>
      expect(
        getSyncPaths({
          schema: {
            paths: {
              'foo': 1,
              '_id': 1,
              '__v': 1,
              'ref': 1,
            },
          },
        }),
      ).toHaveLength(1));
  });

  describe('"getUpdateParams"', () => {
    it('should return empty array', () =>
      expect(getUpdateParams()).toHaveLength(0));

    it('should return empty array', () =>
      expect(
        getUpdateParams({
          schema: {
            childSchemas: [
              schemaFixture({ foo: 1 }, 'bar'),
            ],
          },
        }),
      ).toEqual(['bar', {}]));

    it('should match with context', () =>
      expect(
        getUpdateParams(
          {
            schema: {
              childSchemas: [
                schemaFixture({ foo: 1 }, 'bar'),
              ],
            },
          },
          {
            foo: 'quuz',
          },
        ),
      ).toEqual(['bar', { 'bar.foo': 'quuz' }]));
  });
});