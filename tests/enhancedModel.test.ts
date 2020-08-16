import * as chai from 'chai';
import * as mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { EnhancedDocument, EnhancedModel, fromRelayId } from '../src';

const expect = chai.expect;

export interface TestSchemaInterface extends EnhancedDocument {
	field: string;
}

const testSchema = new mongoose.Schema({
	field: String
});

describe('relay-mongoose tests', () => {
	let TestModel: EnhancedModel<TestSchemaInterface>;
	let mongo;
	let docs;
	let firstId;
	let lastId;
	const value = 'test';

	beforeEach(async () => {
		mongo = new MongoMemoryServer();
		await mongoose.connect(await mongo.getUri());
		testSchema.loadClass(EnhancedModel);
		TestModel = mongoose.model('test', testSchema) as any;
		docs = [...Array(15)].map(() => new TestModel({ field: value }));
		await TestModel.insertMany(docs);
		firstId = docs[0].relayId;
		lastId = docs[docs.length - 1].relayId;
	});

	afterEach(async () => {
		await mongoose.disconnect();
		await mongo.stop();
	});

	describe('general', () => {
		it('should save and find documents properly', async () => {
			const value = 'test';
			await new TestModel({ field: value }).save();
			const result = await TestModel.findOne({ field: value });
			expect(result.field).to.equal(value);
		});

		it('should return everything', async () => {
			const result = await TestModel.findConnections({ field: value }, {});
			expect(result.edges.length).to.equal(docs.length);
			expect(result.pageInfo.startCursor).to.equal(result.edges[0].cursor).to.equal(firstId);
			expect(result.pageInfo.endCursor)
				.to.equal(result.edges[result.edges.length - 1].cursor)
				.to.equal(lastId);
			expect(result.pageInfo.hasPreviousPage).to.equal(false);
			expect(result.pageInfo.hasNextPage).to.equal(false);
		});

		it('should accept null pagination args and return everything', async () => {
			const result = await TestModel.findConnections({ field: value }, { first: null, last: null });
			expect(result.edges.length).to.equal(docs.length);
			expect(result.pageInfo.startCursor).to.equal(result.edges[0].cursor).to.equal(firstId);
			expect(result.pageInfo.endCursor)
				.to.equal(result.edges[result.edges.length - 1].cursor)
				.to.equal(lastId);
			expect(result.pageInfo.hasPreviousPage).to.equal(false);
			expect(result.pageInfo.hasNextPage).to.equal(false);
		});

		it('should return a custom relay Id', async () => {
			const result = await TestModel.findOne({ field: value }, {});
			expect(result.id).not.to.equal(result.relayId);
			expect(result.relayId)
				.to.equal(Buffer.from(`${TestModel.modelName}.${result.id}`).toString('base64'))
				.to.equal(Buffer.from(`test.${result.id}`).toString('base64'));
		});

		it('should decode relayId properly', async () => {
			const fakeModelName = 'fakeModel';
			const fakeObjectId = 'fakeObjectId';
			const { modelName, objectId } = fromRelayId(Buffer.from(`${fakeModelName}.${fakeObjectId}`).toString('base64'));
			expect(modelName).to.equal(fakeModelName);
			expect(objectId).to.equal(fakeObjectId);
		});

		it('should return null when decoding invalid relayId', async () => {
			const fakeModelName = 'fakeModel';
			const { objectId, modelName } = fromRelayId(Buffer.from(fakeModelName).toString('base64'));
			expect(objectId).to.equal(null);
			expect(modelName).to.equal(null);
		});
	});

	describe('pagination args tests', () => {
		it('should return first 5 edges correctly', async () => {
			const amount = 5;
			const args = {
				first: amount
			};
			const result = await TestModel.findConnections({ field: value }, args);
			expect(result.edges.length).to.equal(amount);
			expect(result.pageInfo.startCursor).to.equal(result.edges[0].cursor).to.equal(firstId);
			expect(result.pageInfo.endCursor)
				.to.equal(result.edges[amount - 1].cursor)
				.to.equal(docs[amount - 1].relayId);
			expect(result.pageInfo.hasPreviousPage).to.equal(false);
			expect(result.pageInfo.hasNextPage).to.equal(true);
		});

		it('should return last 5 edges correctly', async () => {
			const amount = 5;
			const args = {
				last: amount
			};
			const result = await TestModel.findConnections({ field: value }, args);
			expect(result.edges.length).to.equal(amount);
			expect(result.pageInfo.startCursor)
				.to.equal(result.edges[result.edges.length - amount].cursor)
				.to.equal(docs[docs.length - amount].relayId);
			expect(result.pageInfo.endCursor)
				.to.equal(result.edges[result.edges.length - 1].cursor)
				.to.equal(lastId);
			expect(result.pageInfo.hasPreviousPage).to.equal(true);
			expect(result.pageInfo.hasNextPage).to.equal(false);
		});

		it('should return edges before and after cursors', async () => {
			const afterIndex = 5;
			const beforeIndex = 10;
			const args = { after: docs[afterIndex].relayId, before: docs[beforeIndex].relayId };

			const result = await TestModel.findConnections({ field: value }, args);
			expect(result.edges.length).to.equal(beforeIndex - afterIndex - 1);
			expect(result.pageInfo.endCursor).to.equal(docs[beforeIndex - 1].relayId);
			expect(result.pageInfo.startCursor).to.equal(docs[afterIndex + 1].relayId);
		});

		describe('after tests', () => {
			// We do not check for hasPreviousPage as it isn't specified as mandatory in the PageInfo spec
			// https://relay.dev/graphql/connections.htm#note-a97ec

			it('should return all edges after cursor', async () => {
				const amount = 5;
				const args = { after: docs[amount - 1].relayId };

				const result = await TestModel.findConnections({ field: value }, args);
				expect(result.edges.length).to.equal(docs.length - amount);
				expect(result.pageInfo.endCursor).to.equal(lastId);
				expect(result.pageInfo.startCursor).to.equal(docs[amount].relayId);
				expect(result.pageInfo.hasNextPage).to.equal(false);
			});

			it('should return first 5 edges after cursor', async () => {
				const amount = 5;
				const args = { after: docs[amount - 1].relayId, first: amount };

				const result = await TestModel.findConnections({ field: value }, args);
				expect(result.edges.length).to.equal(amount);
				expect(result.pageInfo.endCursor).to.equal(docs[amount + amount - 1].relayId);
				expect(result.pageInfo.startCursor).to.equal(docs[amount].relayId);
				expect(result.pageInfo.hasNextPage).to.equal(true);
			});

			it('should return last 5 edges after cursor', async () => {
				const amount = 5;
				const args = { after: docs[amount - 1].relayId, last: amount };

				const result = await TestModel.findConnections({ field: value }, args);
				expect(result.edges.length).to.equal(amount);
				expect(result.pageInfo.endCursor).to.equal(lastId);
				expect(result.pageInfo.startCursor).to.equal(docs[docs.length - amount].relayId);
				expect(result.pageInfo.hasPreviousPage).to.equal(true);
				expect(result.pageInfo.hasNextPage).to.equal(false);
			});
		});

		describe('before tests', () => {
			// We do not check for hasNextPage as it isn't specified as mandatory in the PageInfo spec
			// https://relay.dev/graphql/connections.htm#note-a97ec

			it('should return all edges before cursor', async () => {
				const amount = 5;
				const args = { before: docs[amount].relayId };

				const result = await TestModel.findConnections({ field: value }, args);
				expect(result.edges.length).to.equal(amount);
				expect(result.pageInfo.startCursor).to.equal(docs[0].relayId);
				expect(result.pageInfo.endCursor).to.equal(docs[amount - 1].relayId);
				expect(result.pageInfo.hasPreviousPage).to.equal(false);
			});

			it('should return first 5 edges before cursor', async () => {
				const amount = 5;
				const beforeIndex = 10;
				const beforeId = docs[beforeIndex].relayId;
				const args = { before: beforeId, first: amount };

				const result = await TestModel.findConnections({ field: value }, args);
				expect(result.edges.length).to.equal(amount);
				expect(result.pageInfo.endCursor).to.equal(docs[amount - 1].relayId);
				expect(result.pageInfo.startCursor).to.equal(docs[0].relayId);
				expect(result.pageInfo.hasNextPage).to.equal(true);
			});

			it('should return last 5 edges before cursor', async () => {
				const amount = 5;
				const beforeIndex = 10;
				const beforeId = docs[beforeIndex].relayId;
				const args = { before: beforeId, last: amount };

				const result = await TestModel.findConnections({ field: value }, args);
				expect(result.edges.length).to.equal(amount);
				expect(result.pageInfo.endCursor).to.equal(docs[beforeIndex - 1].relayId);
				expect(result.pageInfo.startCursor).to.equal(docs[beforeIndex - amount].relayId);
				expect(result.pageInfo.hasPreviousPage).to.equal(true);
			});
		});
	});
});
