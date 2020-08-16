import { Document, DocumentQuery, FilterQuery } from 'mongoose';
import * as mongoose from 'mongoose';

export type Cursor = string;

export interface PaginationArgs {
	first?: number | null;
	last?: number | null;
	before?: Cursor | null;
	after?: Cursor | null;
}

export interface Edge<T> {
	cursor: Cursor;
	node: T;
}

export type PageInfo = {
	startCursor?: Cursor;
	endCursor?: Cursor;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
};

export interface ConnectionDocuments<T> {
	edges: Edge<T>[];
	pageInfo: PageInfo;
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

export type DecodedRelayId = { modelName: string | null; objectId: string | null };
export const fromRelayId = (id: string | null | undefined): DecodedRelayId => {
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

const paginate = async <DocType extends EnhancedDocument, QueryHelpers = {}>(
	dataQuery: DocumentQuery<DocType[], DocType, QueryHelpers> & QueryHelpers,
	{ first, last }: PaginationArgs
): Promise<ConnectionDocuments<DocType>> => {
	const pageInfo: PageInfo = {
		hasNextPage: false,
		hasPreviousPage: false
	};3

	let data;
	if (first !== undefined && first !== null) {
		data = await dataQuery
			.sort({ _id: 1 })
			.limit(first + 1)
			.exec();
		if (data.length > first) {
			pageInfo.hasNextPage = true;
			data.pop();
		}
	} else if (last !== undefined && last !== null) {
		data = await dataQuery
			.sort({ _id: -1 })
			.limit(last + 1)
			.exec();
		if (data.length > last) {
			pageInfo.hasPreviousPage = true;
			data.pop();
		}
		data.reverse();
	} else {
		data = await dataQuery.sort({ _id: 1 }).exec();
	}

	if (data.length > 0) {
		pageInfo.startCursor = data[0].relayId;
		pageInfo.endCursor = data[data.length - 1].relayId;
	}

	return {
		edges: data.map(edge => ({
			cursor: edge.relayId,
			node: edge
		})),
		pageInfo
	};
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
		{ before, after, first, last }: PaginationArgs,
		projection?: any | null
	): Promise<ConnectionDocuments<T>> {
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
		const dataQuery = this.find(query, projection);
		return paginate<any>(dataQuery, { first, last });
	}
}

export const findConnections = async <DocType extends EnhancedDocument>(
	documentQuery: DocumentQuery<DocType | DocType[] | null, any>,
	{ before, after, first, last }: PaginationArgs,
	projection?: any | null
): Promise<ConnectionDocuments<DocType>> => {
	const { objectId: beforeObjectId } = fromRelayId(before);
	const { objectId: afterObjectId } = fromRelayId(after);
	const idQuery = {
		...(beforeObjectId !== null ? { $lt: mongoose.Types.ObjectId(beforeObjectId) } : {}),
		...(afterObjectId !== null ? { $gt: mongoose.Types.ObjectId(afterObjectId) } : {})
	};

	const query = {
		...(Object.keys(idQuery).length === 0 ? {} : { _id: idQuery })
	};

	return paginate(documentQuery.find(query, projection), { first, last });
};
