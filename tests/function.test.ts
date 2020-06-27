import * as chai from 'chai';
import * as mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ConnectionDocuments, EnhancedDocument, EnhancedModel, findConnections } from '../src';

const expect = chai.expect;

export interface TestSchemaInterface extends EnhancedDocument {
	field: string;
}

const testSchema = new mongoose.Schema({
	field: String
});

const resultCompare = (
	classResult: ConnectionDocuments<TestSchemaInterface>,
	functionResult: ConnectionDocuments<TestSchemaInterface>
) => {
	expect(classResult.pageInfo.hasPreviousPage).to.equal(functionResult.pageInfo.hasPreviousPage);
	expect(classResult.pageInfo.hasNextPage).to.equal(functionResult.pageInfo.hasNextPage);
	expect(classResult.pageInfo.endCursor).to.equal(functionResult.pageInfo.endCursor);
	expect(classResult.pageInfo.startCursor).to.equal(functionResult.pageInfo.startCursor);
	expect(classResult.edges.length).to.equal(functionResult.edges.length);

	for (let i = 0; i < classResult.edges.length; i++) {
		expect(classResult.edges[i].cursor).to.equal(functionResult.edges[i].cursor);
		expect(classResult.edges[i].node.field).to.equal(functionResult.edges[i].node.field);
		expect(classResult.edges[i].node.id).to.equal(functionResult.edges[i].node.id);
		expect(classResult.edges[i].node.relayId).to.equal(functionResult.edges[i].node.relayId);
	}
};

describe('relay-mongoose tests', () => {
	let TestModel: EnhancedModel<TestSchemaInterface>;
	let mongo;
	let docs;
	const value = 'test';

	beforeEach(async () => {
		mongo = new MongoMemoryServer();
		await mongoose.connect(await mongo.getUri());
		testSchema.loadClass(EnhancedModel);
		TestModel = mongoose.model('function-test', testSchema) as any;
		docs = [...Array(15)].map(() => new TestModel({ field: value }));
		await TestModel.insertMany(docs);
	});

	afterEach(async () => {
		await mongoose.disconnect();
		await mongo.stop();
	});

	describe('findConnections function same result tests', () => {
		it('should return everything', async () => {
			const doc = { field: value };
			const paginationArgs = {};
			const classResult = await TestModel.findConnections(doc, paginationArgs);
			const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
			resultCompare(classResult, functionResult);
		});

		it('should return first 5 edges correctly', async () => {
			const amount = 5;
			const paginationArgs = {
				first: amount
			};
			const doc = { field: value };
			const classResult = await TestModel.findConnections(doc, paginationArgs);
			const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
			resultCompare(classResult, functionResult);
		});

		it('should return last 5 edges correctly', async () => {
			const paginationArgs = { last: 5 };
			const doc = { field: value };
			const classResult = await TestModel.findConnections(doc, paginationArgs);
			const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
			resultCompare(classResult, functionResult);
		});

		it('should return edges before and after cursors', async () => {
			const paginationArgs = { after: docs[5].relayId, before: docs[10].relayId };
			const doc = { field: value };
			const classResult = await TestModel.findConnections(doc, paginationArgs);
			const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
			resultCompare(classResult, functionResult);
		});

		describe('after tests', () => {
			// We do not check for hasPreviousPage as it isn't specified as mandatory in the PageInfo spec
			// https://relay.dev/graphql/connections.htm#note-a97ec

			it('should return all edges after cursor', async () => {
				const paginationArgs = { after: docs[5 - 1].relayId };
				const doc = { field: value };
				const classResult = await TestModel.findConnections(doc, paginationArgs);
				const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
				resultCompare(classResult, functionResult);
			});

			it('should return first 5 edges after cursor', async () => {
				const amount = 5;
				const paginationArgs = { after: docs[amount - 1].relayId, first: amount };
				const doc = { field: value };
				const classResult = await TestModel.findConnections(doc, paginationArgs);
				const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
				resultCompare(classResult, functionResult);
			});

			it('should return last 5 edges after cursor', async () => {
				const amount = 5;
				const paginationArgs = { after: docs[amount - 1].relayId, last: amount };
				const doc = { field: value };
				const classResult = await TestModel.findConnections(doc, paginationArgs);
				const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
				resultCompare(classResult, functionResult);
			});
		});

		describe('before tests', () => {
			// We do not check for hasNextPage as it isn't specified as mandatory in the PageInfo spec
			// https://relay.dev/graphql/connections.htm#note-a97ec

			it('should return all edges before cursor', async () => {
				const paginationArgs = { before: docs[5].relayId };
				const doc = { field: value };
				const classResult = await TestModel.findConnections(doc, paginationArgs);
				const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
				resultCompare(classResult, functionResult);
			});

			it('should return first 5 edges before cursor', async () => {
				const beforeId = docs[10].relayId;
				const paginationArgs = { before: beforeId, first: 5 };
				const doc = { field: value };
				const classResult = await TestModel.findConnections(doc, paginationArgs);
				const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
				resultCompare(classResult, functionResult);
			});

			it('should return last 5 edges before cursor', async () => {
				const beforeId = docs[10].relayId;
				const paginationArgs = { before: beforeId, last: 5 };
				const doc = { field: value };
				const classResult = await TestModel.findConnections(doc, paginationArgs);
				const functionResult = await findConnections(TestModel.find(doc), paginationArgs);
				resultCompare(classResult, functionResult);
			});
		});
	});
});
