// biome-ignore lint/style/useImportType: <explanation>
import {
	BulkOperationType,
	CosmosClient,
	SqlQuerySpec,
	UpsertOperationInput,
} from "@azure/cosmos";

/**
 * @description Sets up each cosmos client with the correct endpoint and key, depending on if testing mode
 * @author Logan Hendershot
 * @date 05/16/2023
 * @export
 * @class CosmosDao
 */
export class CosmosRepository {
	// testing client vs. production (or dev) client. testing client used locally
	public client: CosmosClient;
	public databaseId: string;
	public containerId: string;

	/**
	 * Creates an instance of CosmosDao, given the containerId
	 * @param {string} containerId
	 * @memberof CosmosDao
	 */
	constructor(containerId = "energy") {
		// endpoint and key are different for testing mode, if testing use testing_db_url
		const endpoint = process.env.cosmos_db_host;

		// set up cosmos client with testing mode or production/dev
		const key = process.env.cosmos_auth_key;

		this.databaseId = process.env.cosmos_db_id;

		this.client = new CosmosClient({
			endpoint: endpoint,
			key: key,
		});

		this.containerId = containerId;
	}

	async find<T>(querySpec: SqlQuerySpec): Promise<Array<T>> {
		if (!querySpec) {
			throw new Error("Query not specified.");
		}

		const { resources } = await this.client
			.database(this.databaseId)
			.container(this.containerId)
			.items.query(querySpec)
			.fetchAll();
		return resources;
	}

	async addItem<T>(item: T): Promise<T> {
		const { resource: doc } = await this.client
			.database(this.databaseId)
			.container(this.containerId)
			.items.upsert<T>(item);
		return doc;
	}

	async updateItem<T>(itemId: string, item: T): Promise<T> {
		const { resource: replaced } = await this.client
			.database(this.databaseId)
			.container(this.containerId)
			.item(itemId, itemId)
			.replace(item);
		return replaced;
	}

	/**
	 * Returns undefined if item doesn't exist
	 *
	 * @returns {Promise<unknown>}
	 * @memberof CosmosDao
	 */
	async getItem<T>(itemId: string): Promise<T> {
		try {
			const { resource: retrieved } = await this.client
				.database(this.databaseId)
				.container(this.containerId)
				.item(itemId, itemId)
				.read();
			return retrieved;
		} catch (err) {
			console.log(err);
			return undefined;
		}
	}

	async deleteItem(itemId: string): Promise<void> {
		try {
			const { resource: deleted } = await this.client
				.database(this.databaseId)
				.container(this.containerId)
				.item(itemId, itemId)
				.delete();
			return deleted;
		} catch (err) {
			console.log(err);
		}
	}

	/**
	 * Bulk inserts items into the database
	 * @param {T[]} items - The items to insert
	 * @returns {Promise<void>}
	 * @author Logan Hendershot
	 * @date 01/06/2025
	 */
	async bulkInsert<T extends { id: string }>(items: T[]): Promise<void> {
		const batchSize = 100;
		const operations: UpsertOperationInput[] = [];
		// loop through each passed item, build an operation for each
		for (const item of items) {
			operations.push({
				operationType: BulkOperationType.Upsert,
				resourceBody: item,
			});
		}

		console.log("Bulk inserting", items.length, "items");

		// cosmos has a limit of 100 operations per batch
		// loop through the operations in batches of 100 by setting i to 0 and incrementing by 100
		for (let i = 0; i < operations.length; i += batchSize) {
			// get the next 100 operations by slicing the array from i to i + 100 aka a batch
			const batch = operations.slice(i, i + batchSize);
			console.log("Bulk inserting batch", i, "of", operations.length);
			// send the batch to cosmos
			await this.client
				.database(this.databaseId)
				.container(this.containerId)
				.items.bulk(batch);
		}
	}
}
