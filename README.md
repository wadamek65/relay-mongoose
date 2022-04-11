# relay-mongoose
## Note
This project is an initial, minimal implementation of integrating relay pagination with mongoose. It works and was tested, but has a few edge-cases, some of which are noted in the issues. As I will not be developing this any further, this will remain archived and hopefully it can at least serve as an example for an implementation in your own projects. [See this issue for some more details](https://github.com/wadamek65/relay-mongoose/issues/8#issuecomment-776907650).

## About
`relay-mongoose` is a small library with a few utilities to make implementing [relay compliant server easier](https://relay.dev/docs/en/graphql-server-specification.html).
It provides a class that enhanced the base `mongoose.Model` with a few relay helpers.

## Usage
### `EnhancedModel`
Use mongoose `loadClass()` method as [described here](https://mongoosejs.com/docs/guide.html#es6-classes).
```typescript
import * as mongoose from 'mongoose';
import { EnhancedDocument, EnhancedModel } from 'relay-mongoose';

export interface TestSchemaInterface extends EnhancedDocument {
	field: string;
}
const testSchema = new mongoose.Schema({
	field: String
});
testSchema.loadClass(EnhancedModel);

// Due to the loadClass method implicitly adding new virtual methods to our model
// To preserve new and old model types for convenience of development the model has to be casted to any
const TestModel: EnhancedModel<TestSchemaInterface> = mongoose.model('test', testSchema) as any;
```

You can now use the added `findConnections` method:

```typescript
/* test collection
[
    { _id: '1', field: '1' },
    { _id: '2', field: '2' },
    { _id: '3', field: '3' },
]
*/

const result = await TestModel.findConnections({}, {});

/* result
{
  edges: [
    { node: { id: 'dGVzdC4x', field: '1' }, cursor: 'dGVzdC4x' },
    { node: { id: 'dGVzdC4y', field: '2' }, cursor: 'dGVzdC4y' },
    { node: { id: 'dGVzdC4z', field: '3' }, cursor: 'dGVzdC4z' },
  ],
  pageInfo: {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: 'dGVzdC4x',
    endCursor: 'dGVzdC4z'
  }
}
*/
```
Note that the id returned in each node is already a base64 encoded string returned from `document.relayId` utility.

### `relayId`
As shown in the previous example, all documents returned by `findConnections` have a modified id which is
the base64 encoded concatenation of model name and object ID by a dot.

For example consider the following document in the `test` collection:

`{ _id: '5ea4730dfdea900007758b00', field: 'something' }`

Before encoding, `relayId` value is `test.5ea4730dfdea900007758b00`. The string is then base64 encoded 
to mask the collection name in the ID. This value can be decoded by the `fromRelayId()` utility in `relay-mongoose`.

This allows to easily write a `node` query resolver like this:
```typescript
import * as mongoose from 'mongoose';
import { fromRelayId } from 'relay-mongoose';

const Query = {
	node: (obj, { id }) => {
		const { modelName, objectId } = fromRelayId(id);
		return mongoose.models[modelName].findById(objectId);
	}
};
```

### `findConnections` standalone function
There is also a standalone `findConnections` function to which as the first argument you can pass a mongoose 
query for more flexibility. For example:

```typescript
import * as mongoose from 'mongoose';
import { EnhancedModel, findConnections } from 'relay-mongoose';

const TestModel: EnhancedModel<any> = mongoose.model('test', testSchema) as any;

const firstQuery = TestModel.find({ condition: 2 }).populate(...);
const paginatedData = await findConnections(firstQuery, { first: 10 });
```

Please note that the query passed as the first argument has to have extended the `EnhancedModel` class
as `relayId` property is needed for correct mapping.

## API

### `EnhancedModel.findConnections`
```typescript
async findConnections<T extends Document>(
		conditions: FilterQuery<T>,
		paginationArgs: PaginationArgs,
		projection?: any | null
	): Promise<ConnectionDocuments<T>>
```

`conditions`, `projection`: the same as mongoose `find` signature arguments.

`paginationArgs`: pagination arguments as defined by relay specification

```typescript
export type Cursor = string;

export interface PaginationArgs {
	first?: number;
	last?: number;
	before?: Cursor;
	after?: Cursor;
}

export interface Edge<T> {
	cursor: Cursor;
	node: T;
}

export interface ConnectionDocuments<T> {
	edges: Edge<T>[];
	pageInfo: {
		startCursor?: Cursor;
		endCursor?: Cursor;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	};
}
```

### `EnhancedModel.relayId`
The base64 encoded concatenation of model name and stringified object ID of a document. Returns a string.

### `fromRelayId`
```typescript
type fromRelayId = (id: string) => { modelName: string | null; objectId: string | null };
```

The reverse operation of `EnhancedModel.relayId`. Returns `null` if invalid id is provided.

### `findConnections`
```typescript
export const findConnections = async <DocType extends EnhancedDocument, QueryHelpers = {}>(
	documentQuery: DocumentQuery<DocType | DocType[] | null, any, QueryHelpers> & QueryHelpers,
	{ before, after, first, last }: PaginationArgs,
	projection?: any | null
): Promise<ConnectionDocuments<DocType>>
```
## License
MIT
