import type { EventGridEvent } from "@azure/eventgrid";
import axios from "axios";
import type { AzureFunction, Context } from "@azure/functions";
import * as stream from "node:stream";
import { promisify } from "node:util";
import { parse } from "csv-parse";
import type { APIResponse, EnergyEntry } from "../src/Types";
import { CosmosRepository } from "../src/CosmosRepository";
import {
	type BlobGetPropertiesResponse,
	BlobServiceClient,
} from "@azure/storage-blob";

// blob storage event grid playload example
// {
// 	topic: '/subscriptions/6787fdad-61e2-47c6-85af-05ebd390cf56/resourceGroups/pge-rg/providers/Microsoft.Storage/storageAccounts/pgeblob',
// 	subject: '/blobServices/default/containers/pge-nrg/blobs/example_2500.csv/example_2500.csv',
// 	eventType: 'Microsoft.Storage.BlobCreated',
// 	id: 'c6eb9f19-b01e-0026-6259-b9655906a971',
// 	data: {
// 	  api: 'PutBlob',
// 	  clientRequestId: 'ae4aedd6-c03a-41b2-a22b-37215ea560c8',
// 	  requestId: 'c6eb9f19-b01e-0026-6259-b96559000000',
// 	  eTag: '0x8DD877043002EF4',
// 	  contentType: 'application/octet-stream',
// 	  contentLength: 39742,
// 	  blobType: 'BlockBlob',
// 	  accessTier: 'Default',
// 	  url: 'https://pgeblob.blob.core.windows.net/pge-nrg/example_2500.csv/example_2500.csv',
// 	  sequencer: '000000000000000000000000000035D900000000003bc0a7',
// 	  storageDiagnostics: { batchId: 'ef95c525-8006-004f-0059-b95c15000000' }
// 	},
// 	dataVersion: '',
// 	metadataVersion: '1',
// 	eventTime: '2025-04-29T22:50:38.6650868Z'
//   }
const pipeline = promisify(stream.pipeline);

const eventGridTrigger: AzureFunction = async (
	context: Context,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	eventGridEvent: EventGridEvent<any>,
): Promise<void> => {
	try {
		context.log("Starting event grid trigger function");
		context.log("Event Grid Event:", JSON.stringify(eventGridEvent, null, 2));

		// Extract container and blob name from the subject
		// The subject format is: /blobServices/default/containers/{containerName}/blobs/{blobName}
		const subjectParts = eventGridEvent.subject.split("/");
		// Combine all remaining parts after 'blobs/' as the blob might contain additional '/'
		const blobName = subjectParts.slice(6).join("/");

		context.log(
			`Container: ${process.env.blob_storage_container_name}, Blob: ${blobName}`,
		);

		// Initialize the blob service client
		context.log("Initializing blob service client");
		const blobServiceClient = BlobServiceClient.fromConnectionString(
			process.env.AzureWebJobsStorage, // This is the default connection string
		);

		// Get container client
		context.log("Getting container client");
		const containerClient = blobServiceClient.getContainerClient(
			process.env.blob_storage_container_name,
		);

		// Get blob client
		context.log("Getting blob client");
		const blobClient = containerClient.getBlobClient(blobName);
		let blobProperties: BlobGetPropertiesResponse;

		try {
			// Get blob properties (including metadata)
			context.log("Fetching blob properties");
			blobProperties = await blobClient.getProperties();
			context.log("Blob properties:", JSON.stringify(blobProperties, null, 2));
		} catch (error) {
			context.log.error("Error getting blob metadata:", error);
			throw error;
		}

		const preSignedUrl = eventGridEvent.data.url; // Pre-signed S3 URL as a query parameter

		if (!preSignedUrl) {
			context.log.error("No pre-signed URL provided");
			return;
		}

		context.log("Processing CSV from URL:", preSignedUrl);

		// validate the url with regex
		if (
			!preSignedUrl ||
			!preSignedUrl.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)
		) {
			context.log.error("Invalid pre-signed URL", preSignedUrl);
			return;
		}

		try {
			context.log("Starting CSV download and processing...");
			const validDateRegex = /^\d{4}-\d{1,2}-\d{1,2}$/;

			// Create a single parser instance outside the transform stream
			const parser = parse({
				columns: (header) => header.map((h) => h.trim().toLowerCase()),
				trim: true,
				skip_empty_lines: true,
				delimiter: ",",
				from_line: 1,
				ltrim: true,
				rtrim: true,
				quote: '"',
				escape: '"',
				bom: true,
			});

			// Set up error handling for the parser
			parser.on("error", (err) => {
				context.log.error("Parser error:", err);
			});

			// Set up batch array and batch size
			const batch: EnergyEntry[] = [];
			const BATCH_SIZE = 100;
			const dao = new CosmosRepository();

			context.log("Starting pipeline processing");
			await pipeline(
				(
					await axios({
						method: "get",
						url: preSignedUrl,
						responseType: "stream",
					})
				).data,
				parser,
				new stream.Writable({
					objectMode: true,
					async write(row, encoding, callback) {
						try {
							// Validate the row
							if (!row || typeof row !== "object") {
								context.log.warn(
									`Skipping invalid row: ${JSON.stringify(row)}`,
								);
								return callback();
							}

							const date = row.date;
							const usage = row["usage(kwh)"];
							const usageNum = Number.parseFloat(usage);

							if (!date || !validDateRegex.test(date)) {
								context.log.warn(
									`Skipping row with invalid date: ${JSON.stringify(row)}`,
								);
								return callback();
							}
							if (
								usage === undefined ||
								usage === "" ||
								Number.isNaN(usageNum)
							) {
								context.log.warn(
									`Skipping row with invalid usage: ${JSON.stringify(row)}`,
								);
								return callback();
							}

							const energyEntry: EnergyEntry = {
								id: `${blobProperties.metadata.userid}-${date}`,
								userId: blobProperties.metadata.userid,
								entryDate: new Date(date),
								usage: usageNum,
								createdAt: new Date(),
								createdType: "upload",
								type: "energyEntry",
							};

							batch.push(energyEntry);

							// If batch is full, insert and clear
							if (batch.length >= BATCH_SIZE) {
								try {
									context.log(`Bulk inserting batch of ${batch.length} items`);
									await dao.bulkInsert(batch);
									batch.length = 0; // Clear batch
								} catch (err) {
									context.log.error("Error bulk inserting", err);
									return callback(err);
								}
							}
							callback();
						} catch (error) {
							context.log.error("Error processing row:", error);
							callback(error);
						}
					},
					// When the stream ends, flush any remaining records
					async final(callback) {
						try {
							if (batch.length > 0) {
								context.log(
									`Bulk inserting final batch of ${batch.length} items`,
								);
								await dao.bulkInsert(batch);
								batch.length = 0;
							}
							callback();
						} catch (err) {
							context.log.error("Error bulk inserting final batch", err);
							callback(err);
						}
					},
				}),
			);

			context.log("CSV processing completed successfully");

			context.res = {
				status: 200,
				body: {
					message: `CSV file downloaded from ${preSignedUrl} and processed successfully.`,
				} as APIResponse,
			};
		} catch (error) {
			context.log.error("Error in CSV processing pipeline:", error);
			throw error;
		}
	} catch (error) {
		context.log.error("Unhandled error in event grid trigger:", error);
		context.res = {
			status: 500,
			body: {
				message: `Error processing the CSV file: ${error.message}`,
			} as APIResponse,
		};
	}
};

export default eventGridTrigger;
