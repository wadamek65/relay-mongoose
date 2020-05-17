import { Document, FilterQuery, model, Schema } from 'mongoose';
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

export interface EnhancedModel<T extends Document, QueryHelpers = {}> extends mongoose.Model<T, QueryHelpers> {
	prototype: mongoose.Model<T, QueryHelpers>;
	findConnections(
		conditions: FilterQuery<T>,
		paginationArgs: PaginationArgs,
		projection?: any | null
	): Promise<ConnectionDocuments<T>>;
}

export const enhancedModel = <T extends Document, QueryHelpers = {}>(name: string, schema?: Schema, collection?: string,
																																		 skipInit?: boolean
): EnhancedModel<T, QueryHelpers> => {
	const Base: mongoose.Model<T> = mongoose.models[name] || model(name, schema, collection, skipInit);

	// eslint-disable-next-line
	// @ts-ignore
	return class extends Base {
		static findConnections = async (
			conditions: FilterQuery<T>,
			paginationArgs: PaginationArgs,
			projection?: any | null
		): Promise<ConnectionDocuments<T>> => {
			const { before, after, first, last } = paginationArgs;
			const idQuery = {
				...(before !== undefined ? { $lt: mongoose.Types.ObjectId(before) } : {}),
				...(after !== undefined ? { $gt: mongoose.Types.ObjectId(after) } : {})
			};

			const query = {
				...conditions,
				...(Object.keys(idQuery).length === 0 ? {} : { _id: idQuery })
			};

			const count = await Base.find(query).countDocuments();
			const dataQuery = Base.find(query, projection);

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
							startCursor: data[0].id,
							endCursor: data[data.length - 1].id
					  }
					: {})
			};

			return {
				edges: data.map(edge => ({
					cursor: edge.id,
					node: edge
				})),
				pageInfo
			};
		};
	};
};
