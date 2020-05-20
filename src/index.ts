import { Document, FilterQuery } from 'mongoose';
import * as mongoose from 'mongoose';

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

export interface EnhancedDocument extends Document {
	relayId: string;
}

export interface EnhancedModel<T extends EnhancedDocument, QueryHelpers = {}> extends mongoose.Model<T, QueryHelpers> {
	findConnections(
		conditions: FilterQuery<T>,
		paginationArgs: PaginationArgs,
		projection?: any | null
	): Promise<ConnectionDocuments<T>>;
}

export const fromRelayId = (id: string): { modelName: string | null; objectId: string | null } => {
	if (!id) {
		return { modelName: null, objectId: null };
	}

	const original = Buffer.from(id, 'base64').toString('utf-8');
	const [modelName, objectId] = original.split('.');
	if (objectId === undefined) {
		return { modelName: null, objectId: null };
	}

	return { modelName, objectId };
};

export class EnhancedModel<T extends EnhancedDocument, QueryHelpers = {}> {
	get relayId() {
		// Ignoring TS errors about `this` access as this is intended paradigm as defined by mongoose documentation:
		// https://mongoosejs.com/docs/guide.html#virtuals
		// eslint-disable-next-line
		// @ts-ignore
		return Buffer.from(`${this.constructor.modelName}.${this._id.toString()}`).toString('base64');
	}

	static async findConnections<T extends Document>(
		conditions: FilterQuery<T>,
		paginationArgs: PaginationArgs,
		projection?: any | null
	): Promise<ConnectionDocuments<T>> {
		const { before, after, first, last } = paginationArgs;
		const { objectId: beforeObjectId } = fromRelayId(before);
		const { objectId: afterObjectId } = fromRelayId(after);
		const idQuery = {
			...(beforeObjectId !== null ? { $lt: mongoose.Types.ObjectId(beforeObjectId) } : {}),
			...(afterObjectId !== null ? { $gt: mongoose.Types.ObjectId(afterObjectId) } : {})
		};

		const query = {
			...conditions,
			...(Object.keys(idQuery).length === 0 ? {} : { _id: idQuery })
		};

		// eslint-disable-next-line
		// @ts-ignore
		const count = await this.find(query).countDocuments();
		// eslint-disable-next-line
		// @ts-ignore
		const dataQuery = this.find(query, projection);

		let hasNextPage = false;
		let hasPreviousPage = false;

		if (first !== undefined && first < count) {
			dataQuery.limit(first);
			hasNextPage = true;
		}

		if (last !== undefined && last < count) {
			dataQuery.skip(count - last);
			hasPreviousPage = true;
			if (hasNextPage) {
				hasNextPage = false;
			}
		}

		const data = await dataQuery;
		const pageInfo = {
			hasNextPage,
			hasPreviousPage,
			...(data.length > 0
				? {
						startCursor: data[0].relayId,
						endCursor: data[data.length - 1].relayId
				  }
				: {})
		};

		return {
			edges: data.map(edge => ({
				cursor: edge.relayId,
				node: edge
			})),
			pageInfo
		};
	}
}
