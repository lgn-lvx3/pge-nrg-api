import type { EventGridEvent } from "@azure/eventgrid";

// const eventGridTrigger: AzureFunction = async (
// 	context: Context,
// 	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
// 	eventGridEvent: EventGridEvent<any>,
// ): Promise<void> => {
// 	context.log(
// 		"Event Grid trigger function processed an event:",
// 		eventGridEvent,
// 	);
// };

// export default eventGridTrigger;

import axios from "axios";
import type { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as stream from "node:stream";
import { promisify } from "node:util";
import { parse } from "csv-parse";
import type { APIResponse, EnergyEntry } from "../src/Types";
import { CosmosRepository } from "../src/CosmosRepository";
import { Utils } from "../src/Util";
import { BlobServiceClient } from "@azure/storage-blob";

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
	context.log(
		"Event Grid trigger function processed an event:",
		eventGridEvent,
	);

	// Extract container and blob name from the subject
	// The subject format is: /blobServices/default/containers/{containerName}/blobs/{blobName}
	const subjectParts = eventGridEvent.subject.split("/");
	const containerName = subjectParts[4];
	// Combine all remaining parts after 'blobs/' as the blob might contain additional '/'
	const blobName = subjectParts.slice(6).join("/");

	context.log(`Container: ${containerName}, Blob: ${blobName}`);

	// Initialize the blob service client
	const blobServiceClient = BlobServiceClient.fromConnectionString(
		process.env.AzureWebJobsStorage, // This is the default connection string
	);

	// Get container client
	const containerClient = blobServiceClient.getContainerClient(containerName);

	// Get blob client
	const blobClient = containerClient.getBlobClient(blobName);

	try {
		// Get blob properties (including metadata)
		const blobProperties = await blobClient.getProperties();
		context.log("Blob metadata:", blobProperties.metadata);

		// Now you can use the metadata and continue with your existing code
		const preSignedUrl = eventGridEvent.data.url;
		// ... rest of your existing code ...
	} catch (error) {
		context.log.error("Error getting blob metadata:", error);
		throw error;
	}
	// const user = Utils.checkAuthorization(req);

	// if (!user) {
	// 	context.res = {
	// 		status: 401,
	// 		body: { message: "Unauthorized" },
	// 	};
	// 	return;
	// }

	context.log(
		"Event Grid trigger function processed an event:",
		eventGridEvent,
	);

	const preSignedUrl = eventGridEvent.data.url; // Pre-signed S3 URL as a query parameter
	const user = {
		id: "123",
	};

	context.log("Uploading CSV from", preSignedUrl);

	if (!preSignedUrl) {
		// context.res = {
		// 	status: 400,
		// 	body: {
		// 		message:
		// 			"Please provide a valid pre-signed URL in the 'url' query parameter.",
		// 	} as APIResponse,
		// };
		// return;
		context.log.error("No pre-signed URL provided");
		return;
	}

	// validate the url with regex
	if (!preSignedUrl || !preSignedUrl.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)) {
		// context.res = {
		// 	status: 400,
		// 	body: {
		// 		message: "Please provide a valid pre-signed URL.",
		// 	} as APIResponse,
		// };
		context.log.error("Invalid pre-signed URL", preSignedUrl);
		return;
	}

	// const dao = new CosmosRepository();

	try {
		context.log("Downloading and processing the CSV file...");
		// date format: yyyy-mm-dd
		const validDateRegex = /^\d{4}-\d{1,2}-\d{1,2}$/;

		// Fetch the CSV file and process it on the fly
		await pipeline(
			(
				await axios({
					method: "get",
					url: preSignedUrl,
					responseType: "stream",
				})
			).data, // Get the response stream

			// Create a transform stream for parsing
			new stream.Transform({
				objectMode: true,
				transform(chunk, encoding, callback) {
					parse(
						chunk.toString(),
						{
							columns: (header) => header.map((h) => h.trim().toLowerCase()),
							trim: true,
							skip_empty_lines: true,
							// Add these options:
							relax_column_count: true, // Be more forgiving of column count mismatches
							skip_records_with_error: true, // Skip problematic records instead of failing
							delimiter: ",", // Explicitly specify the delimiter
							from_line: 1, // Start from first line
							ltrim: true, // Trim left spaces
							rtrim: true, // Trim right spaces
							quote: '"', // Specify quote character
							escape: '"', // Specify escape character
						},
						(err, records) => {
							if (err) {
								context.log("err", err);
								callback(new Error(`Parsing error: ${err.message}`));
								return;
							}

							context.log("Parsing ", records.length, " records");

							// Add logging to help diagnose issues
							context.log("Parsing ", records.length, " records");

							// Validate records before processing
							const validRecords = records.filter((row) => {
								const { date, "usage(kwh)": usage } = row;
								return date && usage !== undefined;
							});

							if (validRecords.length !== records.length) {
								context.log.warn(
									`Filtered out ${records.length - validRecords.length} invalid records`,
								);
							}

							// for each row, validate the date and usage
							for (const row of validRecords) {
								// lowecase because lowercasing the header
								const { date, "usage(kwh)": usage } = row;

								// Validate Date
								if (!date || !validDateRegex.test(date)) {
									callback(new Error(`Invalid or missing Date: ${date}`));
									return;
								}

								// Validate Usage (kWh)
								if (usage === undefined || usage === "") {
									callback(new Error(`Missing Usage value for Date: ${date}`));
									return;
									// biome-ignore lint/style/noUselessElse: <explanation>
								} else if (Number.isNaN(Number.parseFloat(usage))) {
									callback(
										new Error(
											`Invalid Usage value for Date: ${date}, Value: ${usage}`,
										),
									);
									return;
								}
							}

							callback(null, validRecords);
						},
					);
				},
			}),

			// Custom writable stream to handle rows
			new stream.Writable({
				objectMode: true,
				async write(rows, encoding, callback) {
					context.log("Processing # of rows:", rows.length); // Log or process each row

					// now we write to the database
					const energyEntries: EnergyEntry[] = [];
					for (const row of rows) {
						const energyEntry: EnergyEntry = {
							id: `${user.id}-${row.date}`,
							userId: user.id,
							entryDate: new Date(row.date),
							usage: Number(row["usage(kwh)"]),
							createdAt: new Date(),
							createdType: "upload",
							type: "energyEntry",
						};
						energyEntries.push(energyEntry);
					}

					// context.log(
					// 	"Bulk writing",
					// 	energyEntries.length,
					// 	"items to database",
					// );
					// bulk inserting lets you insert 100 files at a time
					// saving 100x the number of calls to the database
					try {
						// await dao.bulkInsert(energyEntries);
						context.log("Bulk inserting", energyEntries.length, "items");
					} catch (err) {
						callback(new Error(`Error bulk inserting: ${err}`));
						context.log("Error bulk inserting", err);
					}
					callback(); // Signal that the row is processed
				},
			}),
		);

		context.log("CSV processing completed.");

		context.res = {
			status: 200,
			body: {
				message: `CSV file downloaded from ${preSignedUrl} and processed successfully.`,
			} as APIResponse,
		};
	} catch (error) {
		context.res = {
			status: 500,
			body: {
				message: `Error processing the CSV file: ${error.message}`,
			} as APIResponse,
		};
		context.log.error(error);
	}
};

export default eventGridTrigger;
