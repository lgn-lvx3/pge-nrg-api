import axios from "axios";
import type { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as stream from "node:stream";
import { promisify } from "node:util";
import { parse } from "csv-parse";
import type { APIResponse, EnergyEntry } from "../src/Types";
import { CosmosRepository } from "../src/CosmosRepository";
import { Utils } from "../src/Util";

const pipeline = promisify(stream.pipeline);

const httpTrigger: AzureFunction = async (
	context: Context,
	req: HttpRequest,
): Promise<void> => {
	const user = Utils.checkAuthorization(req);

	if (!user) {
		context.res = {
			status: 401,
			body: { message: "Unauthorized" },
		};
		return;
	}

	const preSignedUrl = req.query.url; // Pre-signed S3 URL as a query parameter

	context.log("Uploading CSV from", preSignedUrl);

	if (!preSignedUrl) {
		context.res = {
			status: 400,
			body: {
				message:
					"Please provide a valid S3 pre-signed URL in the 'url' query parameter.",
			} as APIResponse,
		};
		return;
	}

	// validate the url with regex
	if (!preSignedUrl && !preSignedUrl.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)) {
		context.res = {
			status: 400,
			body: {
				message: "Please provide a valid S3 pre-signed URL.",
			} as APIResponse,
		};
		return;
	}

	const dao = new CosmosRepository();

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
						},
						(err, records) => {
							if (err) {
								context.log("err", err);
								callback(new Error(`Parsing error: ${err.message}`));
								return;
							}

							context.log("Parsing ", records.length, " records");

							// for each row, validate the date and usage
							for (const row of records) {
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

							callback(null, records);
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

					context.log(
						"Bulk writing",
						energyEntries.length,
						"items to database",
					);
					// bulk inserting lets you insert 100 files at a time
					// saving 100x the number of calls to the database
					try {
						await dao.bulkInsert(energyEntries);
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

/**
 * @swagger
 * /energy-upload:
 *   post:
 *     summary: Upload and process energy data from a CSV file
 *     description: This endpoint allows you to upload a CSV file containing energy data via a pre-signed S3 URL. The data is processed and stored in the database.
 *     tags:
 *       - Energy Upload
 *     parameters:
 *       - in: query
 *         name: url
 *         schema:
 *           type: string
 *         required: true
 *         description: The pre-signed S3 URL of the CSV file to upload.
 *     responses:
 *       200:
 *         description: CSV file downloaded and processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       400:
 *         description: Bad request. A valid S3 pre-signed URL is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       500:
 *         description: Internal server error. Error processing the CSV file.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 */

export default httpTrigger;
